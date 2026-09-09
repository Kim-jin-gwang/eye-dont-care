/**
 * 라이브 데모용 인메모리 백엔드 상태.
 *
 * 실제 백엔드(Spring Boot + PostgreSQL + Redis) 없이 정적 호스팅만으로 서비스를 체험할 수 있도록,
 * 백엔드가 응답하던 데이터 모델을 브라우저 안에서 흉내 낸다. 데이터 계약(응답 필드·enum 문자열)은
 * `src/types/*`와 `src/api/*`가 기대하는 형태를 그대로 따른다.
 *
 * - 시드 데이터(회원 10명·길드 2개·경기 23건)는 `deploy/seed-data/demo_seed_data.sql`을 옮긴 것으로,
 *   주간 랭킹에 항상 잡히도록 "이번 주" 안의 시각으로 매번 다시 배치한다.
 * - 방문자가 만든 데이터(가입·경기 기록·길드·게시글)만 localStorage에 남긴다.
 */
import type { GameName } from '../types/waitingRoom'
import type {
  GameOutcome,
  GameResultPlayMode,
  ParticipantType,
} from '../types/gameResult'
import type { ProfileImageCode } from '../types/auth'

export interface DemoUser {
  id: number
  email: string
  nickname: string
  password: string | null
  profileImageCode: ProfileImageCode
  createdAt: string
  deletedAt: string | null
}

export interface DemoGuest {
  guestSessionId: string
  nickname: string
  createdAt: string
}

export interface DemoGame {
  gameId: number
  gameName: GameName
  playMode: GameResultPlayMode
}

export interface DemoParticipant {
  participantKey: string
  participantType: ParticipantType
  userId: number | null
  slotNo: number
  displayName: string
  outcome: GameOutcome
  rank: number
  score: number | null
}

export interface DemoGameResult {
  resultId: number
  playId: string
  gameId: number
  startedAt: string
  endedAt: string
  participants: DemoParticipant[]
  gameResult: Record<string, unknown>
}

export interface DemoGroupMember {
  userId: number
  role: 'OWNER' | 'MEMBER'
  joinedAt: string
}

export interface DemoGroup {
  groupId: number
  name: string
  description: string
  visibility: 'PUBLIC' | 'PRIVATE'
  capacity: number
  joinCode: string
  ownerUserId: number
  createdAt: string
  members: DemoGroupMember[]
}

export interface DemoComment {
  commentId: number
  postId: number
  authorUserId: number
  content: string
  createdAt: string
}

export interface DemoPost {
  postId: number
  groupId: number
  authorUserId: number
  content: string
  createdAt: string
  comments: DemoComment[]
}

export interface DemoRankingTrend {
  userId: number
  gameName: GameName
  weekStart: string
  trend: 'up' | 'down' | 'same'
}

interface PersistedState {
  version: number
  nextId: number
  users: DemoUser[]
  guests: DemoGuest[]
  results: DemoGameResult[]
  groups: DemoGroup[]
  posts: DemoPost[]
  trends: DemoRankingTrend[]
  refreshTokens: Record<string, number>
}

const STORAGE_KEY = 'eye-dont-care.demo-backend.v1'
const STATE_VERSION = 1
/** 방문자가 만든 데이터의 id는 시드와 겹치지 않도록 여기서 시작한다. */
const USER_DATA_ID_START = 1000

/** `data.sql`의 게임 카탈로그와 같은 순서·조합. */
export const GAMES: DemoGame[] = [
  { gameId: 1, gameName: 'HOCKEY', playMode: 'INVITE' },
  { gameId: 2, gameName: 'HOCKEY', playMode: 'RANDOM' },
  { gameId: 3, gameName: 'HOCKEY', playMode: 'AI' },
  { gameId: 4, gameName: 'EYEFIGHT', playMode: 'SOLO' },
  { gameId: 5, gameName: 'EYEFIGHT', playMode: 'INVITE' },
  { gameId: 6, gameName: 'EYEFIGHT', playMode: 'RANDOM' },
  { gameId: 7, gameName: 'DRAWING', playMode: 'AI' },
  { gameId: 8, gameName: 'RHYTHM', playMode: 'SOLO' },
  { gameId: 9, gameName: 'RHYTHM', playMode: 'INVITE' },
  { gameId: 10, gameName: 'RHYTHM', playMode: 'RANDOM' },
  { gameId: 11, gameName: 'BLINK', playMode: 'SOLO' },
  { gameId: 12, gameName: 'BLINK', playMode: 'INVITE' },
  { gameId: 13, gameName: 'BLINK', playMode: 'RANDOM' },
]

