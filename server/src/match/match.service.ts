import { Injectable, Logger } from '@nestjs/common'
import {
  MatchState,
  MatchType,
  Prisma,
  User
} from '@prisma/client'
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

@Injectable()
export class MatchService {
  private readonly logger = new Logger(MatchService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService
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

  private async detailFromTx(tx: Prisma.TransactionClient | PrismaService, matchId: string) {
    const match = await tx.match.findUnique({
      where: { id: matchId },
      include: {
        players: { orderBy: [{ slot: 'asc' }, { joinedAt: 'asc' }] },
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
      endedReason: match.endedReason
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
    return this.withMatchLock(matchId, async (tx) => {
      const match = await tx.match.findUnique({ where: { id: matchId } })
      if (!match) throw new BusinessException(ErrorCode.MATCH_NOT_FOUND, '房间不存在')
      if (match.ownerUserId !== ownerUserId) {
        throw new BusinessException(ErrorCode.FORBIDDEN, '只有房主能结束比赛')
      }
      if (match.state === MatchState.ended || match.state === MatchState.dissolved) {
        return
      }
      await this.doEnd(tx, matchId, { userId: ownerUserId }, reason ?? 'owner')
    })
  }

  async forceEndByAdmin(matchId: string, adminId: string, reason: string) {
    return this.withMatchLock(matchId, async (tx) => {
      const match = await tx.match.findUnique({ where: { id: matchId } })
      if (!match) throw new BusinessException(ErrorCode.MATCH_NOT_FOUND, '房间不存在')
      if (match.state === MatchState.ended || match.state === MatchState.dissolved) {
        return
      }
      await this.insertEvent(
        tx,
        matchId,
        { type: 'force_end', adminId, reason },
        { adminId }
      )
      await this.doEnd(tx, matchId, { adminId }, reason)
    })
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
    const items = await this.prisma.matchEvent.findMany({
      where: { matchId },
      orderBy: { serverSeq: 'asc' },
      take: 500
    })
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
