import { BracketMatchStatus, MatchType, Prisma } from '@prisma/client'
import {
  applyNineBallEvent,
  emptyNineBallState
} from '../match/state-machine/nine-ball'
import {
  applyEightBallEvent,
  emptyEightBallState
} from '../match/state-machine/eight-ball'
import type {
  MatchEventPayload,
  NineBallRules,
  PlayerSlotState
} from '../match/state-machine/types'
import { advanceFromCompletedMatch } from './bracket-advance'

/**
 * Match 结束后的 bracket 推进：
 *   1. 找 match.tournamentBracketMatch（通过 matchId 反查 bracket）
 *   2. 复用 state-machine 算分：slot 1 / slot 2 谁高谁赢
 *   3. 写 bracket.winnerRegistrationId + status=completed
 *   4. 调统一推进 advanceFromCompletedMatch（跟指针：winner/loser 进下一场，
 *      处理 BYE 连锁、双败总决赛/决胜局、单败完赛；存量单败回退 floor）
 */
export async function resolveAfterMatchEnd(
  tx: Prisma.TransactionClient,
  matchId: string
): Promise<void> {
  const match = await tx.match.findUnique({
    where: { id: matchId },
    include: { players: { orderBy: { slot: 'asc' } } }
  })
  if (!match) return
  const bm = await tx.tournamentBracketMatch.findFirst({
    where: { matchId }
  })
  if (!bm) return
  if (
    bm.status !== BracketMatchStatus.in_progress &&
    bm.status !== BracketMatchStatus.ready
  ) {
    return
  }
  if (!bm.playerARegistrationId || !bm.playerBRegistrationId) return

  const events = await tx.matchEvent.findMany({
    where: { matchId },
    orderBy: { serverSeq: 'asc' }
  })
  const currentPlayers: PlayerSlotState[] = match.players
    .filter((p) => p.isCurrent)
    .map((p) => ({ slot: p.slot, name: p.displayName, userId: p.userId }))

  let s1 = 0
  let s2 = 0
  if (match.type === MatchType.nine_ball) {
    let state = emptyNineBallState(currentPlayers.map((p) => p.slot))
    const rules = match.rulesJson as unknown as NineBallRules
    for (const e of events) {
      if (e.undone) continue
      const p = { type: e.type, ...(e.payloadJson as object) } as MatchEventPayload
      state = applyNineBallEvent(state, p, rules, currentPlayers)
    }
    s1 = state.scores[1] ?? 0
    s2 = state.scores[2] ?? 0
  } else {
    let state = emptyEightBallState(currentPlayers.map((p) => p.slot))
    for (const e of events) {
      if (e.undone) continue
      const p = { type: e.type, ...(e.payloadJson as object) } as MatchEventPayload
      state = applyEightBallEvent(state, p)
    }
    s1 = state.wins[1] ?? 0
    s2 = state.wins[2] ?? 0
  }

  let winnerRegId: string
  if (s1 > s2) winnerRegId = bm.playerARegistrationId
  else if (s2 > s1) winnerRegId = bm.playerBRegistrationId
  else winnerRegId = bm.playerARegistrationId // 平局兜底：A 方胜

  await tx.tournamentBracketMatch.update({
    where: { id: bm.id },
    data: {
      status: BracketMatchStatus.completed,
      winnerRegistrationId: winnerRegId
    }
  })
  await advanceFromCompletedMatch(tx, bm.id)
}
