/**
 * 데모 실시간 백엔드 — 랜덤 매칭 큐, 대기방, 게임 세션을 브라우저 안에서 시뮬레이션한다.
 *
 * 매칭 큐는 실제 백엔드(`MatchmakingEntryRepository`)의 Redis 설계를 자료구조 수준에서 그대로 옮겼다.
 *   - 큐: 게임별 Sorted Set(member=참가자 키, score=최초 신청 시각). 재신청은 score를 덮어쓰지 않는다(ZADD NX).
 *   - 상태: 참가자별 entry(Hash). entry가 있으면 중복 신청(ALREADY_IN_QUEUE).
 *   - 성사: 대기 순서가 빠른 2명을 한 번에 꺼내(ZPOPMIN) MATCHING으로 예약 → 방 생성 → ENTERING_ROOM 확정.
 *     방 생성에 실패하면 원래 score로 되돌려 대기 순서를 보존한다(보상).
 *
 * 상대는 "데모 봇"이다. 신청 1~2초 뒤 봇이 같은 큐에 들어와 같은 알고리즘으로 짝이 지어진다.
 * 대기방·게임 세션 WebSocket 프레임은 `src/types/waitingRoom.ts`, `gameSession.ts`, `matchmaking.ts` 계약을 따른다.
 */
import type { GameName, RoomType } from '../types/waitingRoom'
import type { MatchStatus } from '../types/matchmaking'
import { nowIso, randomUuid, type DemoStore } from './store'
import { DEMO_UNSUPPORTED_CODE, DemoApiError, parseAccessToken, type DemoRestBackend, type Identity } from './rest'

const GAME_NAMES: GameName[] = ['EYEFIGHT', 'BLINK', 'DRAWING', 'RHYTHM', 'HOCKEY']
/** 데모 봇이 상대할 수 있는 게임. 에어하키는 퍽 물리 동기화가 필요해 실제 서버에서만 지원한다. */
const BOT_SUPPORTED: GameName[] = ['EYEFIGHT', 'BLINK', 'RHYTHM']
const BOT_KEY = 'BOT:demo-bot'
const BOT_NAME = '데모 봇'
const MATCH_SIZE = 2
const COUNTDOWN_MS = 3000

// --- 매칭 큐 (Redis Sorted Set + Hash 모사) ---

interface QueueMember {
  participantKey: string
  score: number
}

interface MatchEntry {
  participantKey: string
  gameType: GameName
  matchStatus: MatchStatus
  waitingRoomId: string | null
  queuedAt: number
  statusChangedAt: number
  matchAttemptId: string | null
}

const queues = new Map<GameName, QueueMember[]>()
const entries = new Map<string, MatchEntry>()

function queueOf(gameType: GameName): QueueMember[] {
  let queue = queues.get(gameType)
  if (!queue) {
    queue = []
    queues.set(gameType, queue)
  }
  return queue
}

/** ZADD NX — 이미 있는 member의 score(최초 신청 시각)는 바꾸지 않는다. */
function zaddNx(gameType: GameName, participantKey: string, score: number): void {
  const queue = queueOf(gameType)
  if (queue.some((member) => member.participantKey === participantKey)) return
  queue.push({ participantKey, score })
  queue.sort((a, b) => a.score - b.score)
}

function zrem(participantKey: string): void {
  for (const queue of queues.values()) {
    const index = queue.findIndex((member) => member.participantKey === participantKey)
    if (index !== -1) queue.splice(index, 1)
  }
}

/** ZPOPMIN key count — 대기 순서가 빠른 후보를 원자적으로 꺼낸다. entry가 없거나 SEARCHING이 아닌 유령은 버린다. */
function popCandidates(gameType: GameName, count: number): MatchEntry[] {
  const queue = queueOf(gameType)
  const candidates: MatchEntry[] = []
  let attempts = 0
  while (candidates.length < count && queue.length > 0 && attempts < 5) {
    attempts += 1
    const popped = queue.splice(0, count - candidates.length)
    for (const member of popped) {
      const entry = entries.get(member.participantKey)
      if (entry && entry.matchStatus === 'SEARCHING') candidates.push(entry)
    }
  }
  return candidates
}

