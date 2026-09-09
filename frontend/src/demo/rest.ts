/**
 * 데모 REST 백엔드 — `/api/v1/**` 호출을 가로채 `{code, message, data}` 엔벨로프로 응답한다.
 *
 * 경로·메서드·요청/응답 형태는 `src/api/*`가 호출하는 실제 백엔드 계약을 따른다. 인증은 실제 서버와
 * 같이 `Authorization: Bearer <JWT>`(회원) 또는 `X-Guest-Session-Id`(게스트) 헤더로 구분한다.
 * 토큰은 서명 검증이 없는 데모용이며 `sub`에 userId만 담는다(프론트 `decodeUserId`와 호환).
 */
import type { GameName } from '../types/waitingRoom'
import type {
  GameOutcome,
  ParticipantType,
  SubmitGameResultRequest,
} from '../types/gameResult'
import type { ProfileImageCode } from '../types/auth'
import {
  GAMES,
  findGame,
  nowIso,
  randomUuid,
  weekStartLabel,
  type DemoGroup,
  type DemoPost,
  type DemoStore,
  type DemoUser,
} from './store'
import {
  RANKING_GAMES,
  computeWeeklyRanking,
  rankOf,
  rankingConfigOf,
} from './ranking'
import * as realtime from './realtime'

// --- 공통 ---

export class DemoApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'DemoApiError'
    this.status = status
    this.code = code
  }
}

export const DEMO_UNSUPPORTED_CODE = 'DEMO-001'

export interface Identity {
  participantKey: string
  participantType: ParticipantType
  userId: number | null
  displayName: string
}

export interface DemoRequest {
  method: string
  path: string
  query: URLSearchParams
  body: unknown
  headers: Headers
}

interface HandlerResult {
  status?: number
  data?: unknown
}

type Handler = (
  request: DemoRequest,
  params: Record<string, string>,
) => HandlerResult | Promise<HandlerResult>

interface Route {
  method: string
  segments: string[]
  handler: Handler
}

const TOKEN_TTL_MS = 12 * 60 * 60 * 1000

function base64UrlEncode(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return globalThis
    .btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function base64UrlDecode(value: string): string | null {
  try {
    const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
    const binary = globalThis.atob(padded)
    return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)))
  } catch {
    return null
  }
}

export function issueAccessToken(userId: number): string {
  const header = base64UrlEncode(JSON.stringify({ alg: 'none', typ: 'JWT' }))
  const payload = base64UrlEncode(
    JSON.stringify({
      sub: String(userId),
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor((Date.now() + TOKEN_TTL_MS) / 1000),
      demo: true,
    }),
  )
  return `${header}.${payload}.demo`
}

/** 토큰에서 userId를 꺼낸다. 만료됐거나 형식이 다르면 null. */
export function parseAccessToken(token: string): number | null {
  const parts = token.split('.')
  if (parts.length < 2) return null
  const json = base64UrlDecode(parts[1])
  if (!json) return null
  try {
    const payload = JSON.parse(json) as { sub?: string; exp?: number }
    if (payload.exp !== undefined && payload.exp * 1000 < Date.now()) return null
    const userId = Number(payload.sub)
    return Number.isFinite(userId) ? userId : null
  } catch {
    return null
  }
}

function body<T>(request: DemoRequest): T {
  return (request.body ?? {}) as T
}

