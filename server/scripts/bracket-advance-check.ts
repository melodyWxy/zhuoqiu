/**
 * 双败推进校验：用内存 fake-tx 跑完整赛事，断言 BYE 连锁 / LB 落位 / GF 两分支 /
 * 决胜局 / 幂等 / 单败 legacy 回归。
 * 运行：cd server && npx ts-node scripts/bracket-advance-check.ts
 */
import { advanceFromCompletedMatch } from '../src/venue/bracket-advance'
import { planDoubleElim, planBracket } from '../src/venue/bracket-utils'

let failed = 0
const ok = (cond: boolean, msg: string) => {
  if (cond) console.log('  ✓', msg)
  else {
    console.error('  ✗ FAIL:', msg)
    failed++
  }
}

// ---------- 内存 fake-tx ----------
interface Row {
  id: string
  tournamentId: string
  bracketGroup: string
  round: number
  slotInRound: number
  playerARegistrationId: string | null
  playerBRegistrationId: string | null
  winnerRegistrationId: string | null
  status: string
  winnerToMatchId: string | null
  winnerToSlot: string | null
  loserToMatchId: string | null
  loserToSlot: string | null
  slotASettled: boolean
  slotBSettled: boolean
}
interface State {
  rows: Row[]
  tour: { id: string; status: string }
}
function matchWhere(r: Row, w: any): boolean {
  for (const k of Object.keys(w)) {
    if (k === 'winnerToMatchId') {
      if (w[k]?.not === null) {
        if (r.winnerToMatchId === null) return false
      } else if (r.winnerToMatchId !== w[k]) return false
    } else if ((r as any)[k] !== w[k]) return false
  }
  return true
}
function makeTx(state: State): any {
  return {
    tournamentBracketMatch: {
      findUnique: async ({ where }: any) =>
        state.rows.find((r) => r.id === where.id) ?? null,
      findFirst: async ({ where }: any) =>
        state.rows.find((r) => matchWhere(r, where)) ?? null,
      findMany: async ({ where }: any) => state.rows.filter((r) => matchWhere(r, where)),
      count: async ({ where }: any) => state.rows.filter((r) => matchWhere(r, where)).length,
      update: async ({ where, data }: any) => {
        const r = state.rows.find((x) => x.id === where.id)!
        Object.assign(r, data)
        return r
      }
    },
    tournament: {
      findUnique: async ({ where }: any) =>
        state.tour.id === where.id ? state.tour : null,
      update: async ({ data }: any) => {
        Object.assign(state.tour, data)
        return state.tour
      }
    }
  }
}

// ---------- 建赛事（双败）----------
async function buildDouble(tid: string, n: number): Promise<State> {
  const plan = planDoubleElim(n)
  const state: State = { rows: [], tour: { id: tid, status: 'in_progress' } }
  const id = (key: string) => `${tid}:${key}`
  for (const nd of plan.nodes) {
    state.rows.push({
      id: id(nd.key),
      tournamentId: tid,
      bracketGroup: nd.group,
      round: nd.round,
      slotInRound: nd.slot,
      playerARegistrationId: null,
      playerBRegistrationId: null,
      winnerRegistrationId: null,
      status: 'pending',
      winnerToMatchId: nd.winnerToKey ? id(nd.winnerToKey) : null,
      winnerToSlot: nd.winnerToSlot ?? null,
      loserToMatchId: nd.loserToKey ? id(nd.loserToKey) : null,
      loserToSlot: nd.loserToSlot ?? null,
      slotASettled: false,
      slotBSettled: false
    })
  }
  const tx = makeTx(state)
  // 种子 WB R1
  const r1 = state.rows.filter((r) => r.bracketGroup === 'winners' && r.round === 1)
  for (const nd of plan.nodes.filter((x) => x.group === 'winners' && x.round === 1)) {
    const row = state.rows.find((r) => r.id === id(nd.key))!
    row.playerARegistrationId = nd.seedA != null ? `P${nd.seedA}` : null
    row.playerBRegistrationId = nd.seedB != null ? `P${nd.seedB}` : null
    row.slotASettled = true
    row.slotBSettled = true
    const a = row.playerARegistrationId
    const b = row.playerBRegistrationId
    if (a && b) row.status = 'ready'
    else {
      row.status = 'walkover'
      row.winnerRegistrationId = a ?? b ?? null
    }
  }
  // 传播 R1 BYE
  for (const row of r1.filter((r) => r.status === 'walkover')) {
    await advanceFromCompletedMatch(tx, row.id)
  }
  return state
}

const seedNum = (reg: string | null) => (reg ? parseInt(reg.slice(1), 10) : Infinity)
type Policy = (m: Row) => string // 返回 winner regId

async function run(state: State, policy: Policy, label: string) {
  const tx = makeTx(state)
  for (let i = 0; i < 5000; i++) {
    if (state.tour.status === 'completed') return
    const ready = state.rows.find((r) => r.status === 'ready')
    if (!ready) {
      ok(false, `${label}: 卡死(无 ready 且未完赛)`)
      return
    }
    const w = policy(ready)
    ready.status = 'completed'
    ready.winnerRegistrationId = w
    await advanceFromCompletedMatch(tx, ready.id)
  }
  ok(false, `${label}: 超过 5000 步未完赛`)
}