function enqueue(participantKey: string, gameType: GameName): boolean {
  if (entries.has(participantKey)) return false
  const now = Date.now()
  zaddNx(gameType, participantKey, now)
  entries.set(participantKey, {
    participantKey,
    gameType,
    matchStatus: 'SEARCHING',
    waitingRoomId: null,
    queuedAt: now,
    statusChangedAt: now,
    matchAttemptId: null,
  })
  return true
}

function tryMatch(gameType: GameName): void {
  const reserved = popCandidates(gameType, MATCH_SIZE)
  if (reserved.length < MATCH_SIZE) {
    // 짝을 채우지 못하면 원래 순서로 되돌린다(queuedAt 보존).
    reserved.forEach((entry) => zaddNx(gameType, entry.participantKey, entry.queuedAt))
    return
  }

  const matchAttemptId = randomUuid()
  const now = Date.now()
  reserved.forEach((entry) => {
    entry.matchStatus = 'MATCHING'
    entry.matchAttemptId = matchAttemptId
    entry.statusChangedAt = now
  })

  const room = createRoom('RANDOM', gameType, reserved.map((entry) => entry.participantKey))
  if (!room) {
    // 보상: 현재 시각 기준으로 다시 SEARCHING 등록
    reserved.forEach((entry) => {
      entry.matchStatus = 'SEARCHING'
      entry.matchAttemptId = null
      entry.queuedAt = Date.now()
      zaddNx(gameType, entry.participantKey, entry.queuedAt)
    })
    return
  }

  reserved.forEach((entry) => {
    entry.matchStatus = 'ENTERING_ROOM'
    entry.waitingRoomId = room.roomId
    entry.statusChangedAt = Date.now()
    notifyMatched(entry.participantKey, room.roomId, gameType)
  })
}

function toMatchStatusResponse(entry: MatchEntry, identity: Identity, matchStatus?: MatchStatus) {
  const guestSessionId = identity.participantType === 'GUEST'
    ? identity.participantKey.slice('GUEST:'.length)
    : undefined
  return {
    participantKey: entry.participantKey,
    gameType: entry.gameType,
    matchStatus: matchStatus ?? entry.matchStatus,
    waitingRoomId: entry.waitingRoomId,
    queuedAt: new Date(entry.queuedAt).toISOString(),
    ...(guestSessionId ? { guestSessionId, guestNickname: identity.displayName } : {}),
  }
}

function resolveGameType(raw: string): GameName {
  const upper = raw.toUpperCase()
  const found = GAME_NAMES.find((name) => name === upper)
  if (!found) throw new DemoApiError(400, 'MATCHMAKING-002', '지원하지 않는 게임 종류예요.')
  return found
}

function assertBotSupported(gameType: GameName): void {
  if (!BOT_SUPPORTED.includes(gameType)) {
    throw new DemoApiError(
      400,
      DEMO_UNSUPPORTED_CODE,
      '에어하키 대결은 실시간 퍽 동기화가 필요해 라이브 데모에서는 지원하지 않아요. AI 대결로 체험하거나, 눈싸움·눈 깜빡이기·리듬 게임에서 데모 봇과 대결해 보세요.',
    )
  }
}

// --- REST 진입점 (rest.ts가 호출) ---