export function findGame(gameId: number): DemoGame | undefined {
  return GAMES.find((game) => game.gameId === gameId)
}

export function findGameId(
  gameName: GameName,
  playMode: GameResultPlayMode,
): number | null {
  return (
    GAMES.find(
      (game) => game.gameName === gameName && game.playMode === playMode,
    )?.gameId ?? null
  )
}

// --- 시각 유틸 ---

const KST_OFFSET_MS = 9 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

/** 이번 주 시작(KST 월요일 00:00)을 epoch ms로 돌려준다. 백엔드 `WeekRange`와 같은 기준. */
export function weekStartMs(nowMs: number): number {
  const kst = new Date(nowMs + KST_OFFSET_MS)
  const day = kst.getUTCDay() // 0=일 … 6=토 (KST 기준 요일)
  const daysSinceMonday = (day + 6) % 7
  const kstMidnight = Date.UTC(
    kst.getUTCFullYear(),
    kst.getUTCMonth(),
    kst.getUTCDate(),
  )
  return kstMidnight - daysSinceMonday * DAY_MS - KST_OFFSET_MS
}

export function weekStartLabel(nowMs: number): string {
  return new Date(weekStartMs(nowMs) + KST_OFFSET_MS).toISOString().slice(0, 10)
}

export function nowIso(): string {
  return new Date().toISOString()
}

export function randomUuid(): string {
  const uuid = globalThis.crypto?.randomUUID?.()
  if (uuid) return uuid
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = (Math.random() * 16) | 0
    const value = char === 'x' ? random : (random & 0x3) | 0x8
    return value.toString(16)
  })
}

// --- 시드 ---

interface SeedResultSpec {
  gameName: GameName
  playMode: GameResultPlayMode
  /** 이번 주 구간 안에서의 상대 위치(0~1). 결정적이라 새로고침해도 순서가 흔들리지 않는다. */
  at: number
  players: Array<{
    userId: number | null
    slotNo: number
    score: number
    outcome: GameOutcome
    rank: number
    displayName?: string
  }>
}

const SEED_USERS: Array<Pick<DemoUser, 'nickname' | 'profileImageCode'>> = [
  { nickname: '반짝이는눈망울', profileImageCode: 'PROFILE_1' },
  { nickname: '깜빡임의달인', profileImageCode: 'PROFILE_2' },
  { nickname: '눈싸움챔피언', profileImageCode: 'PROFILE_3' },
  { nickname: '시선강탈자', profileImageCode: 'PROFILE_4' },
  { nickname: '졸린판다', profileImageCode: 'PROFILE_5' },
  { nickname: '매의눈', profileImageCode: 'PROFILE_6' },
  { nickname: '윙크요정', profileImageCode: 'PROFILE_7' },
  { nickname: '눈치백단', profileImageCode: 'PROFILE_8' },
  { nickname: '레이저시선', profileImageCode: 'PROFILE_1' },
  { nickname: '안깜빡할게', profileImageCode: 'PROFILE_2' },
]

