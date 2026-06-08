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
import { advanceFromCompletedMatch } from './bracket-advance'
import { DEFAULT_NINE_BALL_RULES } from '../match/state-machine/types'

/**
 * 把 tournament.rulesJson（通常只装 raceToWins 等"赛事级"字段）
 * 合并 match 端必须的记分细则默认值（normalWin/bigJack 等），
 * 防止 state-machine 读到 undefined 把 scores 算成 NaN → JSON 序列化成 null。
 */
function mergeRulesForMatch(
  type: MatchType,
  tournamentRules: Record<string, unknown>
): Record<string, number> {
  const tr = (tournamentRules ?? {}) as Record<string, number>
  if (type === MatchType.nine_ball) {
    return {
      normalWin: tr.normalWin ?? DEFAULT_NINE_BALL_RULES.normalWin,
      smallJack: tr.smallJack ?? DEFAULT_NINE_BALL_RULES.smallJack,
      bigJack: tr.bigJack ?? DEFAULT_NINE_BALL_RULES.bigJack,
      golden9: tr.golden9 ?? DEFAULT_NINE_BALL_RULES.golden9,
      foulCompensation:
        tr.foulCompensation ?? DEFAULT_NINE_BALL_RULES.foulCompensation,
      ...tr // 保留 raceToWins 等其他字段
    }
  }
  return { targetWins: tr.targetWins ?? 5, ...tr }
}

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
      const mergedRules = mergeRulesForMatch(
        t.gameType,
        (t.rulesJson ?? {}) as Record<string, unknown>
      )
      await tx.match.create({
        data: {
          id: matchId,
          code,
          ownerUserId: bm.playerA.userId, // playerA 当 owner
          type: t.gameType,
          rulesJson: mergedRules as unknown as Prisma.InputJsonValue,
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
      // 对手必须已产生：只有一方时说明对手还在上一轮没打完，
      // 不能把"未产生的对手"当成轮空判这方胜（轮空应由系统在生成/推进时自动处理）。
      const opponentRegId =
        winnerSide === 'A' ? bm.playerBRegistrationId : bm.playerARegistrationId
      if (!opponentRegId) {
        throw new BusinessException(
          ErrorCode.TOURNAMENT_STATE_INVALID,
          '对手尚未产生（上一轮还没打完），暂不能判负 / 轮空'
        )
      }
      await tx.tournamentBracketMatch.update({
        where: { id: bm.id },
        data: {
          status: BracketMatchStatus.walkover,
          winnerRegistrationId: winnerRegId
        }
      })
      // 统一推进（跟指针；存量单败回退 floor）
      await advanceFromCompletedMatch(tx, bm.id)
      return { ok: true }
    })
  }

  /**
   * Match.end 时调用：根据该 match 关联的 bracket 推进。
   * MatchService.doEnd 末尾会 await 它。
   */
  async resolveAfterMatchEnd(tx: Prisma.TransactionClient, matchId: string) {
    return resolveAfterMatchEnd(tx, matchId)
  }
}
