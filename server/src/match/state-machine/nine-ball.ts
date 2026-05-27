import {
  DEFAULT_NINE_BALL_RULES,
  MatchEventPayload,
  NineBallComputedState,
  NineBallRules,
  PlayerSlotState
} from './types'

// 历史数据 / 赛事链路里 rulesJson 可能缺字段；把 undefined 回落到 default，
// 避免 `0 + undefined = NaN` 然后 JSON 序列化成 null。
function normalizeRulesRuntime(rules: Partial<NineBallRules>): NineBallRules {
  return {
    normalWin: rules.normalWin ?? DEFAULT_NINE_BALL_RULES.normalWin,
    smallJack: rules.smallJack ?? DEFAULT_NINE_BALL_RULES.smallJack,
    bigJack: rules.bigJack ?? DEFAULT_NINE_BALL_RULES.bigJack,
    golden9: rules.golden9 ?? DEFAULT_NINE_BALL_RULES.golden9,
    foulCompensation:
      rules.foulCompensation ?? DEFAULT_NINE_BALL_RULES.foulCompensation
  }
}

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
  rulesInput: Partial<NineBallRules>,
  players: PlayerSlotState[]
): NineBallComputedState {
  const rules = normalizeRulesRuntime(rulesInput)
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
      // 犯规者 -foulCompensation，被补偿方 +foulCompensation（总分守恒）。
      // 若 compensate 选了 fouler 自己，二者相加即净零，等价于"撤销本次犯规"的取消语义。
      next.scores[event.foulerSlot] =
        (next.scores[event.foulerSlot] ?? 0) - rules.foulCompensation
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