const SEED_RESULTS: SeedResultSpec[] = [
  // BLINK 혼자하기(점수 = 깜빡인 횟수)
  { gameName: 'BLINK', playMode: 'SOLO', at: 0.86, players: [{ userId: 1, slotNo: 1, score: 142, outcome: 'COMPLETED', rank: 1 }] },
  { gameName: 'BLINK', playMode: 'SOLO', at: 0.7, players: [{ userId: 2, slotNo: 1, score: 128, outcome: 'COMPLETED', rank: 1 }] },
  { gameName: 'BLINK', playMode: 'SOLO', at: 0.55, players: [{ userId: 1, slotNo: 1, score: 117, outcome: 'COMPLETED', rank: 1 }] },
  { gameName: 'BLINK', playMode: 'SOLO', at: 0.72, players: [{ userId: 3, slotNo: 1, score: 105, outcome: 'COMPLETED', rank: 1 }] },
  { gameName: 'BLINK', playMode: 'SOLO', at: 0.4, players: [{ userId: 5, slotNo: 1, score: 98, outcome: 'COMPLETED', rank: 1 }] },
  { gameName: 'BLINK', playMode: 'SOLO', at: 0.25, players: [{ userId: 7, slotNo: 1, score: 88, outcome: 'COMPLETED', rank: 1 }] },
  // EYEFIGHT 혼자하기(점수 = 버틴 초)
  { gameName: 'EYEFIGHT', playMode: 'SOLO', at: 0.84, players: [{ userId: 3, slotNo: 1, score: 87, outcome: 'COMPLETED', rank: 1 }] },
  { gameName: 'EYEFIGHT', playMode: 'SOLO', at: 0.69, players: [{ userId: 4, slotNo: 1, score: 62, outcome: 'COMPLETED', rank: 1 }] },
  { gameName: 'EYEFIGHT', playMode: 'SOLO', at: 0.54, players: [{ userId: 6, slotNo: 1, score: 55, outcome: 'COMPLETED', rank: 1 }] },
  { gameName: 'EYEFIGHT', playMode: 'SOLO', at: 0.39, players: [{ userId: 2, slotNo: 1, score: 43, outcome: 'COMPLETED', rank: 1 }] },
  // RHYTHM 혼자하기(점수 = 리듬 점수)
  { gameName: 'RHYTHM', playMode: 'SOLO', at: 0.82, players: [{ userId: 7, slotNo: 1, score: 9500, outcome: 'COMPLETED', rank: 1 }] },
  { gameName: 'RHYTHM', playMode: 'SOLO', at: 0.67, players: [{ userId: 8, slotNo: 1, score: 8800, outcome: 'COMPLETED', rank: 1 }] },
  { gameName: 'RHYTHM', playMode: 'SOLO', at: 0.52, players: [{ userId: 1, slotNo: 1, score: 8200, outcome: 'COMPLETED', rank: 1 }] },
  { gameName: 'RHYTHM', playMode: 'SOLO', at: 0.23, players: [{ userId: 9, slotNo: 1, score: 7600, outcome: 'COMPLETED', rank: 1 }] },
  // DRAWING AI 채점(점수 = 0~100)
  { gameName: 'DRAWING', playMode: 'AI', at: 0.8, players: [{ userId: 4, slotNo: 1, score: 92, outcome: 'COMPLETED', rank: 1 }] },
  { gameName: 'DRAWING', playMode: 'AI', at: 0.5, players: [{ userId: 10, slotNo: 1, score: 85, outcome: 'COMPLETED', rank: 1 }] },
  { gameName: 'DRAWING', playMode: 'AI', at: 0.36, players: [{ userId: 5, slotNo: 1, score: 78, outcome: 'COMPLETED', rank: 1 }] },
  // HOCKEY 랜덤 매칭(2인, 점수 = 골)
  { gameName: 'HOCKEY', playMode: 'RANDOM', at: 0.78, players: [
    { userId: 1, slotNo: 1, score: 3, outcome: 'WIN', rank: 1 },
    { userId: 2, slotNo: 2, score: 1, outcome: 'LOSE', rank: 2 },
  ] },
  { gameName: 'HOCKEY', playMode: 'RANDOM', at: 0.64, players: [
    { userId: 3, slotNo: 1, score: 2, outcome: 'LOSE', rank: 2 },
    { userId: 4, slotNo: 2, score: 3, outcome: 'WIN', rank: 1 },
  ] },
  { gameName: 'HOCKEY', playMode: 'RANDOM', at: 0.48, players: [
    { userId: 6, slotNo: 1, score: 3, outcome: 'WIN', rank: 1 },
    { userId: 9, slotNo: 2, score: 0, outcome: 'LOSE', rank: 2 },
  ] },
  // HOCKEY AI 대결
  { gameName: 'HOCKEY', playMode: 'AI', at: 0.62, players: [
    { userId: 5, slotNo: 1, score: 2, outcome: 'LOSE', rank: 2 },
    { userId: null, slotNo: 2, score: 3, outcome: 'WIN', rank: 1, displayName: 'AI 상대' },
  ] },
  // EYEFIGHT 친구 초대 대결
  { gameName: 'EYEFIGHT', playMode: 'INVITE', at: 0.76, players: [
    { userId: 3, slotNo: 1, score: 34, outcome: 'WIN', rank: 1 },
    { userId: 8, slotNo: 2, score: 29, outcome: 'LOSE', rank: 2 },
  ] },
  { gameName: 'EYEFIGHT', playMode: 'INVITE', at: 0.33, players: [
    { userId: 7, slotNo: 1, score: 38, outcome: 'LOSE', rank: 2 },
    { userId: 10, slotNo: 2, score: 41, outcome: 'WIN', rank: 1 },
  ] },
]

