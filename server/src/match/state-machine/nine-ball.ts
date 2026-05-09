import {
  MatchEventPayload,
  NineBallComputedState,
  NineBallRules,
  PlayerSlotState
} from './types'

export function emptyNineBallState(slots: number[]): NineBallComputedState {
  const scores: Record<number, number> = {}
  const stats: Record<
    number,
    { bigJack: number; smallJack: number; golden9: number; normalWin: number }
  > = {}
  for (const s of slots) {
    scores[s] = 0
    stats[s] = { bigJack: 0, smallJack: 0, golden9: 0, normalWin: 0 }
  }
  return { scores, stats }
}

export function applyNineBallEvent(
  state: NineBallComputedState,
  event: MatchEventPayload,
  rules: NineBallRules,
  players: PlayerSlotState[]
): NineBallComputedState {
  const next = clone(state)
  const playerSlots = players.map((p) => p.slot)

  switch (event.type) {
    case 'score_normal_win': {
      next.scores[event.winnerSlot] = (next.scores[event.winnerSlot] ?? 0) + rules.normalWin
      next.scores[event.targetSlot] = (next.scores[event.targetSlot] ?? 0) - rules.normalWin
      ensureStats(next, event.winnerSlot).normalWin += 1
      break
    }
    case 'score_small_jack': {
      next.scores[event.winnerSlot] = (next.scores[event.winnerSlot] ?? 0) + rules.smallJack
      next.scores[event.targetSlot] = (next.scores[event.targetSlot] ?? 0) - rules.smallJack
      ensureStats(next, event.winnerSlot).smallJack += 1
      break
    }
    case 'score_big_jack': {
      const otherCount = playerSlots.length - 1
      next.scores[event.winnerSlot] =
        (next.scores[event.winnerSlot] ?? 0) + rules.bigJack * otherCount
      for (const s of playerSlots) {
        if (s !== event.winnerSlot) {
          next.scores[s] = (next.scores[s] ?? 0) - rules.bigJack
        }
      }
      ensureStats(next, event.winnerSlot).bigJack += 1
      break
    }
    case 'score_golden9': {
      const otherCount = playerSlots.length - 1
      next.scores[event.winnerSlot] =
        (next.scores[event.winnerSlot] ?? 0) + rules.golden9 * otherCount
      for (const s of playerSlots) {
        if (s !== event.winnerSlot) {
          next.scores[s] = (next.scores[s] ?? 0) - rules.golden9
        }
      }
      ensureStats(next, event.winnerSlot).golden9 += 1
      break
    }
    case 'foul': {
      next.scores[event.compensateSlot] =
        (next.scores[event.compensateSlot] ?? 0) + rules.foulCompensation
      break
    }
    // 其他事件不影响九球得分（仅时间线层面）
    default:
      break
  }
  return next
}

function clone(s: NineBallComputedState): NineBallComputedState {
  return {
    scores: { ...s.scores },
    stats: Object.fromEntries(
      Object.entries(s.stats).map(([k, v]) => [k, { ...v }])
    )
  }
}

function ensureStats(state: NineBallComputedState, slot: number) {
  if (!state.stats[slot]) {
    state.stats[slot] = { bigJack: 0, smallJack: 0, golden9: 0, normalWin: 0 }
  }
  return state.stats[slot]
}

/**
 * 校验事件合法性（应用前调用）
 */
export function validateNineBallEvent(
  event: MatchEventPayload,
  players: PlayerSlotState[]
): void {
  const slots = new Set(players.map((p) => p.slot))
  switch (event.type) {
    case 'score_normal_win':
    case 'score_small_jack': {
      if (!slots.has(event.winnerSlot) || !slots.has(event.targetSlot)) {
        throw new Error('winnerSlot 或 targetSlot 不存在')
      }
      if (event.winnerSlot === event.targetSlot) {
        throw new Error('winnerSlot 不能等于 targetSlot')
      }
      break
    }
    case 'score_big_jack':
    case 'score_golden9': {
      if (!slots.has(event.winnerSlot)) {
        throw new Error('winnerSlot 不存在')
      }
      break
    }
    case 'foul': {
      if (!slots.has(event.foulerSlot) || !slots.has(event.compensateSlot)) {
        throw new Error('foulerSlot 或 compensateSlot 不存在')
      }
      break
    }
    default:
      break
  }
}
