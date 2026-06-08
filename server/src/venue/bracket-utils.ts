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

// ============================================================
// 双败淘汰（double elimination）
// ============================================================

export type DePlanGroup = 'winners' | 'losers' | 'grand_final'
export type DePlanSlot = 'A' | 'B'

/**
 * 一个 bracket 节点的「计划」。用稳定 key 表达拓扑，service 层落库时再把
 * key 翻译成真实 bracketMatch id（winnerToKey/loserToKey → winnerToMatchId/…）。
 */
export interface DePlanNode {
  key: string
  group: DePlanGroup
  /** 组内轮次（WB:1..k，LB:1..2(k-1)，GF:1，决胜局:2） */
  round: number
  slot: number
  /** 仅 WB 首轮：该位置的 1-indexed seed，BYE 为 null */
  seedA?: number | null
  seedB?: number | null
  winnerToKey?: string
  winnerToSlot?: DePlanSlot
  loserToKey?: string
  loserToSlot?: DePlanSlot
}

export interface DoubleElimPlan {
  nodes: DePlanNode[]
  wbRounds: number
  lbRounds: number
  /** WB 首轮 seed 顺序（与 planBracket 一致），service 落库时用 */
  firstRoundSeeds: Array<number | null>
}

const GF_KEY = 'GF'
const GFR_KEY = 'GFR'
const wKey = (r: number, s: number) => `W${r}_${s}`
const lKey = (li: number, s: number) => `L${li}_${s}`

/**
 * 生成双败对阵图计划（纯函数，不碰 DB）。
 *
 * 结构：
 *  - 胜者组 WB：完全复用单败 planBracket（k 轮，2^k 位，BYE 同单败）。
 *  - 败者组 LB：2(k-1) 轮。size 序列 = [2^(k-2),2^(k-2),2^(k-3),2^(k-3),…,1,1]。
 *    奇偶交替 minor（LB 内部对打、人数减半）/ major（LB 胜者 vs 当轮下沉的 WB 败者）。
 *  - 总决赛 GF：WB 冠军(A) vs LB 冠军(B)；决胜局 GFR 预生成空壳，推进期按条件激活。
 *
 * WB 败者下沉（loserTo）：
 *  - WB R1 各场败者 → LB round1，前半进 A、后半逆序进 B（cross，防过早重赛）。
 *  - WB Rr(r≥2) 各场败者 → LB major round 2(r-1) 的 A 侧，r 偶逆序 / r 奇正序。
 *  - WB 决赛(r=k)败者自然落入 LB 决赛 A 侧。
 *
 * 8 人(k=3)黄金映射见 scripts/bracket-check.ts 的断言。
 */
export function planDoubleElim(n: number): DoubleElimPlan {
  const base = planBracket(n)
  const k = base.rounds
  if (k < 2) throw new Error('双败淘汰至少需要 3 名选手')

  const nodes: DePlanNode[] = []
  const byKey = new Map<string, DePlanNode>()
  const add = (node: DePlanNode) => {
    byKey.set(node.key, node)
    nodes.push(node)
  }

  // ---- 胜者组 WB ----
  for (let r = 1; r <= k; r++) {
    const cnt = base.matchesPerRound[r - 1]
    for (let s = 0; s < cnt; s++) {
      const node: DePlanNode = { key: wKey(r, s), group: 'winners', round: r, slot: s }
      if (r < k) {
        node.winnerToKey = wKey(r + 1, Math.floor(s / 2))
        node.winnerToSlot = s % 2 === 0 ? 'A' : 'B'
      } else {
        node.winnerToKey = GF_KEY
        node.winnerToSlot = 'A'
      }
      if (r === 1) {
        node.seedA = base.firstRoundSeeds[2 * s] ?? null
        node.seedB = base.firstRoundSeeds[2 * s + 1] ?? null
      }
      add(node)
    }
  }

  // ---- 败者组 LB ----
  const lbRounds = 2 * (k - 1)
  const sizes: number[] = [] // sizes[li-1] = LB 第 li 轮对阵数
  for (let j = k - 2; j >= 0; j--) {
    sizes.push(2 ** j, 2 ** j)
  }
  for (let li = 1; li <= lbRounds; li++) {
    const cnt = sizes[li - 1]
    for (let s = 0; s < cnt; s++) {
      const node: DePlanNode = { key: lKey(li, s), group: 'losers', round: li, slot: s }
      if (li === lbRounds) {
        node.winnerToKey = GF_KEY
        node.winnerToSlot = 'B'
      } else if (sizes[li] === sizes[li - 1]) {
        // 下一轮同 size = major（下一轮 A 侧留给 WB 下沉者），LB 胜者进 B 侧同位
        node.winnerToKey = lKey(li + 1, s)
        node.winnerToSlot = 'B'
      } else {
        // 下一轮减半 = minor，两两合并
        node.winnerToKey = lKey(li + 1, Math.floor(s / 2))
        node.winnerToSlot = s % 2 === 0 ? 'A' : 'B'
      }
      add(node)
    }
  }

  // ---- 总决赛 + 决胜局 ----
  add({ key: GF_KEY, group: 'grand_final', round: 1, slot: 0 }) // winnerTo 留空，推进期特判
  add({ key: GFR_KEY, group: 'grand_final', round: 2, slot: 0 })

  // ---- WB 败者下沉接线 ----
  // R1：前半 → L1 的 A 侧（正序），后半 → L1 的 B 侧（逆序，cross）
  const m1 = sizes[0]
  const wbR1 = base.matchesPerRound[0]
  for (let i = 0; i < wbR1; i++) {
    const node = byKey.get(wKey(1, i))!
    if (i < m1) {
      node.loserToKey = lKey(1, i)
      node.loserToSlot = 'A'
    } else {
      node.loserToKey = lKey(1, 2 * m1 - 1 - i)
      node.loserToSlot = 'B'
    }
  }
  // Rr(r≥2)：→ LB major round 2(r-1) 的 A 侧；r 偶逆序、r 奇正序
  for (let r = 2; r <= k; r++) {
    const cnt = base.matchesPerRound[r - 1]
    const li = 2 * (r - 1)
    const rev = r % 2 === 0
    for (let i = 0; i < cnt; i++) {
      const node = byKey.get(wKey(r, i))!
      const tgt = rev ? cnt - 1 - i : i
      node.loserToKey = lKey(li, tgt)
      node.loserToSlot = 'A'
    }
  }

  return { nodes, wbRounds: k, lbRounds, firstRoundSeeds: base.firstRoundSeeds }
}