function buildSeedUsers(nowMs: number): DemoUser[] {
  return SEED_USERS.map((seed, index) => ({
    id: index + 1,
    email: `demo${index + 1}@eyedontcare.local`,
    nickname: seed.nickname,
    password: null,
    profileImageCode: seed.profileImageCode,
    createdAt: new Date(nowMs - (14 - index) * DAY_MS).toISOString(),
    deletedAt: null,
  }))
}

function buildSeedResults(nowMs: number, users: DemoUser[]): DemoGameResult[] {
  const start = weekStartMs(nowMs)
  // 주 초반(월요일 새벽)이라 구간이 너무 짧으면 최근 6시간 안에 흩어 놓는다.
  const span = Math.max(nowMs - start - 60_000, 6 * 60 * 60 * 1000)
  const base = Math.min(start, nowMs - span)

  return SEED_RESULTS.map((spec, index) => {
    const endedAt = base + Math.floor(span * spec.at)
    const gameId = findGameId(spec.gameName, spec.playMode) ?? 0
    const gameResult: Record<string, unknown> = {}
    for (const player of spec.players) {
      gameResult[String(player.slotNo)] = { score: player.score }
    }
    return {
      resultId: index + 1,
      playId: `dddddddd-dddd-4ddd-8ddd-${String(index + 1).padStart(12, '0')}`,
      gameId,
      startedAt: new Date(endedAt - 60_000).toISOString(),
      endedAt: new Date(endedAt).toISOString(),
      participants: spec.players.map((player) => ({
        participantKey:
          player.userId === null ? 'AI:demo' : `USER:${player.userId}`,
        participantType: player.userId === null ? 'BOT' : 'USER',
        userId: player.userId,
        slotNo: player.slotNo,
        displayName:
          player.displayName ??
          users.find((user) => user.id === player.userId)?.nickname ??
          '플레이어',
        outcome: player.outcome,
        rank: player.rank,
        score: player.score,
      })),
      gameResult,
    }
  })
}

function buildSeedGroups(nowMs: number): DemoGroup[] {
  return [
    {
      groupId: 1,
      name: '눈빛교환소',
      description: '눈으로 대화하는 사람들의 모임. 주간 랭킹 상위권을 노려요!',
      visibility: 'PUBLIC',
      capacity: 20,
      joinCode: 'EYECON',
      ownerUserId: 1,
      createdAt: new Date(nowMs - 10 * DAY_MS).toISOString(),
      members: [1, 2, 3, 4, 5].map((userId, index) => ({
        userId,
        role: index === 0 ? 'OWNER' : 'MEMBER',
        joinedAt: new Date(nowMs - (10 - index) * DAY_MS).toISOString(),
      })),
    },
    {
      groupId: 2,
      name: '깜빡깜빡',
      description: '리듬게임 위주로 같이 연습하는 소모임',
      visibility: 'PUBLIC',
      capacity: 10,
      joinCode: 'BLINK2',
      ownerUserId: 6,
      createdAt: new Date(nowMs - 8 * DAY_MS).toISOString(),
      members: [6, 7, 8].map((userId, index) => ({
        userId,
        role: index === 0 ? 'OWNER' : 'MEMBER',
        joinedAt: new Date(nowMs - (8 - index) * DAY_MS).toISOString(),
      })),
    },
  ]
}

function buildSeedPosts(nowMs: number): DemoPost[] {
  return [
    {
      postId: 1,
      groupId: 1,
      authorUserId: 2,
      content: '오늘 눈싸움 3연승 했어요! 다들 도전해 보세요 👀',
      createdAt: new Date(nowMs - 2 * DAY_MS).toISOString(),
      comments: [
        {
          commentId: 1,
          postId: 1,
          authorUserId: 3,
          content: '오 대단해요! 저랑도 한 판 해요',
          createdAt: new Date(nowMs - 2 * DAY_MS + 60 * 60 * 1000).toISOString(),
        },
      ],
    },
    {
      postId: 2,
      groupId: 1,
      authorUserId: 1,
      content: '이번 주 랭킹 1위 탈환 갑니다. 에어하키 연습 상대 구해요!',
      createdAt: new Date(nowMs - DAY_MS).toISOString(),
      comments: [],
    },
    {
      postId: 3,
      groupId: 2,
      authorUserId: 6,
      content: '리듬게임 팁: 박자보다 반 박자 먼저 깜빡이면 판정이 훨씬 잘 나와요',
      createdAt: new Date(nowMs - 3 * DAY_MS).toISOString(),
      comments: [
        {
          commentId: 2,
          postId: 3,
          authorUserId: 7,
          content: '이 팁 덕분에 최고 기록 갱신했어요 감사합니다!',
          createdAt: new Date(nowMs - 2 * DAY_MS).toISOString(),
        },
      ],
    },
  ]
}

