import { EightBallComputedState, MatchEventPayload, PlayerSlotState } from './types'

export function emptyEightBallState(slots: number[]): EightBallComputedState {
  const wins: Record<number, number> = {}
  for (const s of slots) wins[s] = 0
  return { wins }
}

export function applyEightBallEvent(
  state: EightBallComputedState,
  event: MatchEventPayload
): EightBallComputedState {
  const next = { wins: { ...state.wins } }
  switch (event.type) {
    case 'score_eight_ball_win':
      next.wins[event.winnerSlot] = (next.wins[event.winnerSlot] ?? 0) + 1
      break
    default:
      break
  }
  return next
}

export function validateEightBallEvent(
  event: MatchEventPayload,
  players: PlayerSlotState[]
): void {
  const slots = new Set(players.map((p) => p.slot))
  if (event.type === 'score_eight_ball_win') {
    if (!slots.has(event.winnerSlot)) {
      throw new Error('winnerSlot 不存在')
    }
  }
}