export function joinMatch(identity: Identity, gameTypeRaw: string) {
  const gameType = resolveGameType(gameTypeRaw)
  assertBotSupported(gameType)

  const existing = entries.get(identity.participantKey)
  if (existing) {
    // 실제 서버는 ALREADY_IN_QUEUE(409). 데모는 화면 재진입이 잦아 현재 상태를 그대로 돌려준다.
    return toMatchStatusResponse(existing, identity)
  }

  enqueue(identity.participantKey, gameType)
  tryMatch(gameType)

  // 데모 봇이 잠시 뒤 같은 큐에 들어온다 → 같은 알고리즘으로 성사.
  const delayMs = 1200 + Math.random() * 1000
  setTimeout(() => {
    const entry = entries.get(identity.participantKey)
    if (!entry || entry.matchStatus !== 'SEARCHING') return
    if (!entries.has(BOT_KEY)) enqueue(BOT_KEY, gameType)
    tryMatch(gameType)
  }, delayMs)

  return toMatchStatusResponse(entries.get(identity.participantKey)!, identity)
}

export function cancelMatch(identity: Identity) {
  const entry = entries.get(identity.participantKey)
  if (!entry) throw new DemoApiError(404, 'MATCHMAKING-003', '진행 중인 매칭 신청이 없어요.')
  if (entry.matchStatus !== 'SEARCHING') {
    throw new DemoApiError(409, 'MATCHMAKING-004', '이미 매칭이 성사되어 취소할 수 없어요.')
  }
  zrem(identity.participantKey)
  entries.delete(identity.participantKey)
  return toMatchStatusResponse(entry, identity, 'CANCELLED')
}

export function createInviteRoom(identity: Identity, gameNameRaw: string) {
  const gameName = resolveGameType(gameNameRaw)
  assertBotSupported(gameName)
  const room = createRoom('INVITE', gameName, [identity.participantKey], identity.displayName)
  if (!room) throw new DemoApiError(500, 'WAITING-003', '대기방을 만들지 못했어요.')

  // 봇이 2~3초 뒤 참가한다.
  setTimeout(() => {
    const current = rooms.get(room.roomId)
    if (!current || current.roomStatus !== 'WAITING' || current.participants.length >= 2) return
    current.participants.push(makeParticipant(BOT_KEY, BOT_NAME, 'PLAYER', 2))
    broadcastRoomState(current)
    scheduleBotReady(current)
  }, 2000 + Math.random() * 1000)

  const guestSessionId = identity.participantType === 'GUEST'
    ? identity.participantKey.slice('GUEST:'.length)
    : undefined
  return {
    roomId: room.roomId,
    roomType: room.roomType,
    gameName: room.gameName,
    roomCode: room.roomCode,
    roomStatus: room.roomStatus,
    participant: room.participants[0],
    ...(guestSessionId ? { guestSessionId, guestNickname: identity.displayName } : {}),
    openviduUrl: null,
    token: null,
  }
}

export function joinInviteRoom(_identity: Identity, roomCode: string) {
  const room = [...rooms.values()].find(
    (candidate) => candidate.roomType === 'INVITE' && candidate.roomCode === roomCode.trim(),
  )
  if (!room) {
    throw new DemoApiError(
      404,
      'WAITING-004',
      '라이브 데모에서는 다른 사람의 방에 들어갈 수 없어요. "방 만들기"로 데모 봇과 대결해 보세요.',
    )
  }
  throw new DemoApiError(
    409,
    'WAITING-006',
    '이 방은 이미 이 화면에서 참여 중이에요. 데모에서는 방 만들기만 지원해요.',
  )
}

export function leaveRoom(identity: Identity, roomId: string): void {
  const room = rooms.get(roomId)
  if (room) {
    room.participants = room.participants.filter(
      (participant) => participant.participantKey !== identity.participantKey,
    )
    if (room.participants.length === 0 || !room.participants.some((p) => p.participantKey !== BOT_KEY)) {
      destroyRoom(room)
    }
  }
  const entry = entries.get(identity.participantKey)
  if (entry && entry.waitingRoomId === roomId) {
    entries.delete(identity.participantKey)
    zrem(identity.participantKey)
  }
  if (entries.get(BOT_KEY)?.waitingRoomId === roomId) {
    entries.delete(BOT_KEY)
    zrem(BOT_KEY)
  }
}