function buildSeedTrends(nowMs: number): DemoRankingTrend[] {
  const weekStart = weekStartLabel(nowMs)
  return [
    { userId: 1, gameName: 'BLINK', weekStart, trend: 'up' },
    { userId: 2, gameName: 'BLINK', weekStart, trend: 'down' },
    { userId: 3, gameName: 'EYEFIGHT', weekStart, trend: 'same' },
    { userId: 7, gameName: 'RHYTHM', weekStart, trend: 'up' },
  ]
}

// --- 상태 ---

function emptyPersisted(): PersistedState {
  return {
    version: STATE_VERSION,
    nextId: USER_DATA_ID_START,
    users: [],
    guests: [],
    results: [],
    groups: [],
    posts: [],
    trends: [],
    refreshTokens: {},
  }
}

function loadPersisted(): PersistedState {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY)
    if (!raw) return emptyPersisted()
    const parsed = JSON.parse(raw) as Partial<PersistedState>
    if (parsed.version !== STATE_VERSION) return emptyPersisted()
    return { ...emptyPersisted(), ...parsed }
  } catch {
    return emptyPersisted()
  }
}

/**
 * 데모 백엔드 상태. 시드는 매 로드마다 다시 만들고(주간 구간 재배치), 방문자 데이터만 저장한다.
 */
export class DemoStore {
  private readonly persisted: PersistedState
  private readonly seedUsers: DemoUser[]
  private readonly seedResults: DemoGameResult[]
  private readonly seedGroups: DemoGroup[]
  private readonly seedPosts: DemoPost[]
  private readonly seedTrends: DemoRankingTrend[]
  private saveTimer: ReturnType<typeof setTimeout> | undefined

  constructor(nowMs = Date.now()) {
    this.persisted = loadPersisted()
    this.seedUsers = buildSeedUsers(nowMs)
    this.seedResults = buildSeedResults(nowMs, this.seedUsers)
    this.seedGroups = buildSeedGroups(nowMs)
    this.seedPosts = buildSeedPosts(nowMs)
    this.seedTrends = buildSeedTrends(nowMs)
  }

  nextId(): number {
    const id = this.persisted.nextId
    this.persisted.nextId += 1
    this.save()
    return id
  }

