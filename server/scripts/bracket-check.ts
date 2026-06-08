/**
 * 双败 bracket 生成器校验（无 DB，纯断言）。
 * 运行：cd server && npx ts-node scripts/bracket-check.ts
 */
import { planDoubleElim, type DePlanNode } from '../src/venue/bracket-utils'

let failed = 0
function ok(cond: boolean, msg: string) {
  if (cond) console.log('  ✓', msg)
  else {
    console.error('  ✗ FAIL:', msg)
    failed++
  }
}
function ptr(n: DePlanNode | undefined, which: 'w' | 'l') {
  if (!n) return 'MISSING'
  return which === 'w'
    ? `${n.winnerToKey ?? '-'}/${n.winnerToSlot ?? '-'}`
    : `${n.loserToKey ?? '-'}/${n.loserToSlot ?? '-'}`
}

function check(n: number, expectNodes: number) {
  console.log(`\n== planDoubleElim(${n}) ==`)
  const plan = planDoubleElim(n)
  const map = new Map(plan.nodes.map((nd) => [nd.key, nd]))
  ok(plan.nodes.length === expectNodes, `节点数 ${plan.nodes.length} == ${expectNodes}`)
  ok(map.has('GF') && map.has('GFR'), 'GF + 决胜局空壳存在')

  // 连通性：所有 winnerTo/loserTo 指向的 key 都存在
  let dangling = 0
  for (const nd of plan.nodes) {
    if (nd.winnerToKey && !map.has(nd.winnerToKey)) dangling++
    if (nd.loserToKey && !map.has(nd.loserToKey)) dangling++
  }
  ok(dangling === 0, `无悬空指针（dangling=${dangling}）`)

  // GF 入度=2（WB 冠军 winnerTo + LB 冠军 winnerTo）
  const intoGF = plan.nodes.filter(
    (x) => x.winnerToKey === 'GF' || x.loserToKey === 'GF'
  ).length
  ok(intoGF === 2, `GF 入度 ${intoGF} == 2`)

  // 每个 winners 非首轮节点 + 每个 losers 节点，入度（被指向次数）正确性抽查：
  // 末轮 WB / 末轮 LB 都应指向 GF
  const wbFinal = map.get(`W${plan.wbRounds}_0`)
  const lbFinal = map.get(`L${plan.lbRounds}_0`)
  ok(wbFinal?.winnerToKey === 'GF' && wbFinal?.winnerToSlot === 'A', 'WB 冠军 → GF.A')
  ok(lbFinal?.winnerToKey === 'GF' && lbFinal?.winnerToSlot === 'B', 'LB 冠军 → GF.B')
  return { plan, map }
}

// ---- n=8 (k=3) 黄金表 ----
const { map: m8 } = check(8, 15)
console.log('  -- 8 人黄金下沉表 (loserTo) --')
const goldLoser: Array<[string, string]> = [
  ['W1_0', 'L1_0/A'], ['W1_1', 'L1_1/A'], ['W1_2', 'L1_1/B'], ['W1_3', 'L1_0/B'],
  ['W2_0', 'L2_1/A'], ['W2_1', 'L2_0/A'], ['W3_0', 'L4_0/A']
]
for (const [key, exp] of goldLoser) ok(ptr(m8.get(key), 'l') === exp, `${key} loser→ ${exp}`)
console.log('  -- 8 人 LB 胜者流向 (winnerTo) --')
const goldLbWinner: Array<[string, string]> = [
  ['L1_0', 'L2_0/B'], ['L1_1', 'L2_1/B'], ['L2_0', 'L3_0/A'], ['L2_1', 'L3_0/B'],
  ['L3_0', 'L4_0/B'], ['L4_0', 'GF/B']
]
for (const [key, exp] of goldLbWinner) ok(ptr(m8.get(key), 'w') === exp, `${key} winner→ ${exp}`)
console.log('  -- 8 人 WB 胜者流向 --')
const goldWbWinner: Array<[string, string]> = [
  ['W1_0', 'W2_0/A'], ['W1_1', 'W2_0/B'], ['W1_2', 'W2_1/A'], ['W1_3', 'W2_1/B'],
  ['W2_0', 'W3_0/A'], ['W2_1', 'W3_0/B'], ['W3_0', 'GF/A']
]
for (const [key, exp] of goldWbWinner) ok(ptr(m8.get(key), 'w') === exp, `${key} winner→ ${exp}`)

// ---- 其它人数：结构 ----
check(4, 7) // WB 2+1=3, LB [1,1]=2, GF+GFR=2
check(5, 15) // k=3
check(6, 15) // k=3
check(16, 31) // k=4: WB 8+4+2+1=15, LB [4,4,2,2,1,1]=14, GF+GFR=2

// ---- n=2 应报错 ----
console.log('\n== planDoubleElim(2) 应抛错 ==')
try {
  planDoubleElim(2)
  ok(false, '应抛错但没抛')
} catch {
  ok(true, '2 人正确拒绝')
}

console.log('\n' + (failed === 0 ? '✅ ALL PASS' : `❌ ${failed} FAILED`))
process.exit(failed === 0 ? 0 : 1)