export function resetRealtime(): void {
  queues.clear()
  entries.clear()
  rooms.forEach((room) => destroyRoom(room))
  rooms.clear()
  matchSockets.clear()
}

// --- 대기방 ---

interface Participant {
  participantKey: string
  displayName: string
  roomRole: 'HOST' | 'PLAYER'
  slotNo: number
  isReady: boolean
  calibrationStatus: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED'
  joinedAt: string
}

interface Room {
  roomId: string
  roomType: RoomType
  gameName: GameName
  roomCode: string
  roomStatus: 'WAITING' | 'COUNTDOWN' | 'IN_GAME' | 'CLOSED'
  countdownEndsAt: string | null
  participants: Participant[]
  createdAt: string
  waitingSockets: Map<string, DemoSocket>
  sessionSockets: Map<string, DemoSocket>
  timers: ReturnType<typeof setTimeout>[]
  bot: BotRunner | null
}

const rooms = new Map<string, Room>()
const matchSockets = new Map<string, DemoSocket>()

function makeParticipant(
  participantKey: string,
  displayName: string,
  roomRole: 'HOST' | 'PLAYER',
  slotNo: number,
): Participant {
  const isBot = participantKey === BOT_KEY
  return {
    participantKey,
    displayName,
    roomRole,
    slotNo,
    isReady: false,
    calibrationStatus: isBot ? 'COMPLETED' : 'PENDING',
    joinedAt: nowIso(),
  }
}

function createRoom(
  roomType: RoomType,
  gameName: GameName,
  participantKeys: string[],
  hostDisplayName?: string,
): Room | null {
  const roomId = randomUuid()
  const room: Room = {
    roomId,
    roomType,
    gameName,
    roomCode: String(1000 + Math.floor(Math.random() * 9000)),
    roomStatus: 'WAITING',
    countdownEndsAt: null,
    participants: participantKeys.map((key, index) =>
      makeParticipant(
        key,
        key === BOT_KEY ? BOT_NAME : hostDisplayName ?? displayNameOf(key),
        roomType === 'INVITE' && index === 0 ? 'HOST' : 'PLAYER',
        index + 1,
      ),
    ),
    createdAt: nowIso(),
    waitingSockets: new Map(),
    sessionSockets: new Map(),
    timers: [],
    bot: null,
  }
  rooms.set(roomId, room)
  if (room.participants.some((participant) => participant.participantKey === BOT_KEY)) {
    scheduleBotReady(room)
  }
  return room
}

let storeRef: DemoStore | null = null

function displayNameOf(participantKey: string): string {
  if (participantKey.startsWith('GUEST:')) return '게스트 플레이어'
  if (participantKey.startsWith('USER:')) {
    const user = storeRef?.findUser(Number(participantKey.slice(5)))
    return user?.nickname ?? '플레이어'
  }
  return '플레이어'
}

function destroyRoom(room: Room): void {
  room.timers.forEach((timer) => clearTimeout(timer))
  room.timers = []
  room.bot?.stop()
  room.bot = null
  rooms.delete(room.roomId)
}

function roomStateFrame(room: Room): string {
  return JSON.stringify({
    type: 'ROOM_STATE',
    data: {
      roomId: room.roomId,
      roomType: room.roomType,
      gameName: room.gameName,
      roomCode: room.roomCode,
      roomStatus: room.roomStatus,
      countdownEndsAt: room.countdownEndsAt,
      participants: room.participants.map((participant) => ({ ...participant })),
      createdAt: room.createdAt,
    },
  })
}

function broadcastRoomState(room: Room): void {
  const frame = roomStateFrame(room)
  room.waitingSockets.forEach((socket) => socket.serverSend(frame))
}

function scheduleBotReady(room: Room): void {
  const timer = setTimeout(() => {
    const bot = room.participants.find((participant) => participant.participantKey === BOT_KEY)
    if (!bot || room.roomStatus !== 'WAITING') return
    bot.isReady = true
    bot.calibrationStatus = 'COMPLETED'
    broadcastRoomState(room)
    maybeAutoStart(room)
  }, 1500 + Math.random() * 1000)
  room.timers.push(timer)
}