  /** 변경 사항을 잠시 모아 localStorage에 기록한다(연속 호출 시 마지막 한 번만). */
  save(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => {
      try {
        globalThis.localStorage?.setItem(
          STORAGE_KEY,
          JSON.stringify(this.persisted),
        )
      } catch {
        // 저장 실패(용량·프라이빗 모드)는 데모 진행을 막지 않는다.
      }
    }, 50)
  }

  // 회원
  get users(): DemoUser[] {
    return [...this.seedUsers, ...this.persisted.users]
  }
  findUser(id: number): DemoUser | undefined {
    return this.users.find((user) => user.id === id && user.deletedAt === null)
  }
  findUserByEmail(email: string): DemoUser | undefined {
    const normalized = email.trim().toLowerCase()
    return this.users.find(
      (user) => user.email.toLowerCase() === normalized && user.deletedAt === null,
    )
  }
  isNicknameTaken(nickname: string, exceptUserId?: number): boolean {
    return this.users.some(
      (user) =>
        user.deletedAt === null &&
        user.id !== exceptUserId &&
        user.nickname === nickname,
    )
  }
  addUser(user: Omit<DemoUser, 'id'>): DemoUser {
    const created: DemoUser = { ...user, id: this.nextId() }
    this.persisted.users.push(created)
    this.save()
    return created
  }
  /** 시드 회원은 수정할 수 없으므로 방문자 회원만 갱신한다(시드는 전시용). */
  updateUser(id: number, patch: Partial<DemoUser>): DemoUser | undefined {
    const index = this.persisted.users.findIndex((user) => user.id === id)
    if (index === -1) return undefined
    const updated = { ...this.persisted.users[index], ...patch }
    this.persisted.users[index] = updated
    this.save()
    return updated
  }

  // 게스트
  addGuest(): DemoGuest {
    const guest: DemoGuest = {
      guestSessionId: randomUuid(),
      nickname: '게스트 플레이어',
      createdAt: nowIso(),
    }
    this.persisted.guests.push(guest)
    if (this.persisted.guests.length > 50) this.persisted.guests.shift()
    this.save()
    return guest
  }
  hasGuest(guestSessionId: string): boolean {
    return this.persisted.guests.some(
      (guest) => guest.guestSessionId === guestSessionId,
    )
  }

  // refresh 토큰
  rememberRefreshToken(token: string, userId: number): void {
    this.persisted.refreshTokens[token] = userId
    this.save()
  }
  consumeRefreshToken(token: string): number | undefined {
    const userId = this.persisted.refreshTokens[token]
    if (userId === undefined) return undefined
    delete this.persisted.refreshTokens[token]
    this.save()
    return userId
  }
  forgetRefreshTokensOf(userId: number): void {
    for (const [token, owner] of Object.entries(this.persisted.refreshTokens)) {
      if (owner === userId) delete this.persisted.refreshTokens[token]
    }
    this.save()
  }

  // 경기 결과
  get results(): DemoGameResult[] {
    return [...this.seedResults, ...this.persisted.results]
  }
  findResult(resultId: number): DemoGameResult | undefined {
    return this.results.find((result) => result.resultId === resultId)
  }
  findResultByPlayId(playId: string): DemoGameResult | undefined {
    return this.results.find((result) => result.playId === playId)
  }
  addResult(result: Omit<DemoGameResult, 'resultId'>): DemoGameResult {
    const created: DemoGameResult = { ...result, resultId: this.nextId() }
    this.persisted.results.push(created)
    this.save()
    return created
  }

  // 길드
  get groups(): DemoGroup[] {
    return [...this.seedGroups, ...this.persisted.groups]
  }
  findGroup(groupId: number): DemoGroup | undefined {
    return this.groups.find((group) => group.groupId === groupId)
  }
  findGroupByCode(code: string): DemoGroup | undefined {
    const normalized = code.trim().toUpperCase()
    return this.groups.find((group) => group.joinCode === normalized)
  }
  addGroup(group: Omit<DemoGroup, 'groupId'>): DemoGroup {
    const created: DemoGroup = { ...group, groupId: this.nextId() }
    this.persisted.groups.push(created)
    this.save()
    return created
  }
  removeGroup(groupId: number): void {
    this.persisted.groups = this.persisted.groups.filter(
      (group) => group.groupId !== groupId,
    )
    this.persisted.posts = this.persisted.posts.filter(
      (post) => post.groupId !== groupId,
    )
    this.save()
  }
  /** 시드 길드에 가입/탈퇴하면 시드 배열을 직접 바꾼다(이 세션 동안만 유지, 새로고침 시 초기화). */
  touchGroups(): void {
    this.save()
  }

  // 게시글
  get posts(): DemoPost[] {
    return [...this.seedPosts, ...this.persisted.posts]
  }
  findPost(postId: number): DemoPost | undefined {
    return this.posts.find((post) => post.postId === postId)
  }
  addPost(post: Omit<DemoPost, 'postId'>): DemoPost {
    const created: DemoPost = { ...post, postId: this.nextId() }
    this.persisted.posts.push(created)
    this.save()
    return created
  }
  removePost(postId: number): void {
    this.persisted.posts = this.persisted.posts.filter(
      (post) => post.postId !== postId,
    )
    this.save()
  }

  // 랭킹 변동
  get trends(): DemoRankingTrend[] {
    return [...this.seedTrends, ...this.persisted.trends]
  }
  upsertTrend(trend: DemoRankingTrend): void {
    const index = this.persisted.trends.findIndex(
      (existing) =>
        existing.userId === trend.userId &&
        existing.gameName === trend.gameName &&
        existing.weekStart === trend.weekStart,
    )
    if (index === -1) this.persisted.trends.push(trend)
    else this.persisted.trends[index] = trend
    this.save()
  }
}
