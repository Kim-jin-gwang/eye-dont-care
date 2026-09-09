/**
 * 주간 랭킹 온-리드 집계 — 백엔드 `RankingService`/`RankingGame`의 규칙을 그대로 옮겼다.
 *
 * - 게임별 랭킹 대상 모드와 집계 방식(BEST_SCORE / WIN_COUNT), 표시 단위는 `RankingGame` enum과 동일.
 * - 이번 주(KST 월요일 00:00 ~ 다음 월요일) 경기만 대상. 회원(USER) 참가자만 순위에 오른다.
 * - 동점은 먼저 달성한 순(achievedAt 오름차순).
 */
import type { GameName } from '../types/waitingRoom'
import type { GameResultPlayMode } from '../types/gameResult'
import { findGame, weekStartMs, type DemoStore } from './store'

export type RankType = 'WIN_COUNT' | 'BEST_SCORE'

export interface RankingGameConfig {
  gameName: GameName
  rankedMode: GameResultPlayMode
  rankType: RankType
  unit: string
}

export const RANKING_GAMES: RankingGameConfig[] = [
  { gameName: 'HOCKEY', rankedMode: 'RANDOM', rankType: 'WIN_COUNT', unit: 'win' },
  { gameName: 'EYEFIGHT', rankedMode: 'SOLO', rankType: 'BEST_SCORE', unit: 'second' },
  { gameName: 'DRAWING', rankedMode: 'AI', rankType: 'BEST_SCORE', unit: 'point' },
  { gameName: 'RHYTHM', rankedMode: 'SOLO', rankType: 'BEST_SCORE', unit: 'point' },
  { gameName: 'BLINK', rankedMode: 'SOLO', rankType: 'BEST_SCORE', unit: 'count' },
]

export function rankingConfigOf(gameName: string): RankingGameConfig | undefined {
  return RANKING_GAMES.find((config) => config.gameName === gameName)
}

export interface RankedUser {
  rank: number
  userId: number
  value: number
  achievedAt: string
}

interface Aggregate {
  value: number
  achievedAt: string
}

export function computeWeeklyRanking(
  store: DemoStore,
  config: RankingGameConfig,
  nowMs = Date.now(),
): RankedUser[] {
  const start = weekStartMs(nowMs)
  const end = start + 7 * 24 * 60 * 60 * 1000
  const byUser = new Map<number, Aggregate>()

  for (const result of store.results) {
    const game = findGame(result.gameId)
    if (
      !game ||
      game.gameName !== config.gameName ||
      game.playMode !== config.rankedMode
    ) {
      continue
    }
    const endedAt = Date.parse(result.endedAt)
    if (Number.isNaN(endedAt) || endedAt < start || endedAt >= end) continue

    for (const participant of result.participants) {
      if (participant.participantType !== 'USER' || participant.userId === null) {
        continue
      }
      const user = store.findUser(participant.userId)
      if (!user) continue // 탈퇴 회원은 랭킹에서 제외

      const current = byUser.get(participant.userId)
      if (config.rankType === 'WIN_COUNT') {
        if (participant.outcome !== 'WIN') continue
        if (!current) {
          byUser.set(participant.userId, { value: 1, achievedAt: result.endedAt })
        } else {
          current.value += 1
          if (Date.parse(result.endedAt) > Date.parse(current.achievedAt)) {
            current.achievedAt = result.endedAt
          }
        }
      } else {
        const score = participant.score
        if (score === null || score <= 0) continue
        if (!current || score > current.value) {
          byUser.set(participant.userId, { value: score, achievedAt: result.endedAt })
        } else if (
          score === current.value &&
          Date.parse(result.endedAt) < Date.parse(current.achievedAt)
        ) {
          current.achievedAt = result.endedAt
        }
      }
    }
  }

  return [...byUser.entries()]
    .sort(([, a], [, b]) => {
      if (b.value !== a.value) return b.value - a.value
      return Date.parse(a.achievedAt) - Date.parse(b.achievedAt)
    })
    .map(([userId, aggregate], index) => ({
      rank: index + 1,
      userId,
      value: aggregate.value,
      achievedAt: aggregate.achievedAt,
    }))
}

export function rankOf(ranked: RankedUser[], userId: number | null): number | null {
  if (userId === null) return null
  return ranked.find((entry) => entry.userId === userId)?.rank ?? null
}