/** RANDOM 방은 호스트가 없어, 전원이 준비·캘리브레이션을 마치면 서버가 카운트다운을 시작한다. */
function maybeAutoStart(room: Room): void {
  if (room.roomType !== 'RANDOM' || room.roomStatus !== 'WAITING') return
  if (room.participants.length < 2) return
  const allReady = room.participants.every(
    (participant) => participant.isReady && participant.calibrationStatus === 'COMPLETED',
  )
  if (allReady) startCountdown(room)
}

function startCountdown(room: Room): void {
  if (room.roomStatus !== 'WAITING') return
  room.roomStatus = 'COUNTDOWN'
  room.countdownEndsAt = new Date(Date.now() + COUNTDOWN_MS).toISOString()
  broadcastRoomState(room)

  const timer = setTimeout(() => {
    if (room.roomStatus !== 'COUNTDOWN') return
    room.roomStatus = 'IN_GAME'
    room.countdownEndsAt = null
    const startedAt = nowIso()
    const frame = JSON.stringify({
      type: 'GAME_START',
      data: {
        roomId: room.roomId,
        gameName: room.gameName,
        startedAt,
        // 미디어 서버(OpenVidu/LiveKit)는 실제 배포에서만 — 데모는 상대 캠 공유 없이 진행한다.
        openviduUrl: null,
        token: null,
      },
    })
    room.waitingSockets.forEach((socket) => socket.serverSend(frame))
    // 매칭 entry는 경기 시작으로 역할을 마쳤다(실서버는 IN_GAME 완료 후 compare-delete).
    room.participants.forEach((participant) => {
      const entry = entries.get(participant.participantKey)
      if (entry?.waitingRoomId === room.roomId) {
        entries.delete(participant.participantKey)
        zrem(participant.participantKey)
      }
    })
  }, COUNTDOWN_MS)
  room.timers.push(timer)
}

function handleWaitingCommand(room: Room, participantKey: string, frame: Record<string, unknown>): void {
  const me = room.participants.find((participant) => participant.participantKey === participantKey)
  if (!me) return

  switch (frame.type) {
    case 'CALIBRATION_STATUS': {
      const status = frame.calibrationStatus
      if (status === 'IN_PROGRESS' || status === 'COMPLETED' || status === 'PENDING') {
        me.calibrationStatus = status
      }
      broadcastRoomState(room)
      maybeAutoStart(room)
      return
    }
    case 'READY_STATUS':
      me.isReady = frame.isReady === true
      broadcastRoomState(room)
      maybeAutoStart(room)
      return
    case 'START_GAME': {
      if (me.roomRole !== 'HOST' && room.roomType === 'INVITE') return
      const allSet =
        room.participants.length === 2 &&
        room.participants.every(
          (participant) =>
            participant.calibrationStatus === 'COMPLETED' &&
            (participant.roomRole === 'HOST' || participant.isReady),
        )
      if (allSet) startCountdown(room)
      return
    }
    default:
      return
  }
}

// --- 게임 세션 + 데모 봇 ---

interface BotRunner {
  stop: () => void
  onHumanEvent: (eventType: string, payload: Record<string, unknown> | undefined) => void
}

function sessionStateFrame(room: Room): string {
  return JSON.stringify({
    type: 'SESSION_STATE',
    data: {
      roomId: room.roomId,
      gameName: room.gameName,
      participants: room.participants.map((participant) => ({ ...participant })),
    },
  })
}

function playerEventFrame(eventType: string, payload: Record<string, unknown> | null): string {
  return JSON.stringify({
    type: 'PLAYER_EVENT',
    data: { participantKey: BOT_KEY, eventType, payload, occurredAt: nowIso() },
  })
}

