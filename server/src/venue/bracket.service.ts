import { Injectable } from '@nestjs/common'
import {
  BracketMatchStatus,
  MatchState,
  MatchType,
  Prisma,
  TournamentStatus
} from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { BusinessException, ErrorCode } from '../common/exceptions/business.exception'
import { genId, genMatchCode } from '../common/utils/id'
import { resolveAfterMatchEnd } from './bracket-resolve'

@Injectable()
export class BracketService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 开始一场对阵比赛：创建 Match，自动占位 playerA/B，绑定到 bracket。
   * - 状态校验：bracket.status 必须 ready；双方 playerA/B 都必须有 registration
   * - Match owner 取 playerA 的 user，actor=商家账号
   */
  async openBracketMatch(
    tournamentId: string,
    bracketMatchId: string,
    accountId: string
  ) {
    return this.prisma.$transaction(async (tx) => {
      const t = await tx.tournament.findUnique({ where: { id: tournamentId } })
      if (!t) {
        throw new BusinessException(
          ErrorCode.TOURNAMENT_NOT_FOUND,
          '赛事不存在'
        )
      }
      const acc = await tx.venueAccount.findUnique({
        where: { id: accountId }
      })
      if (!acc || acc.venueId !== t.venueId) {
        throw new BusinessException(
          ErrorCode.TOURNAMENT_NOT_OWNER,
          '不是你自家球房的赛事'
        )
      }
      if (t.status !== TournamentStatus.in_progress) {
        throw new BusinessException(
          ErrorCode.TOURNAMENT_STATE_INVALID,
          '赛事当前不在进行中'
        )
      }
      const bm = await tx.tournamentBracketMatch.findUnique({
        where: { id: bracketMatchId },
        include: { playerA: true, playerB: true }
      })
      if (!bm || bm.tournamentId !== tournamentId) {
        throw new BusinessException(
          ErrorCode.BAD_REQUEST,
          '对阵不存在'
        )
      }
      if (bm.status !== BracketMatchStatus.ready) {
        throw new BusinessException(
          ErrorCode.TOURNAMENT_STATE_INVALID,
          '对阵状态不是 ready，无法开赛'
        )
      }
      if (!bm.playerA || !bm.playerB) {
        throw new BusinessException(
          ErrorCode.BAD_REQUEST,
          '双方未就位'
        )
      }
      if (bm.matchId) {
        throw new BusinessException(
          ErrorCode.TOURNAMENT_STATE_INVALID,
          '该对阵已经开赛'
        )
      }

      // 房间码
      let code = genMatchCode()
      for (let i = 0; i < 5; i++) {
        const exists = await tx.match.findUnique({ where: { code } })
        if (!exists) break
        code = genMatchCode()
      }

      const matchId = genId('m')
      await tx.match.create({
        data: {
          id: matchId,
          code,
          ownerUserId: bm.playerA.userId, // playerA 当 owner
          type: t.gameType,
          rulesJson: t.rulesJson as unknown as Prisma.InputJsonValue,
          state: MatchState.in_progress,
          timerStartedAt: new Date(),
          venueId: t.venueId
        }
      })
      // slot 1 = playerA, slot 2 = playerB
      await tx.matchPlayer.create({
        data: {
          matchId,
          slot: 1,
          displayName: bm.playerA.displayName,
          userId: bm.playerA.userId,
          isCurrent: true
        }
      })
      await tx.matchPlayer.create({
        data: {
          matchId,
          slot: 2,
          displayName: bm.playerB.displayName,
          userId: bm.playerB.userId,
          isCurrent: true
        }
      })

      // 绑定 bracket → match + 状态置 in_progress
      await tx.tournamentBracketMatch.update({
        where: { id: bm.id },
        data: { matchId, status: BracketMatchStatus.in_progress }
      })

      return { matchId, code, bracketMatchId: bm.id }
    })
  }

  /**
   * 商家手动标记一方弃权，bracket 直接推进（不创建 match）。
   * - 输入 winnerSide: 'A' 或 'B'；对方判负
   * - 状态需为 ready；matchId 必须为空
   */
  async manualWalkover(
    tournamentId: string,
    bracketMatchId: string,
    accountId: string,
    winnerSide: 'A' | 'B'
  ) {
    return this.prisma.$transaction(async (tx) => {
      const t = await tx.tournament.findUnique({ where: { id: tournamentId } })
      if (!t) {
        throw new BusinessException(
          ErrorCode.TOURNAMENT_NOT_FOUND,
          '赛事不存在'
        )
      }
      const acc = await tx.venueAccount.findUnique({
        where: { id: accountId }
      })
      if (!acc || acc.venueId !== t.venueId) {
        throw new BusinessException(
          ErrorCode.TOURNAMENT_NOT_OWNER,
          '不是你自家球房的赛事'
        )
      }
      const bm = await tx.tournamentBracketMatch.findUnique({
        where: { id: bracketMatchId }
      })
      if (!bm || bm.tournamentId !== tournamentId) {
        throw new BusinessException(ErrorCode.BAD_REQUEST, '对阵不存在')
      }
      if (
        bm.status !== BracketMatchStatus.ready &&
        bm.status !== BracketMatchStatus.pending
      ) {
        throw new BusinessException(
          ErrorCode.TOURNAMENT_STATE_INVALID,
          '该对阵已开赛或已完成，无法再标记弃权'
        )
      }
      if (bm.matchId) {
        throw new BusinessException(
          ErrorCode.TOURNAMENT_STATE_INVALID,
          '已开赛的对阵不能用 walkover；请走 match 端的 force_end'
        )
      }
      const winnerRegId =
        winnerSide === 'A' ? bm.playerARegistrationId : bm.playerBRegistrationId
      if (!winnerRegId) {
        throw new BusinessException(
          ErrorCode.BAD_REQUEST,
          `${winnerSide} 方未就位，无法判胜`
        )
      }
      await tx.tournamentBracketMatch.update({
        where: { id: bm.id },
        data: {
          status: BracketMatchStatus.walkover,
          winnerRegistrationId: winnerRegId
        }
      })
      // 推进下一轮（复用 resolve 逻辑里的"将 winner 填进下一轮对应 slot"）
      await this.advanceWinnerToNextRound(tx, bm.id, winnerRegId)
      // 如果是决赛 → 赛事结束
      await this.maybeCompleteTournament(tx, tournamentId)
      return { ok: true }
    })
  }

  /**
   * Match.end 时调用：根据该 match 关联的 bracket 推进。
   * MatchService.doEnd 末尾会 await 它。
   */
  async resolveAfterMatchEnd(
    tx: Prisma.TransactionClient,
    matchId: string
  ) {
    return resolveAfterMatchEnd(tx, matchId, {
      maybeCompleteTournament: (t, tid) => this.maybeCompleteTournament(t, tid),
      advanceWinnerToNextRound: (t, bid, rid) =>
        this.advanceWinnerToNextRound(t, bid, rid)
    })
  }

  /**
   * 把 winner 填到下一轮对应位置；若下一轮双方齐了，状态置 ready。
   */
  async advanceWinnerToNextRound(
    tx: Prisma.TransactionClient,
    bracketMatchId: string,
    winnerRegId: string
  ) {
    const bm = await tx.tournamentBracketMatch.findUnique({
      where: { id: bracketMatchId }
    })
    if (!bm) return
    const next = await tx.tournamentBracketMatch.findFirst({
      where: {
        tournamentId: bm.tournamentId,
        round: bm.round + 1,
        slotInRound: Math.floor(bm.slotInRound / 2)
      }
    })
    if (!next) return // 已是决赛
    const side = bm.slotInRound % 2 === 0 ? 'A' : 'B'
    await tx.tournamentBracketMatch.update({
      where: { id: next.id },
      data:
        side === 'A'
          ? { playerA: { connect: { id: winnerRegId } } }
          : { playerB: { connect: { id: winnerRegId } } }
    })
    const refreshed = await tx.tournamentBracketMatch.findUnique({
      where: { id: next.id }
    })
    if (
      refreshed?.playerARegistrationId &&
      refreshed?.playerBRegistrationId &&
      refreshed.status === BracketMatchStatus.pending
    ) {
      await tx.tournamentBracketMatch.update({
        where: { id: next.id },
        data: { status: BracketMatchStatus.ready }
      })
    }
  }

  /**
   * 若决赛已 completed，置赛事为 completed。
   */
  async maybeCompleteTournament(
    tx: Prisma.TransactionClient,
    tournamentId: string
  ) {
    const finals = await tx.tournamentBracketMatch.findMany({
      where: { tournamentId },
      orderBy: { round: 'desc' },
      take: 1
    })
    const lastRound = finals[0]?.round
    if (!lastRound) return
    const finalRound = await tx.tournamentBracketMatch.findMany({
      where: { tournamentId, round: lastRound }
    })
    const allDone = finalRound.every(
      (f) =>
        f.status === BracketMatchStatus.completed ||
        f.status === BracketMatchStatus.walkover
    )
    if (allDone && finalRound.length > 0) {
      const t = await tx.tournament.findUnique({ where: { id: tournamentId } })
      if (t && t.status === TournamentStatus.in_progress) {
        await tx.tournament.update({
          where: { id: tournamentId },
          data: { status: TournamentStatus.completed }
        })
      }
    }
  }
}

// 静态便捷接口：方便其他模块（如 MatchModule）通过 forwardRef 调用
// 也可以走 DI 注入 BracketService.resolveAfterMatchEnd(tx, matchId)
export type BracketServiceCallbacks = {
  maybeCompleteTournament: (tx: Prisma.TransactionClient, tid: string) => Promise<void>
  advanceWinnerToNextRound: (
    tx: Prisma.TransactionClient,
    bid: string,
    rid: string
  ) => Promise<void>
}
