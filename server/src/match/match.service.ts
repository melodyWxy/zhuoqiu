import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common'
import { ReplayJobService } from './replay-job.service'
import {
  MatchState,
  MatchType,
  Prisma,
  ReplayStatus,
  User
} from '@prisma/client'
import { computeNarrative } from './replay-narrative'
import { PrismaService } from '../prisma/prisma.service'
import { RealtimeService } from '../realtime/realtime.service'
import { BusinessException, ErrorCode } from '../common/exceptions/business.exception'
import { genId, genMatchCode } from '../common/utils/id'
import {
  DEFAULT_NINE_BALL_RULES,
  EightBallComputedState,
  EightBallRules,
  MatchEventPayload,
  NineBallComputedState,
  NineBallRules,
  PlayerSlotState
} from './state-machine/types'
import {
  applyNineBallEvent,
  emptyNineBallState,
  validateNineBallEvent
} from './state-machine/nine-ball'
import {
  applyEightBallEvent,
  emptyEightBallState,
  validateEightBallEvent
} from './state-machine/eight-ball'
import { resolveAfterMatchEnd } from '../venue/bracket-resolve'

export interface CreateMatchInput {
  ownerUserId: string
  type: MatchType
  rules: Partial<NineBallRules> | Partial<EightBallRules>
  playerSlots: Array<{ slot: number; name: string; claim: boolean }>
}

/** 11 位大陆手机号 → 138****0001；非 11 位（或 null）原样/返回 null */
function maskPhone(phone: string | null): string | null {
  if (!phone) return null
  if (/^\d{11}$/.test(phone)) {
    return phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2')
  }
  return phone
}

@Injectable()
export class MatchService {
  private readonly logger = new Logger(MatchService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    @Inject(forwardRef(() => ReplayJobService))
    private readonly replayJob: ReplayJobService
  ) {}

  // ============ 创建 ============