function startBot(room: Room, send: (frame: string) => void): BotRunner {
  const timers: ReturnType<typeof setTimeout>[] = []
  let stopped = false
  let finished = false

  const later = (ms: number, fn: () => void) => {
    const timer = setTimeout(() => {
      if (!stopped) fn()
    }, ms)
    timers.push(timer)
  }
  const finish = () => {
    if (finished || stopped) return
    finished = true
    send(playerEventFrame('GAME_OVER', null))
  }

  if (room.gameName === 'BLINK') {
    // 눈 깜빡이기: 초당 3~5회 정도 깜빡이는 상대. 사람이 끝내면 함께 끝낸다.
    let count = 0
    const tick = () => {
      if (finished) return
      count += 1
      send(playerEventFrame('BLINK_COUNT', { count }))
      later(180 + Math.random() * 160, tick)
    }
    later(800, tick)
    later(90_000, finish)
  } else if (room.gameName === 'EYEFIGHT') {
    // 눈싸움: 12~40초 사이 어느 순간 눈을 감아 패배한다. 사람이 먼저 감으면 승리로 마무리.
    const start = Date.now()
    const loseAt = 12_000 + Math.random() * 28_000
    const tick = () => {
      if (finished) return
      const elapsedMs = Date.now() - start
      if (elapsedMs >= loseAt) {
        send(playerEventFrame('STARE_STATE', { elapsedMs, lost: true }))
        later(300, finish)
        return
      }
      send(playerEventFrame('STARE_STATE', { elapsedMs, lost: false }))
      later(150, tick)
    }
    later(400, tick)
  } else if (room.gameName === 'RHYTHM') {
    // 리듬 게임: 대체로 맞추고 가끔 놓치는 상대. 체력은 1 아래로 내려가지 않는다.
    let score = 0
    let combo = 0
    let health = 5
    const tick = () => {
      if (finished) return
      if (Math.random() < 0.82) {
        combo += 1
        score += 80 + Math.floor(Math.random() * 80) + Math.min(combo, 10) * 5
      } else {
        combo = 0
        if (health > 1 && Math.random() < 0.35) health -= 1
      }
      send(playerEventFrame('RHYTHM_STATE', { score, combo, health }))
      later(650 + Math.random() * 150, tick)
    }
    later(900, tick)
    later(120_000, finish)
  }

  return {
    stop: () => {
      stopped = true
      timers.forEach((timer) => clearTimeout(timer))
    },
    onHumanEvent: (eventType, payload) => {
      if (eventType === 'GAME_OVER') {
        later(200, finish)
      } else if (eventType === 'STARE_STATE' && payload?.lost === true) {
        later(200, finish)
      }
    },
  }
}

// --- WebSocket 모사 ---

type Listener = (event: Event) => void

/**
 * 브라우저 `WebSocket`과 같은 표면(onopen/onmessage/onclose/onerror, send/close, readyState)을 가진 가짜 소켓.
 * 서버 쪽 동작은 `serverSend`/`serverClose`로 흘려 넣는다.
 */
class DemoSocket {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSING = 2
  static readonly CLOSED = 3

