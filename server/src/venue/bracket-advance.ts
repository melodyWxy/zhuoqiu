import { BracketMatchStatus, BracketSlot, Prisma, TournamentStatus } from '@prisma/client'

/**
 * 统一的 bracket 推进：一场对阵 completed/walkover 后，按**显式指针**把 winner /
 * loser 送到下一场，并处理 BYE 自动晋级、双败总决赛/决胜局、单败完赛。
 *
 * 取代历史上三份重复的 floor(slot/2) 推进（match.service 内联、bracket.service、
 * bracket-resolve 回调）。存量「进行中的单败」赛事指针为空 → 回退 legacy floor。
 *
 * 设计见 prd/billiards-match-app-prd-v2.10.md「双败淘汰」+ bracket-utils.planDoubleElim。
 */
export async function advanceFromCompletedMatch(
  tx: Prisma.TransactionClient,
  bmId: string,
  depth = 0
): Promise<void> {
  if (depth > 100) throw new Error('bracket advance depth exceeded (cycle?)')
  const bm = await tx.tournamentBracketMatch.findUnique({ where: { id: bmId } })
  if (!bm) return
  if (
    bm.status !== BracketMatchStatus.completed &&
    bm.status !== BracketMatchStatus.walkover
  ) {
    return
  }
  const tid = bm.tournamentId
  const winnerId = bm.winnerRegistrationId
  const loserId = winnerId
    ? bm.playerARegistrationId === winnerId
      ? bm.playerBRegistrationId
      : bm.playerARegistrationId
    : null

  // ---- 总决赛 / 决胜局 特判 ----
  if (bm.bracketGroup === 'grand_final') {
    if (bm.round >= 2) {
      // 决胜局结束 → 总冠军，完赛
      await completeTournament(tx, tid)
      return
    }
    // round 1：playerA=WB 冠军，playerB=LB 冠军
    if (winnerId && winnerId === bm.playerARegistrationId) {
      // WB 冠军直接夺冠（一路未负）→ 完赛，决胜局空壳保持 pending
      await completeTournament(tx, tid)
    } else {
      // LB 冠军赢 → 激活决胜局（把两人填进 reset 场）
      const reset = await tx.tournamentBracketMatch.findFirst({
        where: {
          tournamentId: tid,
          bracketGroup: 'grand_final',
          round: 2
        }
      })
      if (reset) {
        await tx.tournamentBracketMatch.update({
          where: { id: reset.id },
          data: {
            playerARegistrationId: bm.playerARegistrationId,
            playerBRegistrationId: bm.playerBRegistrationId,
            slotASettled: true,
            slotBSettled: true,
            status: BracketMatchStatus.ready
          }
        })
      } else {
        await completeTournament(tx, tid)
      }
    }
    return
  }

  // ---- 单败：指针为空时回退 / 指针存在的单败决赛即完赛 ----
  const hasOwnPointer = !!(bm.winnerToMatchId || bm.loserToMatchId)
  if (!hasOwnPointer) {
    const usesPointers =
      (await tx.tournamentBracketMatch.count({
        where: { tournamentId: tid, winnerToMatchId: { not: null } }
      })) > 0
    if (!usesPointers) {
      // 存量单败（无指针）→ 旧 floor 算法；无下一轮即决赛 → 完赛
      const advanced = await legacyAdvanceByFloor(tx, bm, winnerId)
      if (!advanced) await completeTournament(tx, tid)
      return
    }
    // 指针化单败的决赛节点（winners 组、无 winnerTo）→ 完赛
    await completeTournament(tx, tid)
    return
  }

  // ---- 通用：跟指针 ----
  if (bm.winnerToMatchId && bm.winnerToSlot) {
    await pushInto(tx, bm.winnerToMatchId, bm.winnerToSlot, winnerId, depth)
  }
  if (bm.loserToMatchId && bm.loserToSlot) {
    await pushInto(tx, bm.loserToMatchId, bm.loserToSlot, loserId, depth)
  }
}

