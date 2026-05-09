export interface NineBallRules {
  bigJack: number
  smallJack: number
  golden9: number
  normalWin: number
  foulCompensation: number
}

export interface EightBallRules {
  targetWins: number
}

export const DEFAULT_NINE_BALL_RULES: NineBallRules = {
  bigJack: 10,
  smallJack: 7,
  golden9: 4,
  normalWin: 4,
  foulCompensation: 1
}

export interface PlayerSlotState {
  slot: number
  name: string
  userId: string | null
}

export interface NineBallComputedState {
  scores: Record<number, number>
  stats: Record<
    number,
    { bigJack: number; smallJack: number; golden9: number; normalWin: number }
  >
}

export interface EightBallComputedState {
  wins: Record<number, number>
}

/**
 * 事件 payload 规范（对应 shared-match-backend.md §4.4.4）
 */
export type MatchEventPayload =
  | { type: 'score_normal_win'; winnerSlot: number; targetSlot: number }
  | { type: 'score_small_jack'; winnerSlot: number; targetSlot: number }
  | { type: 'score_big_jack'; winnerSlot: number }
  | { type: 'score_golden9'; winnerSlot: number }
  | { type: 'score_eight_ball_win'; winnerSlot: number }
  | { type: 'foul'; foulerSlot: number; compensateSlot: number }
  | { type: 'rename'; slot: number; oldName: string; newName: string }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'undo'; targetEventId: string }
  | { type: 'seat_occupy'; slot: number; userId: string; name: string }
  | { type: 'seat_leave'; slot: number; userId: string | null }
  | { type: 'seat_kick'; slot: number; userId: string | null; adminId: string; reason: string }
  | { type: 'end'; endedBy: string; reason?: string }
  | { type: 'force_end'; adminId: string; reason: string }
  | { type: 'score_correct'; adminId: string; before: unknown; after: unknown; reason: string }

export type MatchEventType = MatchEventPayload['type']