// 低号(高种子)胜
const lowerWins: Policy = (m) =>
  seedNum(m.playerARegistrationId) <= seedNum(m.playerBRegistrationId)
    ? m.playerARegistrationId!
    : m.playerBRegistrationId!

async function main() {
  // 场景1：8 人，高种子全胜 → WB 冠军 P1 直接夺冠，无决胜局
  console.log('\n== 场景1：8 人 高种子全胜 ==')
  {
    const s = await buildDouble('t8', 8)
    await run(s, lowerWins, '8人')
    ok(s.tour.status === 'completed', '赛事完赛')
    const gf = s.rows.find((r) => r.bracketGroup === 'grand_final' && r.round === 1)!
    const reset = s.rows.find((r) => r.bracketGroup === 'grand_final' && r.round === 2)!
    ok(gf.status === 'completed' && gf.winnerRegistrationId === 'P1', 'GF 冠军 P1(WB 冠军直接夺冠)')
    ok(reset.status === 'pending', '决胜局未激活')
  }

  // 场景2：8 人，GF round1 让 LB 冠军(playerB)赢 → 激活决胜局
  console.log('\n== 场景2：8 人 GF 让 LB 冠军赢 → 决胜局 ==')
  {
    const s = await buildDouble('t8b', 8)
    const policy: Policy = (m) =>
      m.bracketGroup === 'grand_final' && m.round === 1
        ? m.playerBRegistrationId! // LB 冠军赢 game1
        : lowerWins(m)
    await run(s, policy, '8人-reset')
    const reset = s.rows.find((r) => r.bracketGroup === 'grand_final' && r.round === 2)!
    ok(reset.status === 'completed', '决胜局已打(completed)')
    ok(s.tour.status === 'completed', '赛事完赛')
  }

  // 场景3：6 人(含 BYE)高种子全胜 → 完赛，冠军 P1
  console.log('\n== 场景3：6 人含 BYE ==')
  {
    const s = await buildDouble('t6', 6)
    await run(s, lowerWins, '6人')
    const gf = s.rows.find((r) => r.bracketGroup === 'grand_final' && r.round === 1)!
    ok(s.tour.status === 'completed', '赛事完赛')
    ok(gf.winnerRegistrationId === 'P1', '冠军 P1')
  }

  // 场景4：幂等 —— 对已完赛 match 再推一次，无副作用
  console.log('\n== 场景4：幂等 ==')
  {
    const s = await buildDouble('t8c', 8)
    await run(s, lowerWins, '8人-idem')
    const tx = makeTx(s)
    const gf = s.rows.find((r) => r.bracketGroup === 'grand_final' && r.round === 1)!
    await advanceFromCompletedMatch(tx, gf.id) // 重复推进
    ok(s.tour.status === 'completed', '重复推进后仍 completed,无异常')
  }

  // 场景5：单败 legacy(无指针)回归
  console.log('\n== 场景5：单败 legacy(无指针)==')
  {
    const tid = 'tse'
    const plan = planBracket(8)
    const state: State = { rows: [], tour: { id: tid, status: 'in_progress' } }
    // 建所有轮(无指针,floor 推进),round 1..k
    for (let r = 1; r <= plan.rounds; r++) {
      for (let sIdx = 0; sIdx < plan.matchesPerRound[r - 1]; sIdx++) {
        state.rows.push({
          id: `${tid}:W${r}_${sIdx}`,
          tournamentId: tid,
          bracketGroup: 'winners',
          round: r,
          slotInRound: sIdx,
          playerARegistrationId: null,
          playerBRegistrationId: null,
          winnerRegistrationId: null,
          status: 'pending',
          winnerToMatchId: null,
          winnerToSlot: null,
          loserToMatchId: null,
          loserToSlot: null,
          slotASettled: false,
          slotBSettled: false
        })
      }
    }
    // 种子 R1
    for (let sIdx = 0; sIdx < plan.matchesPerRound[0]; sIdx++) {
      const row = state.rows.find((r) => r.id === `${tid}:W1_${sIdx}`)!
      const sa = plan.firstRoundSeeds[2 * sIdx]
      const sb = plan.firstRoundSeeds[2 * sIdx + 1]
      row.playerARegistrationId = sa != null ? `P${sa}` : null
      row.playerBRegistrationId = sb != null ? `P${sb}` : null
      if (row.playerARegistrationId && row.playerBRegistrationId) row.status = 'ready'
    }
    await run(state, lowerWins, '单败8人')
    ok(state.tour.status === 'completed', '单败完赛')
    const final = state.rows.find((r) => r.round === plan.rounds)!
    ok(final.winnerRegistrationId === 'P1', '单败冠军 P1')
  }

  console.log('\n' + (failed === 0 ? '✅ ALL PASS' : `❌ ${failed} FAILED`))
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
