/**
 * 战报叙事化文案：从 match detail 数据里提炼 headline / subline / championSlot。
 *
 * 拆成独立模块的原因：
 *   - MatchService.replay() 需要它（公开接口的 narrative 字段）
 *   - ReplayJobService.generate() 需要它（绘到海报上）
 *
 * 纯函数无依赖，避免 NestJS module 循环引用。
 */

import { MatchType } from '@prisma/client'

export interface NarrativeInput {
  type: 'nine_ball' | 'eight_ball' | MatchType
  players: Array<{
    slot: number
    displayName: string
    isCurrent: boolean
  }>
  computed: {
    scores?: Record<number, number>
    stats?: Record<
      number,
      { bigJack: number; smallJack: number; golden9: number; normalWin: number }
    >
    wins?: Record<number, number>
  }
  timer: { accumulatedMs: number }
}

export interface Narrative {
  headline: string
  subline: string
  championSlot: number | null
  type: 'nine_ball' | 'eight_ball'
}

export function computeNarrative(input: NarrativeInput): Narrative {
  const isNineBall = input.type === MatchType.nine_ball
  const players = input.players.filter((p) => p.isCurrent)

  const score = (slot: number) =>
    isNineBall
      ? input.computed.scores?.[slot] ?? 0
      : input.computed.wins?.[slot] ?? 0

  const ranked = [...players].sort((a, b) => score(b.slot) - score(a.slot))
  const champion = ranked[0] ?? null
  const runnerUp = ranked[1] ?? null

  let headline = '一场精彩对决'
  if (champion && runnerUp && ranked.length === 2) {
    headline = `${champion.displayName} ${score(champion.slot)}:${score(runnerUp.slot)} 击败 ${runnerUp.displayName}`
  } else if (champion && ranked.length > 2) {
    headline = `${champion.displayName} 拿下第一`
  }

  // sub line：时长 + (九球) 黄金 9 / 大金统计
  const minutes = Math.round(input.timer.accumulatedMs / 60000)
  const subParts: string[] = []
  if (minutes > 0) subParts.push(`时长 ${minutes} 分钟`)
  if (isNineBall && champion) {
    const stats = input.computed.stats?.[champion.slot]
    if (stats) {
      if (stats.golden9) subParts.push(`黄金9 ×${stats.golden9}`)
      else if (stats.bigJack) subParts.push(`大金 ×${stats.bigJack}`)
      else if (stats.smallJack) subParts.push(`小金 ×${stats.smallJack}`)
    }
  }

  return {
    headline,
    subline: subParts.join(' · ') || '快速对局',
    championSlot: champion?.slot ?? null,
    type: isNineBall ? 'nine_ball' : 'eight_ball'
  }
}
