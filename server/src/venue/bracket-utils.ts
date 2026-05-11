/**
 * 单败淘汰赛 bracket 种子分布 + BYE 补齐工具。
 * 保证头部种子之间尽量晚相遇。
 */

/** 返回标准 seed order（1-indexed，长度 = 2^k） */
export function makeSeedOrder(k: number): number[] {
  if (k <= 0) throw new Error('k must be >= 1')
  if (k === 1) return [1, 2]
  const sub = makeSeedOrder(k - 1)
  const n = 2 ** k
  const out: number[] = []
  for (const s of sub) {
    out.push(s)
    out.push(n + 1 - s)
  }
  return out
}

/** ceil(log2(n))，n < 2 抛错 */
export function bracketPower(n: number): number {
  if (n < 2) throw new Error('至少需要 2 个报名者')
  let k = 1
  while (2 ** k < n) k++
  return k
}

export interface BracketPlan {
  /** 总位置数 = 2^k */
  totalSlots: number
  /** round 数量 = k */
  rounds: number
  /** 第 i 个首轮位置对应的 1-indexed seed；若 seed > 报名人数则是 BYE（用 null 替代） */
  firstRoundSeeds: Array<number | null>
  /** 每轮对阵数量：[R1 对阵数, R2, ..., 决赛 1] */
  matchesPerRound: number[]
}

/**
 * 根据报名人数生成 bracket 计划。
 *
 * 例：n=6 → totalSlots=8, k=3
 *   seedOrder=[1,8,4,5,2,7,3,6]
 *   n 之外视为 BYE：[1, null, 4, 5, 2, null, 3, 6]
 *   首轮 4 对：(1 vs BYE), (4 vs 5), (2 vs BYE), (3 vs 6)
 */
export function planBracket(n: number): BracketPlan {
  const k = bracketPower(n)
  const totalSlots = 2 ** k
  const order = makeSeedOrder(k)
  const firstRoundSeeds = order.map((s) => (s > n ? null : s))
  const matchesPerRound: number[] = []
  for (let r = 1; r <= k; r++) {
    matchesPerRound.push(totalSlots / 2 ** r)
  }
  return { totalSlots, rounds: k, firstRoundSeeds, matchesPerRound }
}