/**
 * 把一名选手（或 BYE 的 null）注入目标对阵的指定侧；两侧都「已定」后判 ready /
 * 自动 walkover（含 BYE 连锁递归）。
 */
async function pushInto(
  tx: Prisma.TransactionClient,
  targetId: string,
  slot: BracketSlot,
  regIdOrNull: string | null,
  depth: number
): Promise<void> {
  const t = await tx.tournamentBracketMatch.findUnique({ where: { id: targetId } })
  if (!t) return
  // 幂等 & 防重复推进：只在还没开打的状态注入
  if (t.status !== BracketMatchStatus.pending && t.status !== BracketMatchStatus.ready) {
    return
  }
  await tx.tournamentBracketMatch.update({
    where: { id: t.id },
    data:
      slot === BracketSlot.A
        ? { playerARegistrationId: regIdOrNull, slotASettled: true }
        : { playerBRegistrationId: regIdOrNull, slotBSettled: true }
  })
  const r = await tx.tournamentBracketMatch.findUnique({ where: { id: t.id } })
  if (!r || !r.slotASettled || !r.slotBSettled) return // 还有一侧没来

  const aEmpty = !r.playerARegistrationId
  const bEmpty = !r.playerBRegistrationId
  if (aEmpty && bEmpty) {
    // 双 BYE：无人，walkover 且 winner=null，继续往下传 BYE
    await tx.tournamentBracketMatch.update({
      where: { id: r.id },
      data: { status: BracketMatchStatus.walkover, winnerRegistrationId: null }
    })
    await advanceFromCompletedMatch(tx, r.id, depth + 1)
  } else if (aEmpty !== bEmpty) {
    // 一侧 BYE：另一侧自动晋级
    const w = aEmpty ? r.playerBRegistrationId : r.playerARegistrationId
    await tx.tournamentBracketMatch.update({
      where: { id: r.id },
      data: { status: BracketMatchStatus.walkover, winnerRegistrationId: w }
    })
    await advanceFromCompletedMatch(tx, r.id, depth + 1)
  } else if (r.status === BracketMatchStatus.pending) {
    // 双方就位 → ready
    await tx.tournamentBracketMatch.update({
      where: { id: r.id },
      data: { status: BracketMatchStatus.ready }
    })
  }
}

/** 存量单败回退：用 round+1 / floor(slot/2) 找下一轮。返回是否有下一轮。 */
async function legacyAdvanceByFloor(
  tx: Prisma.TransactionClient,
  bm: { tournamentId: string; round: number; slotInRound: number },
  winnerId: string | null
): Promise<boolean> {
  if (!winnerId) return false
  const next = await tx.tournamentBracketMatch.findFirst({
    where: {
      tournamentId: bm.tournamentId,
      round: bm.round + 1,
      slotInRound: Math.floor(bm.slotInRound / 2)
    }
  })
  if (!next) return false
  const side = bm.slotInRound % 2 === 0 ? 'A' : 'B'
  await tx.tournamentBracketMatch.update({
    where: { id: next.id },
    data:
      side === 'A'
        ? { playerARegistrationId: winnerId }
        : { playerBRegistrationId: winnerId }
  })
  const r = await tx.tournamentBracketMatch.findUnique({ where: { id: next.id } })
  if (
    r?.playerARegistrationId &&
    r?.playerBRegistrationId &&
    r.status === BracketMatchStatus.pending
  ) {
    await tx.tournamentBracketMatch.update({
      where: { id: next.id },
      data: { status: BracketMatchStatus.ready }
    })
  }
  return true
}

async function completeTournament(
  tx: Prisma.TransactionClient,
  tournamentId: string
): Promise<void> {
  const t = await tx.tournament.findUnique({ where: { id: tournamentId } })
  if (t && t.status === TournamentStatus.in_progress) {
    await tx.tournament.update({
      where: { id: tournamentId },
      data: { status: TournamentStatus.completed }
    })
  }
}