  readonly url: string
  readyState = DemoSocket.CONNECTING
  protocol = ''
  extensions = ''
  binaryType: 'blob' | 'arraybuffer' = 'blob'
  bufferedAmount = 0
  onopen: ((event: Event) => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  onclose: ((event: CloseEvent) => void) | null = null

  private readonly listeners = new Map<string, Set<Listener>>()
  private readonly path: string
  private participantKey: string | null = null
  private room: Room | null = null
  private role: 'match' | 'waiting' | 'session' | null = null

  constructor(url: string) {
    this.url = url
    this.path = new URL(url, globalThis.location.origin).pathname
    setTimeout(() => this.open(), 20)
  }

  addEventListener(type: string, listener: Listener): void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set())
    this.listeners.get(type)!.add(listener)
  }

  removeEventListener(type: string, listener: Listener): void {
    this.listeners.get(type)?.delete(listener)
  }

  dispatchEvent(event: Event): boolean {
    this.listeners.get(event.type)?.forEach((listener) => listener(event))
    return true
  }

  send(raw: string): void {
    if (this.readyState !== DemoSocket.OPEN) return
    let frame: Record<string, unknown>
    try {
      frame = JSON.parse(raw) as Record<string, unknown>
    } catch {
      return
    }
    if (frame.type === 'AUTH') {
      this.authenticate(frame)
      return
    }
    if (!this.participantKey) return

    if (this.role === 'waiting' && this.room) {
      handleWaitingCommand(this.room, this.participantKey, frame)
    } else if (this.role === 'session' && this.room && frame.type === 'PLAYER_EVENT') {
      this.room.bot?.onHumanEvent(
        String(frame.eventType ?? ''),
        frame.payload as Record<string, unknown> | undefined,
      )
    }
  }

  close(): void {
    if (this.readyState === DemoSocket.CLOSED) return
    this.readyState = DemoSocket.CLOSED
    this.detach()
    // 클라이언트가 닫은 소켓에는 close 이벤트를 다시 쏘지 않는다(브라우저와 동일하게 비동기로 한 번만).
    setTimeout(() => this.emitClose(1000), 0)
  }

  /** 서버 → 클라이언트 메시지. */
  serverSend(data: string): void {
    if (this.readyState !== DemoSocket.OPEN) return
    const event = new MessageEvent('message', { data })
    this.onmessage?.(event)
    this.dispatchEvent(event)
  }

  serverClose(code = 1000): void {
    if (this.readyState === DemoSocket.CLOSED) return
    this.readyState = DemoSocket.CLOSED
    this.detach()
    this.emitClose(code)
  }

  private open(): void {
    if (this.readyState !== DemoSocket.CONNECTING) return
    this.readyState = DemoSocket.OPEN
    const event = new Event('open')
    this.onopen?.(event)
    this.dispatchEvent(event)
  }

  private emitClose(code: number): void {
    const event = new CloseEvent('close', { code, reason: '', wasClean: true })
    this.onclose?.(event)
    this.dispatchEvent(event)
  }

  private fail(code: string, message: string): void {
    if (this.path === '/ws/match') {
      this.serverSend(JSON.stringify({ type: 'MATCH_ERROR', code, message }))
    } else {
      this.serverSend(JSON.stringify({ type: 'ERROR', data: { code, message } }))
    }
    setTimeout(() => this.serverClose(4000), 50)
  }

  private authenticate(frame: Record<string, unknown>): void {
    const participantKey = resolveParticipantKey(frame)
    if (!participantKey) {
      this.fail('AUTH-002', '인증 정보를 확인할 수 없어요.')
      return
    }
    this.participantKey = participantKey

    if (this.path === '/ws/match') {
      this.role = 'match'
      matchSockets.set(participantKey, this)
      const entry = entries.get(participantKey)
      if (entry?.waitingRoomId && (entry.matchStatus === 'ENTERING_ROOM' || entry.matchStatus === 'IN_WAITING_ROOM')) {
        // 인증 시점에 이미 성사돼 있으면 서버가 다시 알려준다.
        this.serverSend(JSON.stringify({ type: 'MATCH_SUCCESS', roomId: entry.waitingRoomId, gameType: entry.gameType }))
      }
      return
    }

    const waitingMatch = this.path.match(/^\/ws\/waiting-rooms\/([^/]+)$/)
    if (waitingMatch) {
      const room = rooms.get(decodeURIComponent(waitingMatch[1]))
      if (!room) {
        this.fail('WAITING-008', '종료되었거나 존재하지 않는 방이에요.')
        return
      }
      if (!room.participants.some((participant) => participant.participantKey === participantKey)) {
        this.fail('WAITING-009', '대기방 참가 정보를 확인할 수 없어요.')
        return
      }
      this.role = 'waiting'
      this.room = room
      room.waitingSockets.set(participantKey, this)
      const entry = entries.get(participantKey)
      if (entry && entry.waitingRoomId === room.roomId && entry.matchStatus === 'ENTERING_ROOM') {
        entry.matchStatus = 'IN_WAITING_ROOM'
        entry.statusChangedAt = Date.now()
      }
      this.serverSend(roomStateFrame(room))
      return
    }

    const sessionMatch = this.path.match(/^\/ws\/game-sessions\/([^/]+)$/)
    if (sessionMatch) {
      const room = rooms.get(decodeURIComponent(sessionMatch[1]))
      if (!room) {
        this.fail('SESSION-001', '게임 세션을 찾을 수 없어요.')
        return
      }
      this.role = 'session'
      this.room = room
      room.sessionSockets.set(participantKey, this)
      this.serverSend(sessionStateFrame(room))
      if (!room.bot) {
        room.bot = startBot(room, (frame) => {
          room.sessionSockets.forEach((socket) => socket.serverSend(frame))
        })
      }
      return
    }

    this.fail('COMMON-404', `데모 백엔드에 없는 WebSocket 경로예요: ${this.path}`)
  }

  private detach(): void {
    if (!this.participantKey) return
    if (this.role === 'match') {
      if (matchSockets.get(this.participantKey) === this) matchSockets.delete(this.participantKey)
      // 실서버 cancelSilently와 같은 규칙: 아직 SEARCHING인 신청만 조용히 정리한다.
      const entry = entries.get(this.participantKey)
      if (entry?.matchStatus === 'SEARCHING') {
        entries.delete(this.participantKey)
        zrem(this.participantKey)
      }
    } else if (this.role === 'waiting' && this.room) {
      if (this.room.waitingSockets.get(this.participantKey) === this) {
        this.room.waitingSockets.delete(this.participantKey)
      }
    } else if (this.role === 'session' && this.room) {
      if (this.room.sessionSockets.get(this.participantKey) === this) {
        this.room.sessionSockets.delete(this.participantKey)
      }
      if (this.room.sessionSockets.size === 0) {
        destroyRoom(this.room)
      }
    }
  }
}