  async create(input: CreateMatchInput) {
    if (input.playerSlots.length < 2 || input.playerSlots.length > 3) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '玩家号位数量必须是 2 或 3'
      )
    }
    const slots = input.playerSlots.map((p) => p.slot).sort((a, b) => a - b)
    for (let i = 0; i < slots.length; i++) {
      if (slots[i] !== i + 1) {
        throw new BusinessException(
          ErrorCode.BAD_REQUEST,
          '号位必须从 1 开始连续（如 1、2 或 1、2、3）'
        )
      }
    }

    const normalized = this.normalizeRules(input.type, input.rules)

    // 自动关闭该用户作为 owner 的所有未结束房间（避免房主同时开多场）
    const lingering = await this.prisma.match.findMany({
      where: {
        ownerUserId: input.ownerUserId,
        state: { in: [MatchState.waiting, MatchState.in_progress, MatchState.paused] }
      },
      select: { id: true }
    })
    for (const m of lingering) {
      try {
        await this.endByOwner(m.id, input.ownerUserId, 'auto_closed_by_new_match')
      } catch {
        // ignore（旧场可能并发被改）
      }
    }

    // 循环生成房间码直到唯一
    let code = genMatchCode()
    for (let i = 0; i < 5; i++) {
      const exists = await this.prisma.match.findUnique({ where: { code } })
      if (!exists) break
      code = genMatchCode()
    }

    return this.prisma.$transaction(async (tx) => {
      const match = await tx.match.create({
        data: {
          id: genId('m'),
          code,
          ownerUserId: input.ownerUserId,
          type: input.type,
          rulesJson: normalized as unknown as Prisma.InputJsonValue,
          state: MatchState.waiting
        }
      })
      for (const p of input.playerSlots) {
        await tx.matchPlayer.create({
          data: {
            matchId: match.id,
            slot: p.slot,
            displayName: p.name || `玩家${p.slot}`,
            userId: p.claim ? input.ownerUserId : null,
            isCurrent: true
          }
        })
      }
      // 开始比赛：计时启动
      await tx.match.update({
        where: { id: match.id },
        data: {
          state: MatchState.in_progress,
          timerStartedAt: new Date(),
          timerAccumulatedMs: 0n,
          isPaused: false
        }
      })
      return this.detailFromTx(tx, match.id)
    })
  }

  // ============ 查询 ============

  async detail(matchIdOrCode: string) {
    const match = await this.findByIdOrCode(matchIdOrCode)
    return this.detailFromTx(this.prisma, match.id)
  }

  async findByIdOrCode(idOrCode: string) {
    const match = await this.prisma.match.findFirst({
      where: {
        OR: [{ id: idOrCode }, { code: idOrCode.toUpperCase() }]
      }
    })
    if (!match) {
      throw new BusinessException(ErrorCode.MATCH_NOT_FOUND, '房间不存在')
    }
    return match
  }

  /**
   * v2.22 战报小程序码 scene 反查：matchId 后 12 字符 → 完整 matchId
   *
   * 海报上的小程序码 scene 是 `m=xxxxx`（matchId 后 12 字符），扫码进
   * weapp 后 app.tsx onLaunch 解析 → 拿后缀去 server 反查完整 matchId →
   * navigateTo 到战报页。
   *
   * 碰撞概率：matchId 用 nanoid 32 字符 base62，后 12 字符约 62^12 ≈ 3×10^21
   * 空间，与全表行数比远低于碰撞阈值。多于 1 条命中返回 null（让前端兜底
   * 到首页）。
   */
  async findByIdSuffix(suffix: string): Promise<{ id: string } | null> {
    if (!suffix || suffix.length < 6 || suffix.length > 16) return null
    // 用 endsWith 通过 ILIKE 实现（PG 字段无索引会全表扫；matchId 表通常
    // 不会超过百万级，全表扫可接受。如果将来量大，给 matches.id 加 reverse
    // index 或拆字段即可）
    const matches = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM matches WHERE id LIKE ${'%' + suffix} LIMIT 2
    `
    if (matches.length !== 1) return null
    return matches[0] ?? null
  }

  private async detailFromTx(tx: Prisma.TransactionClient | PrismaService, matchId: string) {
    const match = await tx.match.findUnique({
      where: { id: matchId },
      include: {
        players: {
          orderBy: [{ slot: 'asc' }, { joinedAt: 'asc' }],
          include: { user: { select: { id: true, avatar: true } } }
        },
        owner: { select: { id: true, nickname: true, avatar: true } }
      }
    })
    if (!match) {
      throw new BusinessException(ErrorCode.MATCH_NOT_FOUND, '房间不存在')
    }
    const events = await tx.matchEvent.findMany({
      where: { matchId },
      orderBy: { serverSeq: 'asc' }
    })
    const currentPlayers = match.players.filter((p) => p.isCurrent)
    const playerState: PlayerSlotState[] = currentPlayers.map((p) => ({
      slot: p.slot,
      name: p.displayName,
      userId: p.userId
    }))

    const rules = match.rulesJson as unknown as Record<string, unknown>
    let computed: NineBallComputedState | EightBallComputedState
    if (match.type === MatchType.nine_ball) {
      let state = emptyNineBallState(playerState.map((p) => p.slot))
      for (const e of events) {
        if (e.undone) continue
        const p = { type: e.type, ...(e.payloadJson as object) } as MatchEventPayload
        state = applyNineBallEvent(state, p, rules as unknown as NineBallRules, playerState)
      }
      computed = state
    } else {
      let state = emptyEightBallState(playerState.map((p) => p.slot))
      for (const e of events) {
        if (e.undone) continue
        const p = { type: e.type, ...(e.payloadJson as object) } as MatchEventPayload
        state = applyEightBallEvent(state, p)
      }
      computed = state
    }

    const lastSeq = events.length > 0 ? events[events.length - 1].serverSeq : 0n

    return {
      id: match.id,
      code: match.code,
      type: match.type,
      rules,
      state: match.state,
      players: match.players.map((p) => ({
        slot: p.slot,
        displayName: p.displayName,
        userId: p.userId,
        avatar: p.user?.avatar ?? null,
        isCurrent: p.isCurrent,
        joinedAt: p.joinedAt,
        leftAt: p.leftAt
      })),
      computed,
      timer: {
        startedAt: match.timerStartedAt,
        accumulatedMs: Number(match.timerAccumulatedMs),
        isPaused: match.isPaused
      },
      lastEventSeq: Number(lastSeq),
      ownerUserId: match.ownerUserId,
      owner: match.owner,
      endedAt: match.endedAt,
      endedBy: match.endedBy,
      endedReason: match.endedReason,
      // v2.22 战报海报字段（admin / weapp 都可以读这些；weapp 主要走
      // replay() 接口，admin 用 /admin/matches/:id 读 detail 即可看到）
      replayStatus: match.replayStatus,
      replayPosterUrl: match.replayPosterUrl,
      replayQrUrl: match.replayQrUrl,
      replayGeneratedAt: match.replayGeneratedAt,
      replayFailedReason: match.replayFailedReason
    }
  }

  /**
   * 战报：detail + 叙事文案 + 海报状态
   *
   * 海报字段从 Match 表的 replayStatus / replayPosterUrl / replayQrUrl 读，
   * generate job (ReplayJobService) 负责异步 fill。
   */
  async replay(matchIdOrCode: string) {
    const detail = await this.detail(matchIdOrCode)
    const narrative = computeNarrative({
      type: detail.type,
      players: detail.players,
      computed: detail.computed,
      timer: detail.timer
    })

    // 读海报状态
    const posterRow = await this.prisma.match.findUnique({
      where: { id: detail.id },
      select: {
        replayStatus: true,
        replayPosterUrl: true,
        replayQrUrl: true,
        replayFailedReason: true
      }
    })

    return {
      detail,
      narrative,
      poster: {
        status: (posterRow?.replayStatus ?? ReplayStatus.pending) as
          | 'pending'
          | 'ready'
          | 'failed',
        url: posterRow?.replayPosterUrl ?? null,
        qrUrl: posterRow?.replayQrUrl ?? null,
        ...(posterRow?.replayFailedReason
          ? { failedReason: posterRow.replayFailedReason }
          : {})
      }
    }
  }

  // ============ 加入 / 占位 ============

  async joinByCode(code: string, userId: string, slot?: number, displayName?: string) {
    const match = await this.prisma.match.findUnique({ where: { code: code.toUpperCase() } })
    if (!match) {
      throw new BusinessException(ErrorCode.MATCH_NOT_FOUND, '房间不存在')
    }
    if (match.state === MatchState.ended || match.state === MatchState.dissolved) {
      throw new BusinessException(ErrorCode.MATCH_CODE_EXPIRED, '房间已结束')
    }
    if (!slot) {
      return { match: await this.detail(match.id), role: 'spectator' as const }
    }
    await this.occupySlot(match.id, userId, slot, displayName)
    return { match: await this.detail(match.id), role: 'player' as const }
  }

  async occupySlot(matchId: string, userId: string, slot: number, displayName?: string) {
    return this.withMatchLock(matchId, async (tx) => {
      const match = await tx.match.findUnique({ where: { id: matchId } })
      if (!match) {
        throw new BusinessException(ErrorCode.MATCH_NOT_FOUND, '房间不存在')
      }
      if (match.state === MatchState.ended || match.state === MatchState.dissolved) {
        throw new BusinessException(ErrorCode.MATCH_STATE_INVALID, '房间已结束')
      }
      const occupant = await tx.matchPlayer.findFirst({
        where: { matchId, slot, isCurrent: true }
      })
      if (!occupant) {
        throw new BusinessException(ErrorCode.BAD_REQUEST, '该号位不存在')
      }
      if (occupant.userId === userId) {
        return
      }
      if (occupant.userId !== null) {
        throw new BusinessException(ErrorCode.MATCH_FULL, '该号位已被其他人占据')
      }
      // 若占位者带了自己的 displayName，则覆盖号位原昵称
      const finalName =
        displayName && displayName.trim().length > 0
          ? displayName.trim().slice(0, 32)
          : occupant.displayName
      await tx.matchPlayer.update({
        where: { id: occupant.id },
        data: { userId, displayName: finalName }
      })
      await this.insertEvent(tx, matchId, {
        type: 'seat_occupy',
        slot,
        userId,
        name: finalName
      })
    })
  }

  async leaveSlot(matchId: string, userId: string) {
    return this.withMatchLock(matchId, async (tx) => {
      const row = await tx.matchPlayer.findFirst({
        where: { matchId, userId, isCurrent: true }
      })
      if (!row) return
      await tx.matchPlayer.update({
        where: { id: row.id },
        data: { userId: null }
      })
      await this.insertEvent(tx, matchId, {
        type: 'seat_leave',
        slot: row.slot,
        userId
      })
    })
  }

  // ============ 事件应用（记分） ============

  async appendEvent(
    matchId: string,
    actor: { userId?: string; adminId?: string },
    event: MatchEventPayload,
    clientSeq?: number
  ): Promise<{ serverSeq: number }> {
    return this.withMatchLock(matchId, async (tx) => {
      const match = await tx.match.findUnique({
        where: { id: matchId },
        include: {
          players: { where: { isCurrent: true }, orderBy: { slot: 'asc' } }
        }
      })
      if (!match) {
        throw new BusinessException(ErrorCode.MATCH_NOT_FOUND, '房间不存在')
      }
      if (
        match.state !== MatchState.in_progress &&
        match.state !== MatchState.paused
      ) {
        throw new BusinessException(
          ErrorCode.MATCH_STATE_INVALID,
          `房间状态为 ${match.state}，不能记分`
        )
      }

      // 若是参赛者记分，确认其当前占了某个号位
      if (actor.userId) {
        const seat = match.players.find((p) => p.userId === actor.userId)
        if (!seat && match.ownerUserId !== actor.userId) {
          // 观众 + 非房主 → 禁止
          throw new BusinessException(
            ErrorCode.FORBIDDEN,
            '你不是参赛者，无法操作'
          )
        }
      }

      const playerState: PlayerSlotState[] = match.players.map((p) => ({
        slot: p.slot,
        name: p.displayName,
        userId: p.userId
      }))

      // 事件语义校验
      if (match.type === MatchType.nine_ball) {
        validateNineBallEvent(event, playerState)
      } else {
        validateEightBallEvent(event, playerState)
      }

      // 写事件 + 更新 match last_event_at
      const seq = await this.insertEvent(tx, matchId, event, actor, clientSeq)
      await tx.match.update({
        where: { id: matchId },
        data: { lastEventAt: new Date() }
      })
      return { serverSeq: seq }
    })
  }

  async undoLast(matchId: string, actorUserId: string): Promise<{ serverSeq: number; undoneEventId: bigint } | null> {
    return this.withMatchLock(matchId, async (tx) => {
      const match = await tx.match.findUnique({
        where: { id: matchId },
        include: { players: { where: { isCurrent: true } } }
      })
      if (!match) {
        throw new BusinessException(ErrorCode.MATCH_NOT_FOUND, '房间不存在')
      }
      // 确认操作者是参赛者
      const seat = match.players.find((p) => p.userId === actorUserId)
      if (!seat && match.ownerUserId !== actorUserId) {
        throw new BusinessException(ErrorCode.FORBIDDEN, '你不是参赛者')
      }

      // 找最近一条未被撤销的普通事件
      const target = await tx.matchEvent.findFirst({
        where: {
          matchId,
          undone: false,
          type: { notIn: ['undo', 'end', 'force_end'] }
        },
        orderBy: { serverSeq: 'desc' }
      })
      if (!target) return null

      const undoSeq = await this.insertEvent(
        tx,
        matchId,
        { type: 'undo', targetEventId: target.id.toString() },
        { userId: actorUserId }
      )
      await tx.matchEvent.update({
        where: { id: target.id },
        data: { undone: true, undoneByEventId: BigInt(undoSeq) }
      })
      return { serverSeq: undoSeq, undoneEventId: target.id }
    })
  }

  // ============ 结束 ============

  async endByOwner(matchId: string, ownerUserId: string, reason?: string) {
    const result = await this.withMatchLock(matchId, async (tx) => {
      const match = await tx.match.findUnique({ where: { id: matchId } })
      if (!match) throw new BusinessException(ErrorCode.MATCH_NOT_FOUND, '房间不存在')
      if (match.ownerUserId !== ownerUserId) {
        throw new BusinessException(ErrorCode.FORBIDDEN, '只有房主能结束比赛')
      }
      if (match.state === MatchState.ended || match.state === MatchState.dissolved) {
        return { ended: false }
      }
      await this.doEnd(tx, matchId, { userId: ownerUserId }, reason ?? 'owner')
      return { ended: true }
    })
    // 事务提交后异步生成战报海报（v2.22 C-1）
    if (result?.ended) {
      setImmediate(() => this.replayJob.generateSafe(matchId))
    }
  }

  async forceEndByAdmin(matchId: string, adminId: string, reason: string) {
    const result = await this.withMatchLock(matchId, async (tx) => {
      const match = await tx.match.findUnique({ where: { id: matchId } })
      if (!match) throw new BusinessException(ErrorCode.MATCH_NOT_FOUND, '房间不存在')
      if (match.state === MatchState.ended || match.state === MatchState.dissolved) {
        return { ended: false }
      }
      await this.insertEvent(
        tx,
        matchId,
        { type: 'force_end', adminId, reason },
        { adminId }
      )
      await this.doEnd(tx, matchId, { adminId }, reason)
      return { ended: true }
    })
    if (result?.ended) {
      setImmediate(() => this.replayJob.generateSafe(matchId))
    }
  }

  async forcePauseByAdmin(matchId: string, adminId: string, reason: string) {
    return this.withMatchLock(matchId, async (tx) => {
      const match = await tx.match.findUnique({ where: { id: matchId } })
      if (!match) throw new BusinessException(ErrorCode.MATCH_NOT_FOUND, '房间不存在')
      if (match.state !== MatchState.in_progress) return
      await tx.match.update({
        where: { id: matchId },
        data: {
          state: MatchState.paused,
          isPaused: true,
          timerAccumulatedMs:
            match.timerAccumulatedMs +
            BigInt(
              match.timerStartedAt ? Date.now() - match.timerStartedAt.getTime() : 0
            ),
          timerStartedAt: null
        }
      })
      await this.insertEvent(
        tx,
        matchId,
        { type: 'pause' },
        { adminId }
      )
    })
  }

  private async doEnd(
    tx: Prisma.TransactionClient,
    matchId: string,
    actor: { userId?: string; adminId?: string },
    reason: string
  ) {
    const match = await tx.match.findUnique({ where: { id: matchId } })
    if (!match) return
    const now = new Date()
    const elapsed =
      match.timerAccumulatedMs +
      BigInt(
        match.timerStartedAt && !match.isPaused
          ? now.getTime() - match.timerStartedAt.getTime()
          : 0
      )
    await tx.match.update({
      where: { id: matchId },
      data: {
        state: MatchState.ended,
        endedAt: now,
        endedBy: actor.userId ?? actor.adminId ?? null,
        endedReason: reason,
        isPaused: true,
        timerAccumulatedMs: elapsed,
        timerStartedAt: null
      }
    })
    await this.insertEvent(
      tx,
      matchId,
      { type: 'end', endedBy: actor.userId ?? actor.adminId ?? 'unknown', reason },
      actor
    )
    // v2.10 P5：赛事 match 结束 → 回填 bracket + 推进下一轮
    try {
      await resolveAfterMatchEnd(tx, matchId, {
        maybeCompleteTournament: async (t, tid) => {
          const finals = await t.tournamentBracketMatch.findMany({
            where: { tournamentId: tid },
            orderBy: { round: 'desc' },
            take: 1
          })
          const lastRound = finals[0]?.round
          if (!lastRound) return
          const finalRound = await t.tournamentBracketMatch.findMany({
            where: { tournamentId: tid, round: lastRound }
          })
          const allDone = finalRound.every(
            (f) => f.status === 'completed' || f.status === 'walkover'
          )
          if (allDone && finalRound.length > 0) {
            const tour = await t.tournament.findUnique({ where: { id: tid } })
            if (tour && tour.status === 'in_progress') {
              await t.tournament.update({
                where: { id: tid },
                data: { status: 'completed' }
              })
            }
          }
        },
        advanceWinnerToNextRound: async (t, bid, rid) => {
          const bm = await t.tournamentBracketMatch.findUnique({
            where: { id: bid }
          })
          if (!bm) return
          const next = await t.tournamentBracketMatch.findFirst({
            where: {
              tournamentId: bm.tournamentId,
              round: bm.round + 1,
              slotInRound: Math.floor(bm.slotInRound / 2)
            }
          })
          if (!next) return
          const side = bm.slotInRound % 2 === 0 ? 'A' : 'B'
          await t.tournamentBracketMatch.update({
            where: { id: next.id },
            data:
              side === 'A'
                ? { playerARegistrationId: rid }
                : { playerBRegistrationId: rid }
          })
          const refreshed = await t.tournamentBracketMatch.findUnique({
            where: { id: next.id }
          })
          if (
            refreshed?.playerARegistrationId &&
            refreshed?.playerBRegistrationId &&
            refreshed.status === 'pending'
          ) {
            await t.tournamentBracketMatch.update({
              where: { id: next.id },
              data: { status: 'ready' }
            })
          }
        }
      })
    } catch (e) {
      this.logger.warn(`bracket resolve failed: ${(e as Error).message}`)
    }
  }

  async kickByAdmin(
    matchId: string,
    targetUserId: string,
    adminId: string,
    reason: string
  ) {
    await this.withMatchLock(matchId, async (tx) => {
      const row = await tx.matchPlayer.findFirst({
        where: { matchId, userId: targetUserId, isCurrent: true }
      })
      if (!row) return
      await tx.matchPlayer.update({
        where: { id: row.id },
        data: { userId: null }
      })
      await this.insertEvent(
        tx,
        matchId,
        {
          type: 'seat_kick',
          slot: row.slot,
          userId: targetUserId,
          adminId,
          reason
        },
        { adminId }
      )
      // 额外广播"你被踢出"（被踢的客户端可以据此弹窗）
      const broadcasts = (tx as unknown as { _broadcasts?: Array<() => void> })._broadcasts
      broadcasts?.push(() => {
        this.realtime.broadcastKicked(matchId, targetUserId, reason)
      })
    })
  }

  // ============ 历史 ============

  async listEvents(matchId: string) {
    const match = await this.prisma.match.findUnique({ where: { id: matchId } })
    if (!match) {
      throw new BusinessException(ErrorCode.MATCH_NOT_FOUND, '房间不存在')
    }
    // serverSeq desc：最新操作在最上，便于裁判快速追溯
    const rows = await this.prisma.matchEvent.findMany({
      where: { matchId },
      orderBy: { serverSeq: 'desc' },
      take: 500,
      include: {
        author: { select: { id: true, nickname: true, phoneNumber: true } }
      }
    })
    // 管理员操作单独标注（比如 force_end / score_correct）。
    const adminIds = Array.from(
      new Set(rows.map((r) => r.actorAdminId).filter(Boolean) as string[])
    )
    const admins = adminIds.length
      ? await this.prisma.adminAccount.findMany({
          where: { id: { in: adminIds } },
          select: { id: true, name: true, username: true }
        })
      : []
    const adminById = new Map(
      admins.map((a) => [a.id, a.name || a.username])
    )
    const items = rows.map((r) => ({
      ...r,
      actorNickname: r.author?.nickname ?? null,
      actorPhoneMasked: maskPhone(r.author?.phoneNumber ?? null),
      actorAdminName: r.actorAdminId
        ? adminById.get(r.actorAdminId) ?? null
        : null,
      author: undefined // 不把 relation + 原始手机号抛给前端
    }))
    return { items, total: items.length }
  }

  async findMyActiveMatch(userId: string) {
    const match = await this.prisma.match.findFirst({
      where: {
        OR: [
          { ownerUserId: userId },
          {
            players: {
              some: { userId, leftAt: null }
            }
          }
        ],
        state: { in: [MatchState.waiting, MatchState.in_progress, MatchState.paused] }
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true }
    })
    if (!match) return null
    return this.detailFromTx(this.prisma, match.id)
  }

  /**
   * v2.22 战绩聚合 (`GET /v1/me/stats`)
   *
   * 实现：拉所有 ended 比赛 → 走 detailFromTx 拿 computed → 遍历聚合。
   * 性能：单用户 < 1000 场前 < 100ms 内出结果；超过再考虑预聚合表。
   */
  async myStats(userId: string) {
    const matches = await this.prisma.match.findMany({
      where: {
        OR: [{ ownerUserId: userId }, { players: { some: { userId } } }],
        state: MatchState.ended
      },
      orderBy: { endedAt: 'desc' },
      select: { id: true }
    })

    let totalMatches = 0
    let wins = 0
    const nineBall = {
      matches: 0,
      wins: 0,
      bigJack: 0,
      smallJack: 0,
      golden9: 0,
      normalWin: 0,
      highScore: 0,
      highScoreVs: ''
    }
    const eightBall = {
      matches: 0,
      wins: 0,
      totalWinRounds: 0
    }
    const recent: Array<{
      matchId: string
      type: 'nine_ball' | 'eight_ball'
      opponent: string
      myScore: number
      oppScore: number
      endedAt: Date | null
      isWin: boolean
    }> = []

    for (const m of matches) {
      const detail = await this.detailFromTx(this.prisma, m.id)
      const myPlayer = detail.players.find((p) => p.userId === userId && p.isCurrent)
      if (!myPlayer) continue
      const mySlot = myPlayer.slot
      const isNineBall = detail.type === MatchType.nine_ball
      const players = detail.players.filter((p) => p.isCurrent)

      const myScore = isNineBall
        ? (detail.computed as NineBallComputedState).scores?.[mySlot] ?? 0
        : (detail.computed as EightBallComputedState).wins?.[mySlot] ?? 0

      // 冠军：分数 / 胜局最高
      const champion = players.reduce((a, b) => {
        const sa = isNineBall
          ? (detail.computed as NineBallComputedState).scores?.[a.slot] ?? 0
          : (detail.computed as EightBallComputedState).wins?.[a.slot] ?? 0
        const sb = isNineBall
          ? (detail.computed as NineBallComputedState).scores?.[b.slot] ?? 0
          : (detail.computed as EightBallComputedState).wins?.[b.slot] ?? 0
        return sa >= sb ? a : b
      }, players[0])
      const isWin = champion?.slot === mySlot

      totalMatches++
      if (isWin) wins++

      if (isNineBall) {
        nineBall.matches++
        if (isWin) nineBall.wins++
        const myStatsRow = (detail.computed as NineBallComputedState).stats?.[mySlot]
        if (myStatsRow) {
          nineBall.bigJack += myStatsRow.bigJack || 0
          nineBall.smallJack += myStatsRow.smallJack || 0
          nineBall.golden9 += myStatsRow.golden9 || 0
          nineBall.normalWin += myStatsRow.normalWin || 0
        }
        if (myScore > nineBall.highScore) {
          nineBall.highScore = myScore
          const opp = players.find((p) => p.slot !== mySlot)
          nineBall.highScoreVs = opp?.displayName ?? ''
        }
      } else {
        eightBall.matches++
        if (isWin) eightBall.wins++
        eightBall.totalWinRounds += myScore
      }

      if (recent.length < 5) {
        const opp = players.find((p) => p.slot !== mySlot)
        const oppScore = opp
          ? isNineBall
            ? (detail.computed as NineBallComputedState).scores?.[opp.slot] ?? 0
            : (detail.computed as EightBallComputedState).wins?.[opp.slot] ?? 0
          : 0
        recent.push({
          matchId: detail.id,
          type: detail.type,
          opponent: opp?.displayName ?? '',
          myScore,
          oppScore,
          endedAt: detail.endedAt,
          isWin
        })
      }
    }

    return {
      totalMatches,
      wins,
      winRate: totalMatches > 0 ? Math.round((wins / totalMatches) * 100) : 0,
      nineBall,
      eightBall,
      recent
    }
  }

  async listMyMatches(userId: string, page: number, pageSize: number) {
    const where: Prisma.MatchWhereInput = {
      OR: [
        { ownerUserId: userId },
        { players: { some: { userId } } }
      ],
      state: MatchState.ended
    }
    const [matches, total] = await this.prisma.$transaction([
      this.prisma.match.findMany({
        where,
        orderBy: { endedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: { id: true }
      }),
      this.prisma.match.count({ where })
    ])
    // 对每个 match 走一次 detail 拿到 computed/timer/rules（最多 pageSize 个，可接受）
    const items = await Promise.all(
      matches.map((m) => this.detailFromTx(this.prisma, m.id))
    )
    return { items, total, page, pageSize }
  }

  // ============ 帮助函数 ============

  /**
   * PG advisory lock 按 matchId hash 加锁；保证同一 match 的事件串行应用
   */
  private async withMatchLock<T>(
    matchId: string,
    fn: (tx: Prisma.TransactionClient) => Promise<T>
  ): Promise<T> {
    const broadcasts: Array<() => void> = []
    const result = await this.prisma.$transaction(async (tx) => {
      // 把待广播闭包挂在 tx 上，insertEvent 会 push
      ;(tx as unknown as { _broadcasts: Array<() => void> })._broadcasts = broadcasts
      const key = this.hashMatchId(matchId)
      await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${key})`)
      return fn(tx)
    })
    // 事务 commit 后再广播（避免回滚导致的幽灵事件）
    for (const b of broadcasts) {
      try {
        b()
      } catch (e) {
        this.logger.warn(`broadcast failed: ${(e as Error).message}`)
      }
    }
    return result
  }

  private hashMatchId(id: string): number {
    let h = 0
    for (let i = 0; i < id.length; i++) {
      h = ((h << 5) - h + id.charCodeAt(i)) | 0
    }
    return h
  }

  private async insertEvent(
    tx: Prisma.TransactionClient,
    matchId: string,
    payload: MatchEventPayload,
    actor: { userId?: string; adminId?: string } = {},
    clientSeq?: number
  ): Promise<number> {
    const { type, ...rest } = payload as any
    // 取当前最大 serverSeq
    const last = await tx.matchEvent.findFirst({
      where: { matchId },
      orderBy: { serverSeq: 'desc' },
      select: { serverSeq: true }
    })
    const nextSeq = last ? last.serverSeq + 1n : 1n
    const created = await tx.matchEvent.create({
      data: {
        matchId,
        serverSeq: nextSeq,
        clientSeq: clientSeq ? BigInt(clientSeq) : null,
        actorUserId: actor.userId ?? null,
        actorAdminId: actor.adminId ?? null,
        type,
        payloadJson: rest
      }
    })
    // 把广播闭包挂到 tx 的队列，withMatchLock 事务 commit 后会统一执行
    const broadcasts = (tx as unknown as { _broadcasts?: Array<() => void> })._broadcasts
    if (broadcasts) {
      broadcasts.push(() => {
        this.realtime.broadcastMatchEvent(matchId, {
          event: {
            id: Number(created.id),
            serverSeq: Number(nextSeq),
            type,
            payload: rest,
            actorUserId: actor.userId ?? null,
            actorAdminId: actor.adminId ?? null,
            createdAt: created.createdAt.toISOString(),
            undone: false
          }
        })
      })
    }
    return Number(nextSeq)
  }

  private normalizeRules(
    type: MatchType,
    input: Partial<NineBallRules> | Partial<EightBallRules>
  ) {
    if (type === MatchType.nine_ball) {
      const r = input as Partial<NineBallRules>
      return {
        bigJack: r.bigJack ?? DEFAULT_NINE_BALL_RULES.bigJack,
        smallJack: r.smallJack ?? DEFAULT_NINE_BALL_RULES.smallJack,
        golden9: r.golden9 ?? DEFAULT_NINE_BALL_RULES.golden9,
        normalWin: r.normalWin ?? DEFAULT_NINE_BALL_RULES.normalWin,
        foulCompensation:
          r.foulCompensation ?? DEFAULT_NINE_BALL_RULES.foulCompensation
      }
    } else {
      const r = input as Partial<EightBallRules>
      return { targetWins: r.targetWins ?? 5 }
    }
  }
}