function intParam(value: string | null, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// --- 라우터 ---

export class DemoRestBackend {
  private readonly routes: Route[] = []
  private readonly store: DemoStore

  constructor(store: DemoStore) {
    this.store = store
    this.registerRoutes()
  }

  async handle(request: DemoRequest): Promise<Response> {
    const relative = request.path.replace(/^\/api\/v1/, '') || '/'
    const segments = relative.split('/').filter(Boolean)

    for (const route of this.routes) {
      if (route.method !== request.method) continue
      const params = matchRoute(route.segments, segments)
      if (!params) continue
      try {
        const result = await route.handler(request, params)
        return json(result.status ?? 200, {
          code: 'OK',
          message: '요청이 처리되었어요.',
          data: result.data ?? null,
        })
      } catch (error) {
        if (error instanceof DemoApiError) {
          return json(error.status, { code: error.code, message: error.message })
        }
        return json(500, {
          code: 'COMMON-500',
          message: '데모 백엔드에서 알 수 없는 오류가 발생했어요.',
        })
      }
    }

    return json(404, {
      code: 'COMMON-404',
      message: `데모 백엔드에 없는 경로예요: ${request.method} ${relative}`,
    })
  }

  // --- 인증/신원 ---

  /** 요청 헤더로 현재 참가자를 알아낸다. 신원이 없으면 null. */
  identityOf(request: DemoRequest): Identity | null {
    const authorization = request.headers.get('Authorization')
    if (authorization?.startsWith('Bearer ')) {
      const userId = parseAccessToken(authorization.slice('Bearer '.length))
      const user = userId === null ? undefined : this.store.findUser(userId)
      if (user) {
        return {
          participantKey: `USER:${user.id}`,
          participantType: 'USER',
          userId: user.id,
          displayName: user.nickname,
        }
      }
      throw new DemoApiError(401, 'AUTH-001', '로그인이 만료됐어요. 다시 로그인해 주세요.')
    }

    const guestSessionId = request.headers.get('X-Guest-Session-Id')
    if (guestSessionId) {
      // 이전 방문에서 발급된 세션도 그대로 인정한다(데모는 세션 만료를 강제하지 않는다).
      return {
        participantKey: `GUEST:${guestSessionId}`,
        participantType: 'GUEST',
        userId: null,
        displayName: '게스트 플레이어',
      }
    }
    return null
  }

  private requireIdentity(request: DemoRequest): Identity {
    const identity = this.identityOf(request)
    if (!identity) {
      throw new DemoApiError(401, 'AUTH-002', '참가자 정보를 확인할 수 없어요.')
    }
    return identity
  }

  private requireUser(request: DemoRequest): DemoUser {
    const identity = this.identityOf(request)
    if (!identity || identity.userId === null) {
      throw new DemoApiError(401, 'AUTH-003', '로그인이 필요한 기능이에요.')
    }
    const user = this.store.findUser(identity.userId)
    if (!user) {
      throw new DemoApiError(401, 'AUTH-003', '로그인이 필요한 기능이에요.')
    }
    return user
  }

  private tokensFor(user: DemoUser): { accessToken: string; refreshToken: string } {
    const refreshToken = randomUuid()
    this.store.rememberRefreshToken(refreshToken, user.id)
    return { accessToken: issueAccessToken(user.id), refreshToken }
  }

  private toUserResponse(user: DemoUser) {
    return {
      id: user.id,
      email: user.email,
      nickname: user.nickname,
      profileImageCode: user.profileImageCode,
      loginType: 'LOCAL' as const,
      createdAt: user.createdAt,
    }
  }

  private uniqueNickname(base: string): string {
    const trimmed = base.trim().slice(0, 12) || '플레이어'
    if (!this.store.isNicknameTaken(trimmed)) return trimmed
    for (let suffix = 2; suffix < 1000; suffix += 1) {
      const candidate = `${trimmed.slice(0, 10)}${suffix}`
      if (!this.store.isNicknameTaken(candidate)) return candidate
    }
    return `${trimmed}-${randomUuid().slice(0, 4)}`
  }

  private signup(email: string, password: string): DemoUser {
    const codes: ProfileImageCode[] = [
      'PROFILE_1', 'PROFILE_2', 'PROFILE_3', 'PROFILE_4',
      'PROFILE_5', 'PROFILE_6', 'PROFILE_7', 'PROFILE_8',
    ]
    return this.store.addUser({
      email: email.trim(),
      nickname: this.uniqueNickname(email.split('@')[0] ?? '플레이어'),
      password,
      profileImageCode: codes[Math.floor(Math.random() * codes.length)],
      createdAt: nowIso(),
      deletedAt: null,
    })
  }

  // --- 라우트 등록 ---

  private route(method: string, pattern: string, handler: Handler): void {
    this.routes.push({
      method,
      segments: pattern.split('/').filter(Boolean),
      handler,
    })
  }

  private registerRoutes(): void {
    const store = this.store

    // 게스트 세션
    this.route('POST', '/guests/session', () => {
      const guest = store.addGuest()
      return {
        data: {
          guestSessionId: guest.guestSessionId,
          nickname: guest.nickname,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        },
      }
    })

    // 인증
    this.route('POST', '/auth/signup', (request) => {
      const { email, password } = body<{ email?: string; password?: string }>(request)
      if (!email?.includes('@') || !password) {
        throw new DemoApiError(400, 'COMMON-001', '이메일과 비밀번호를 입력해 주세요.')
      }
      if (store.findUserByEmail(email)) {
        throw new DemoApiError(409, 'AUTH-004', '이미 가입된 이메일이에요. 로그인해 주세요.')
      }
      return { status: 201, data: this.tokensFor(this.signup(email, password)) }
    })

    this.route('POST', '/auth/login', (request) => {
      const { email, password } = body<{ email?: string; password?: string }>(request)
      if (!email?.includes('@') || !password) {
        throw new DemoApiError(400, 'COMMON-001', '이메일과 비밀번호를 입력해 주세요.')
      }
      // 데모: 처음 보는 이메일이면 바로 가입시켜 준다(체험 진입 장벽 제거). 시드 회원은 전시용이라 로그인 불가.
      let user = store.findUserByEmail(email)
      if (user && user.password === null) {
        throw new DemoApiError(403, 'AUTH-005', '전시용 데모 계정이에요. 다른 이메일로 로그인해 주세요.')
      }
      if (user && user.password !== password) {
        throw new DemoApiError(401, 'AUTH-006', '비밀번호가 맞지 않아요.')
      }
      if (!user) user = this.signup(email, password)
      return { data: this.tokensFor(user) }
    })

    this.route('POST', '/auth/login/kakao', () => {
      throw new DemoApiError(
        400,
        DEMO_UNSUPPORTED_CODE,
        '라이브 데모에서는 카카오 로그인을 지원하지 않아요. 이메일 로그인(아무 이메일·비밀번호)으로 체험해 주세요.',
      )
    })

    this.route('POST', '/auth/reissue', (request) => {
      const { refreshToken } = body<{ refreshToken?: string }>(request)
      const userId = refreshToken ? store.consumeRefreshToken(refreshToken) : undefined
      const user = userId === undefined ? undefined : store.findUser(userId)
      if (!user) {
        throw new DemoApiError(401, 'AUTH-007', '세션이 만료됐어요. 다시 로그인해 주세요.')
      }
      return { data: this.tokensFor(user) }
    })

    this.route('POST', '/auth/logout', (request) => {
      const identity = this.identityOf(request)
      if (identity?.userId !== null && identity?.userId !== undefined) {
        store.forgetRefreshTokensOf(identity.userId)
      }
      return { data: null }
    })

    this.route('DELETE', '/auth/withdraw', (request) => {
      const user = this.requireUser(request)
      store.updateUser(user.id, { deletedAt: nowIso() })
      store.forgetRefreshTokensOf(user.id)
      return { data: null }
    })

    // 사용자
    this.route('GET', '/users/nickname/check', (request) => {
      const nickname = request.query.get('nickname')?.trim() ?? ''
      return { data: { nickname, available: nickname.length > 0 && !store.isNicknameTaken(nickname) } }
    })

    this.route('GET', '/users/:userId', (request, params) => {
      this.requireIdentity(request)
      const user = store.findUser(Number(params.userId))
      if (!user) throw new DemoApiError(404, 'USER-001', '사용자를 찾을 수 없어요.')
      return { data: this.toUserResponse(user) }
    })

    this.route('PATCH', '/users/:userId', (request, params) => {
      const me = this.requireUser(request)
      if (me.id !== Number(params.userId)) {
        throw new DemoApiError(403, 'USER-002', '본인 정보만 수정할 수 있어요.')
      }
      const patch = body<{ nickname?: string; profileImageCode?: ProfileImageCode }>(request)
      if (patch.nickname !== undefined) {
        const nickname = patch.nickname.trim()
        if (!nickname) throw new DemoApiError(400, 'COMMON-001', '닉네임을 입력해 주세요.')
        if (store.isNicknameTaken(nickname, me.id)) {
          throw new DemoApiError(409, 'USER-003', '이미 사용 중인 닉네임이에요.')
        }
      }
      const updated = store.updateUser(me.id, {
        ...(patch.nickname !== undefined ? { nickname: patch.nickname.trim() } : {}),
        ...(patch.profileImageCode ? { profileImageCode: patch.profileImageCode } : {}),
      })
      if (!updated) throw new DemoApiError(404, 'USER-001', '사용자를 찾을 수 없어요.')
      return { data: this.toUserResponse(updated) }
    })

    this.route('PUT', '/users/:userId/password', (request, params) => {
      const me = this.requireUser(request)
      if (me.id !== Number(params.userId)) {
        throw new DemoApiError(403, 'USER-002', '본인 정보만 수정할 수 있어요.')
      }
      const { currentPassword, newPassword } = body<{ currentPassword?: string; newPassword?: string }>(request)
      if (me.password !== currentPassword) {
        throw new DemoApiError(400, 'AUTH-006', '현재 비밀번호가 맞지 않아요.')
      }
      if (!newPassword) throw new DemoApiError(400, 'COMMON-001', '새 비밀번호를 입력해 주세요.')
      store.updateUser(me.id, { password: newPassword })
      return { data: null }
    })

    // 게임 카탈로그
    this.route('GET', '/games', () => ({ data: { games: GAMES } }))

    // 그림 인식(AI 채점) — 실제 서비스는 gpt-4o Vision(Vision API). 데모는 결과를 시뮬레이션한다.
    this.route('POST', '/games/draw/recognize', async (request) => {
      const { prompt, candidates } = body<{ prompt?: string; candidates?: string[] }>(request)
      await delay(1200)
      const pool = candidates?.length ? candidates : [prompt ?? '그림']
      const target = prompt ?? pool[0]
      const isTarget = Math.random() < 0.7
      const others = pool.filter((candidate) => candidate !== target)
      const label = isTarget || others.length === 0
        ? target
        : others[Math.floor(Math.random() * others.length)]
      const confidence = Math.round((0.62 + Math.random() * 0.35) * 100) / 100
      return {
        data: {
          label,
          confidence,
          isTarget: label === target,
          reason: '라이브 데모의 시뮬레이션 채점이에요. 실제 서비스에서는 gpt-4o Vision 모델이 그림을 인식해 채점합니다.',
          candidates: pool,
          model: 'demo-simulated',
        },
      }
    })

    // 경기 결과
    this.route('POST', '/game-results', (request) => {
      const identity = this.requireIdentity(request)
      const payload = body<SubmitGameResultRequest>(request)
      const game = findGame(Number(payload.gameId))
      if (!game) throw new DemoApiError(400, 'GAMERESULT-001', '존재하지 않는 게임이에요.')
      if (!payload.playId || !Array.isArray(payload.participants) || payload.participants.length === 0) {
        throw new DemoApiError(400, 'COMMON-001', '요청 값이 올바르지 않아요.')
      }

      const existing = store.findResultByPlayId(payload.playId)
      if (existing) {
        return { data: { resultId: existing.resultId, isNewRecord: false, previousBestScore: null } }
      }

      const scoreOf = (slotNo: number): number | null => {
        const slot = (payload.gameResult ?? {})[String(slotNo)] as { score?: unknown } | undefined
        const score = Number(slot?.score)
        return Number.isFinite(score) ? score : null
      }

      const myPrevious = store.results
        .filter((result) => result.gameId === game.gameId)
        .flatMap((result) => result.participants)
        .filter((participant) => participant.participantKey === identity.participantKey)
        .map((participant) => participant.score)
        .filter((score): score is number => score !== null)
      const previousBestScore = myPrevious.length ? Math.max(...myPrevious) : null

      const ranking = rankingConfigOf(game.gameName)
      const rankBefore =
        ranking && ranking.rankedMode === game.playMode
          ? rankOf(computeWeeklyRanking(store, ranking), identity.userId)
          : null

      const created = store.addResult({
        playId: payload.playId,
        gameId: game.gameId,
        startedAt: payload.startedAt ?? nowIso(),
        endedAt: payload.endedAt ?? nowIso(),
        participants: payload.participants.map((participant) => ({
          participantKey: participant.participantKey,
          participantType: participant.participantType,
          userId:
            participant.participantKey === identity.participantKey
              ? identity.userId
              : participant.participantKey.startsWith('USER:')
                ? Number(participant.participantKey.slice(5)) || null
                : null,
          slotNo: participant.slotNo,
          displayName: participant.displayName?.trim() || identity.displayName,
          outcome: participant.outcome as GameOutcome,
          rank: participant.rank,
          score: scoreOf(participant.slotNo),
        })),
        gameResult: payload.gameResult ?? {},
      })

      const mine = created.participants.find(
        (participant) => participant.participantKey === identity.participantKey,
      )
      const myScore = mine?.score ?? null
      const isNewRecord =
        myScore !== null && (previousBestScore === null || myScore > previousBestScore)

      if (ranking && ranking.rankedMode === game.playMode && identity.userId !== null) {
        const rankAfter = rankOf(computeWeeklyRanking(store, ranking), identity.userId)
        if (rankAfter !== null) {
          store.upsertTrend({
            userId: identity.userId,
            gameName: game.gameName,
            weekStart: weekStartLabel(Date.now()),
            trend: rankBefore === null || rankAfter < rankBefore ? 'up' : 'same',
          })
        }
      }

      return { status: 201, data: { resultId: created.resultId, isNewRecord, previousBestScore } }
    })

    this.route('GET', '/game-results/me', (request) => {
      const identity = this.requireIdentity(request)
      const page = intParam(request.query.get('page'), 1)
      const size = intParam(request.query.get('size'), 5)
      const mine = store.results
        .map((result) => ({
          result,
          me: result.participants.find((participant) => participant.participantKey === identity.participantKey),
        }))
        .filter((entry) => entry.me !== undefined)
        .sort((a, b) => Date.parse(b.result.endedAt) - Date.parse(a.result.endedAt))
      const slice = mine.slice((page - 1) * size, page * size)
      return {
        data: {
          content: slice.map(({ result, me }) => {
            const game = findGame(result.gameId)
            return {
              resultId: result.resultId,
              gameName: game?.gameName ?? 'BLINK',
              playMode: game?.playMode ?? 'SOLO',
              difficulty: null,
              myOutcome: me?.outcome ?? 'COMPLETED',
              myRank: me?.rank ?? 1,
              playedAt: result.endedAt,
            }
          }),
          page,
          size,
          totalElements: mine.length,
        },
      }
    })

    this.route('GET', '/game-results/:resultId', (request, params) => {
      const identity = this.requireIdentity(request)
      const result = store.findResult(Number(params.resultId))
      if (!result) throw new DemoApiError(404, 'GAMERESULT-002', '경기 기록을 찾을 수 없어요.')
      const game = findGame(result.gameId)
      const mySlotNo =
        result.participants.find((participant) => participant.participantKey === identity.participantKey)
          ?.slotNo ?? null
      return {
        data: {
          resultId: result.resultId,
          gameName: game?.gameName ?? 'BLINK',
          playMode: game?.playMode ?? 'SOLO',
          difficulty: null,
          startedAt: result.startedAt,
          endedAt: result.endedAt,
          mySlotNo,
          participants: result.participants.map((participant) => ({
            slotNo: participant.slotNo,
            participantType: participant.participantType,
            displayName: participant.displayName,
            outcome: participant.outcome,
            rank: participant.rank,
            score: participant.score,
          })),
          gameResult: result.gameResult,
        },
      }
    })

    // 랭킹
    this.route('GET', '/rankings', (request) => {
      const identity = this.identityOf(request)
      const limit = intParam(request.query.get('limit'), 3)
      const weekStart = weekStartLabel(Date.now())
      return {
        data: {
          period: 'weekly',
          weekStart,
          games: RANKING_GAMES.map((config) => {
            const ranked = computeWeeklyRanking(store, config)
            const top = ranked.slice(0, limit)
            const myRank = identity?.userId != null ? ranked.find((entry) => entry.userId === identity.userId) : undefined
            return {
              gameName: config.gameName,
              rankType: config.rankType,
              unit: config.unit,
              top: top.map((entry) => this.toRankingEntry(entry, config.gameName, weekStart, false)),
              myRank: myRank ? { rank: myRank.rank, value: myRank.value } : null,
            }
          }),
        },
      }
    })

    this.route('GET', '/rankings/:gameName', (request, params) => {
      const identity = this.identityOf(request)
      const config = rankingConfigOf(params.gameName.toUpperCase())
      if (!config) throw new DemoApiError(400, 'RANKING-001', '랭킹을 제공하지 않는 게임이에요.')
      const page = intParam(request.query.get('page'), 1)
      const size = intParam(request.query.get('size'), 10)
      const weekStart = weekStartLabel(Date.now())
      const ranked = computeWeeklyRanking(store, config)
      const slice = ranked.slice((page - 1) * size, page * size)
      const myRank = identity?.userId != null ? ranked.find((entry) => entry.userId === identity.userId) : undefined
      return {
        data: {
          gameName: config.gameName,
          rankType: config.rankType,
          unit: config.unit,
          period: 'weekly',
          weekStart,
          rankings: slice.map((entry) => this.toRankingEntry(entry, config.gameName, weekStart, true)),
          myRank: myRank ? { rank: myRank.rank, value: myRank.value } : null,
          page,
          size,
          totalElements: ranked.length,
          totalPages: Math.ceil(ranked.length / size),
        },
      }
    })

    // 길드(커뮤니티) — 회원 전용
    this.route('GET', '/groups', (request) => {
      const me = this.requireUser(request)
      const keyword = request.query.get('keyword')?.trim().toLowerCase() ?? ''
      const page = intParam(request.query.get('page'), 1)
      const size = intParam(request.query.get('size'), 20)
      const filtered = store.groups
        .filter((group) => !keyword || group.name.toLowerCase().includes(keyword))
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      const slice = filtered.slice((page - 1) * size, page * size)
      return {
        data: {
          groups: slice.map((group) => this.toGroupResponse(group, me.id)),
          page,
          size,
          totalElements: filtered.length,
          totalPages: Math.ceil(filtered.length / size),
        },
      }
    })

    this.route('GET', '/groups/me', (request) => {
      const me = this.requireUser(request)
      return {
        data: {
          groups: store.groups
            .filter((group) => group.members.some((member) => member.userId === me.id))
            .map((group) => this.toGroupResponse(group, me.id)),
        },
      }
    })

    this.route('POST', '/groups', (request) => {
      const me = this.requireUser(request)
      const payload = body<{ name?: string; description?: string; visibility?: 'PUBLIC' | 'PRIVATE'; capacity?: number }>(request)
      const name = payload.name?.trim() ?? ''
      if (!name) throw new DemoApiError(400, 'COMMON-001', '길드 이름을 입력해 주세요.')
      if (store.groups.some((group) => group.name === name)) {
        throw new DemoApiError(409, 'GROUP-001', '이미 같은 이름의 길드가 있어요.')
      }
      const created = store.addGroup({
        name,
        description: payload.description?.trim() ?? '',
        visibility: payload.visibility === 'PRIVATE' ? 'PRIVATE' : 'PUBLIC',
        capacity: Math.min(Math.max(Number(payload.capacity) || 10, 2), 50),
        joinCode: randomJoinCode(),
        ownerUserId: me.id,
        createdAt: nowIso(),
        members: [{ userId: me.id, role: 'OWNER', joinedAt: nowIso() }],
      })
      return { status: 201, data: this.toGroupResponse(created, me.id) }
    })

    this.route('POST', '/groups/join', (request) => {
      const me = this.requireUser(request)
      const { groupCode } = body<{ groupCode?: string }>(request)
      const group = groupCode ? store.findGroupByCode(groupCode) : undefined
      if (!group) throw new DemoApiError(404, 'GROUP-002', '해당 코드의 길드를 찾을 수 없어요.')
      this.joinGroup(group, me.id)
      return { data: this.toGroupResponse(group, me.id) }
    })

    this.route('GET', '/groups/:groupId', (request, params) => {
      const me = this.requireUser(request)
      const group = this.requireGroup(params.groupId)
      return {
        data: {
          ...this.toGroupResponse(group, me.id),
          memberList: group.members.map((member) => ({
            userId: member.userId,
            nickname: store.findUser(member.userId)?.nickname ?? '탈퇴한 회원',
            role: member.role,
            joinedAt: member.joinedAt,
          })),
        },
      }
    })

    this.route('POST', '/groups/:groupId/join', (request, params) => {
      const me = this.requireUser(request)
      const group = this.requireGroup(params.groupId)
      if (group.visibility === 'PRIVATE') {
        throw new DemoApiError(403, 'GROUP-003', '비공개 길드는 초대 코드로만 입장할 수 있어요.')
      }
      this.joinGroup(group, me.id)
      return { data: this.toGroupResponse(group, me.id) }
    })

    this.route('POST', '/groups/:groupId/leave', (request, params) => {
      const me = this.requireUser(request)
      const group = this.requireGroup(params.groupId)
      if (group.ownerUserId === me.id) {
        throw new DemoApiError(400, 'GROUP-004', '방장은 길드를 삭제해야 나갈 수 있어요.')
      }
      group.members = group.members.filter((member) => member.userId !== me.id)
      store.touchGroups()
      return { data: null }
    })

    this.route('DELETE', '/groups/:groupId', (request, params) => {
      const me = this.requireUser(request)
      const group = this.requireGroup(params.groupId)
      if (group.ownerUserId !== me.id) throw new DemoApiError(403, 'GROUP-005', '방장만 길드를 삭제할 수 있어요.')
      if (group.groupId < 1000) throw new DemoApiError(403, DEMO_UNSUPPORTED_CODE, '전시용 시드 길드는 삭제할 수 없어요.')
      store.removeGroup(group.groupId)
      return { data: null }
    })

    this.route('DELETE', '/groups/:groupId/members/:userId', (request, params) => {
      const me = this.requireUser(request)
      const group = this.requireGroup(params.groupId)
      if (group.ownerUserId !== me.id) throw new DemoApiError(403, 'GROUP-005', '방장만 길드원을 내보낼 수 있어요.')
      const target = Number(params.userId)
      if (target === me.id) throw new DemoApiError(400, 'GROUP-006', '자기 자신은 내보낼 수 없어요.')
      group.members = group.members.filter((member) => member.userId !== target)
      store.touchGroups()
      return { data: null }
    })

    // 길드 게시판
    this.route('GET', '/groups/:groupId/posts', (request, params) => {
      const me = this.requireUser(request)
      const group = this.requireGroup(params.groupId)
      const posts = store.posts
        .filter((post) => post.groupId === group.groupId)
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      return { data: { posts: posts.map((post) => this.toPostResponse(post, group, me.id)) } }
    })

    this.route('POST', '/groups/:groupId/posts', (request, params) => {
      const me = this.requireUser(request)
      const group = this.requireGroup(params.groupId)
      this.requireMember(group, me.id)
      const content = body<{ content?: string }>(request).content?.trim() ?? ''
      if (!content) throw new DemoApiError(400, 'COMMON-001', '내용을 입력해 주세요.')
      const created = store.addPost({ groupId: group.groupId, authorUserId: me.id, content, createdAt: nowIso(), comments: [] })
      return { status: 201, data: this.toPostResponse(created, group, me.id) }
    })

    this.route('PATCH', '/groups/:groupId/posts/:postId', (request, params) => {
      const me = this.requireUser(request)
      const group = this.requireGroup(params.groupId)
      const post = this.requireOwnPost(params.postId, me.id)
      const content = body<{ content?: string }>(request).content?.trim() ?? ''
      if (!content) throw new DemoApiError(400, 'COMMON-001', '내용을 입력해 주세요.')
      post.content = content
      store.save()
      return { data: this.toPostResponse(post, group, me.id) }
    })

    this.route('DELETE', '/groups/:groupId/posts/:postId', (request, params) => {
      const me = this.requireUser(request)
      const post = this.requireOwnPost(params.postId, me.id)
      store.removePost(post.postId)
      return { data: null }
    })

    this.route('POST', '/groups/:groupId/posts/:postId/comments', (request, params) => {
      const me = this.requireUser(request)
      const group = this.requireGroup(params.groupId)
      this.requireMember(group, me.id)
      const post = store.findPost(Number(params.postId))
      if (!post) throw new DemoApiError(404, 'GROUP-007', '게시글을 찾을 수 없어요.')
      const content = body<{ content?: string }>(request).content?.trim() ?? ''
      if (!content) throw new DemoApiError(400, 'COMMON-001', '내용을 입력해 주세요.')
      const comment = { commentId: store.nextId(), postId: post.postId, authorUserId: me.id, content, createdAt: nowIso() }
      post.comments.push(comment)
      store.save()
      return { status: 201, data: this.toCommentResponse(comment, me.id) }
    })

    this.route('PATCH', '/groups/:groupId/posts/:postId/comments/:commentId', (request, params) => {
      const me = this.requireUser(request)
      const comment = this.requireOwnComment(params.postId, params.commentId, me.id)
      const content = body<{ content?: string }>(request).content?.trim() ?? ''
      if (!content) throw new DemoApiError(400, 'COMMON-001', '내용을 입력해 주세요.')
      comment.content = content
      store.save()
      return { data: this.toCommentResponse(comment, me.id) }
    })

    this.route('DELETE', '/groups/:groupId/posts/:postId/comments/:commentId', (request, params) => {
      const me = this.requireUser(request)
      const post = store.findPost(Number(params.postId))
      this.requireOwnComment(params.postId, params.commentId, me.id)
      if (post) {
        post.comments = post.comments.filter((comment) => comment.commentId !== Number(params.commentId))
        store.save()
      }
      return { data: null }
    })

    // 랜덤 매칭 / 대기방 — 실시간 시뮬레이션 모듈에 위임
    this.route('POST', '/match/join', (request) => {
      const identity = this.requireIdentity(request)
      const { gameType } = body<{ gameType?: string }>(request)
      return { data: realtime.joinMatch(identity, String(gameType ?? '')) }
    })
    this.route('DELETE', '/match/cancel', (request) => {
      const identity = this.requireIdentity(request)
      return { data: realtime.cancelMatch(identity) }
    })
    this.route('POST', '/waiting-rooms', (request) => {
      const identity = this.requireIdentity(request)
      const { gameName } = body<{ gameName?: string }>(request)
      return { status: 201, data: realtime.createInviteRoom(identity, String(gameName ?? '')) }
    })
    this.route('POST', '/waiting-rooms/join', (request) => {
      const identity = this.requireIdentity(request)
      const { roomCode } = body<{ roomCode?: string }>(request)
      return { data: realtime.joinInviteRoom(identity, String(roomCode ?? '')) }
    })
    this.route('POST', '/waiting-rooms/:roomId/leave', (request, params) => {
      const identity = this.requireIdentity(request)
      realtime.leaveRoom(identity, params.roomId)
      return { data: null }
    })
  }

  // --- 응답 변환 ---

  private toRankingEntry(
    entry: { rank: number; userId: number; value: number; achievedAt: string },
    gameName: GameName,
    weekStart: string,
    withAchievedAt: boolean,
  ) {
    const trend = this.store.trends.find(
      (candidate) =>
        candidate.userId === entry.userId &&
        candidate.gameName === gameName &&
        candidate.weekStart === weekStart,
    )
    return {
      rank: entry.rank,
      userId: entry.userId,
      nickname: this.store.findUser(entry.userId)?.nickname ?? '플레이어',
      value: entry.value,
      achievedAt: withAchievedAt ? entry.achievedAt : null,
      trend: trend?.trend ?? null,
    }
  }

  private toGroupResponse(group: DemoGroup, viewerId: number) {
    const isJoined = group.members.some((member) => member.userId === viewerId)
    return {
      groupId: group.groupId,
      name: group.name,
      description: group.description || null,
      members: group.members.length,
      capacity: group.capacity,
      visibility: group.visibility,
      leader: this.store.findUser(group.ownerUserId)?.nickname ?? null,
      isOwner: group.ownerUserId === viewerId,
      isJoined,
      joinCode: isJoined ? group.joinCode : null,
      createdAt: group.createdAt,
    }
  }

  private toCommentResponse(
    comment: { commentId: number; authorUserId: number; content: string; createdAt: string },
    viewerId: number,
  ) {
    return {
      commentId: comment.commentId,
      author: this.store.findUser(comment.authorUserId)?.nickname ?? null,
      content: comment.content,
      createdAt: comment.createdAt,
      mine: comment.authorUserId === viewerId,
    }
  }

  private toPostResponse(post: DemoPost, group: DemoGroup, viewerId: number) {
    return {
      postId: post.postId,
      author: this.store.findUser(post.authorUserId)?.nickname ?? null,
      isLeader: post.authorUserId === group.ownerUserId,
      content: post.content,
      createdAt: post.createdAt,
      mine: post.authorUserId === viewerId,
      comments: post.comments.map((comment) => this.toCommentResponse(comment, viewerId)),
    }
  }

  // --- 길드 헬퍼 ---

  private requireGroup(groupId: string): DemoGroup {
    const group = this.store.findGroup(Number(groupId))
    if (!group) throw new DemoApiError(404, 'GROUP-002', '길드를 찾을 수 없어요.')
    return group
  }

  private requireMember(group: DemoGroup, userId: number): void {
    if (!group.members.some((member) => member.userId === userId)) {
      throw new DemoApiError(403, 'GROUP-008', '길드원만 이용할 수 있어요.')
    }
  }

  private joinGroup(group: DemoGroup, userId: number): void {
    if (group.members.some((member) => member.userId === userId)) {
      throw new DemoApiError(409, 'GROUP-009', '이미 가입한 길드예요.')
    }
    if (group.members.length >= group.capacity) {
      throw new DemoApiError(409, 'GROUP-010', '정원이 가득 찬 길드예요.')
    }
    group.members.push({ userId, role: 'MEMBER', joinedAt: nowIso() })
    this.store.touchGroups()
  }

  private requireOwnPost(postId: string, userId: number): DemoPost {
    const post = this.store.findPost(Number(postId))
    if (!post) throw new DemoApiError(404, 'GROUP-007', '게시글을 찾을 수 없어요.')
    if (post.authorUserId !== userId) throw new DemoApiError(403, 'GROUP-011', '본인 글만 수정·삭제할 수 있어요.')
    return post
  }

  private requireOwnComment(postId: string, commentId: string, userId: number) {
    const post = this.store.findPost(Number(postId))
    const comment = post?.comments.find((candidate) => candidate.commentId === Number(commentId))
    if (!comment) throw new DemoApiError(404, 'GROUP-012', '댓글을 찾을 수 없어요.')
    if (comment.authorUserId !== userId) throw new DemoApiError(403, 'GROUP-011', '본인 댓글만 수정·삭제할 수 있어요.')
    return comment
  }
}

function matchRoute(pattern: string[], actual: string[]): Record<string, string> | null {
  if (pattern.length !== actual.length) return null
  const params: Record<string, string> = {}
  for (let index = 0; index < pattern.length; index += 1) {
    const expected = pattern[index]
    const value = actual[index]
    if (expected.startsWith(':')) {
      params[expected.slice(1)] = decodeURIComponent(value)
    } else if (expected !== value) {
      return null
    }
  }
  return params
}

function json(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function randomJoinCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let index = 0; index < 6; index += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)]
  }
  return code
}