function notifyMatched(participantKey: string, roomId: string, gameType: GameName): void {
  const socket = matchSockets.get(participantKey)
  socket?.serverSend(JSON.stringify({ type: 'MATCH_SUCCESS', roomId, gameType }))
}

function resolveParticipantKey(frame: Record<string, unknown>): string | null {
  const accessToken = frame.accessToken
  if (typeof accessToken === 'string' && accessToken) {
    const userId = parseAccessToken(accessToken)
    if (userId !== null && storeRef?.findUser(userId)) return `USER:${userId}`
    return null
  }
  const guestSessionId = frame.guestSessionId
  if (typeof guestSessionId === 'string' && guestSessionId) return `GUEST:${guestSessionId}`
  return null
}

/**
 * `globalThis.WebSocket`을 감싼다. `/ws/**` 경로만 데모 소켓으로 처리하고 나머지는 원래 WebSocket에 위임한다.
 */
export function installDemoWebSocket(store: DemoStore, _rest: DemoRestBackend, wsPrefix: string): void {
  storeRef = store
  const NativeWebSocket = globalThis.WebSocket

  const Patched = function (this: unknown, url: string | URL, protocols?: string | string[]) {
    const href = typeof url === 'string' ? url : url.toString()
    let pathname = ''
    try {
      pathname = new URL(href, globalThis.location.origin).pathname
    } catch {
      pathname = ''
    }
    if (pathname.startsWith(wsPrefix)) {
      return new DemoSocket(href)
    }
    return new NativeWebSocket(href, protocols)
  } as unknown as typeof WebSocket

  Object.assign(Patched, {
    CONNECTING: 0,
    OPEN: 1,
    CLOSING: 2,
    CLOSED: 3,
    prototype: NativeWebSocket.prototype,
  })
  globalThis.WebSocket = Patched
}
