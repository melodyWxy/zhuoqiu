/**
 * 双败 DB 集成 smoke：本地 dev 库建一个双败赛事 → 物化 → 模拟打完 → 断言完赛/冠军 → 清理。
 * 验证 Prisma 接受新枚举/字段、advanceFromCompletedMatch 跑在真 client 上、分组查询。
 * 运行：cd server && npx ts-node scripts/bracket-db-smoke.ts
 */
import { PrismaClient } from '@prisma/client'
import { planDoubleElim } from '../src/venue/bracket-utils'
import { advanceFromCompletedMatch } from '../src/venue/bracket-advance'

const prisma = new PrismaClient()
let failed = 0
const ok = (c: boolean, m: string) => {
  console.log(c ? '  ✓ ' + m : '  ✗ FAIL: ' + m)
  if (!c) failed++
}
const rid = (s: string) => 'regdbg_' + s
const N = 6
const tid = 'tdbg_' + Date.now()

async function main() {
  // 1. 建赛事 + 6 报名（seed 1..6）
  await prisma.tournament.create({
    data: {
      id: tid,
      venueId: 'v_dbg',
      title: '双败 smoke',
      gameType: 'nine_ball',
      format: 'double_elim',
      rulesJson: { raceToWins: 5 },
      maxPlayers: 16,
      minPlayers: 4,
      registrationStartsAt: new Date(),
      registrationEndsAt: new Date(),
      matchStartsAt: new Date(),
      createdByAccountId: 'acc_dbg',
      status: 'in_progress'
    }
  })
  for (let i = 1; i <= N; i++) {
    await prisma.tournamentRegistration.create({
      data: {
        id: rid(String(i)),
        tournamentId: tid,
        userId: 'u_dbg_' + i,
        displayName: '选手' + i,
        phone: '139' + String(i).padStart(8, '0'),
        seed: i,
        status: 'confirmed'
      }
    })
  }
  const seedOfReg = new Map<string, number>()
  for (let i = 1; i <= N; i++) seedOfReg.set(rid(String(i)), i)

  // 2. 物化双败（与 genDoubleElimBracket 同逻辑）
  const plan = planDoubleElim(N)
  const idByKey = new Map<string, string>()
  plan.nodes.forEach((nd, i) => idByKey.set(nd.key, `${tid}_bm${i}`))
  for (const nd of plan.nodes) {
    const id = idByKey.get(nd.key)!
    const isWb1 = nd.group === 'winners' && nd.round === 1
    let pA: string | null = null
    let pB: string | null = null
    let sA = false
    let sB = false
    let status = 'pending'
    let winner: string | null = null
    if (isWb1) {
      pA = nd.seedA != null ? rid(String(nd.seedA)) : null
      pB = nd.seedB != null ? rid(String(nd.seedB)) : null
      sA = true
      sB = true
      if (pA && pB) status = 'ready'
      else {
        status = 'walkover'
        winner = pA ?? pB
      }
    }
    await prisma.tournamentBracketMatch.create({
      data: {
        id,
        tournamentId: tid,
        bracketGroup: nd.group as any,
        round: nd.round,
        slotInRound: nd.slot,
        playerARegistrationId: pA,
        playerBRegistrationId: pB,
        winnerRegistrationId: winner,
        status: status as any,
        winnerToMatchId: nd.winnerToKey ? idByKey.get(nd.winnerToKey)! : null,
        winnerToSlot: (nd.winnerToSlot ?? null) as any,
        loserToMatchId: nd.loserToKey ? idByKey.get(nd.loserToKey)! : null,
        loserToSlot: (nd.loserToSlot ?? null) as any,
        slotASettled: sA,
        slotBSettled: sB
      }
    })
  }
  // 传播首轮 BYE
  for (const nd of plan.nodes.filter((n) => n.group === 'winners' && n.round === 1)) {
    const row = await prisma.tournamentBracketMatch.findUnique({
      where: { id: idByKey.get(nd.key)! }
    })
    if (row?.status === 'walkover') await advanceFromCompletedMatch(prisma as any, row.id)
  }

  // 3. 模拟打完：低 seed 胜
  for (let step = 0; step < 200; step++) {
    const t = await prisma.tournament.findUnique({ where: { id: tid } })
    if (t?.status === 'completed') break
    const ready = await prisma.tournamentBracketMatch.findFirst({
      where: { tournamentId: tid, status: 'ready' }
    })
    if (!ready) {
      ok(false, '卡死：无 ready 且未完赛')
      break
    }
    const sa = seedOfReg.get(ready.playerARegistrationId ?? '') ?? Infinity
    const sb = seedOfReg.get(ready.playerBRegistrationId ?? '') ?? Infinity
    const winner = sa <= sb ? ready.playerARegistrationId! : ready.playerBRegistrationId!
    await prisma.tournamentBracketMatch.update({
      where: { id: ready.id },
      data: { status: 'completed', winnerRegistrationId: winner }
    })
    await advanceFromCompletedMatch(prisma as any, ready.id)
  }

  // 4. 断言
  const t = await prisma.tournament.findUnique({ where: { id: tid } })
  ok(t?.status === 'completed', '赛事 completed')
  const gf = await prisma.tournamentBracketMatch.findFirst({
    where: { tournamentId: tid, bracketGroup: 'grand_final', round: 1 }
  })
  ok(gf?.winnerRegistrationId === rid('1'), `总冠军 = 选手1（实际 ${gf?.winnerRegistrationId}）`)

  const all = await prisma.tournamentBracketMatch.findMany({ where: { tournamentId: tid } })
  const cnt = (g: string) => all.filter((x) => x.bracketGroup === g).length
  ok(cnt('winners') === 7, `winners 7（实际 ${cnt('winners')}）`)
  ok(cnt('losers') === 6, `losers 6（实际 ${cnt('losers')}）`)
  ok(cnt('grand_final') === 2, `grand_final 2（实际 ${cnt('grand_final')}）`)
}

main()
  .catch((e) => {
    console.error(e)
    failed++
  })
  .finally(async () => {
    // 清理（cascade 删 regs + bracket）
    await prisma.tournament.delete({ where: { id: tid } }).catch(() => {})
    await prisma.$disconnect()
    console.log('\n' + (failed === 0 ? '✅ DB SMOKE PASS' : `❌ ${failed} FAILED`))
    process.exit(failed === 0 ? 0 : 1)
  })
