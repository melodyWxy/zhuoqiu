import { Injectable, Logger } from '@nestjs/common'
import {
  MatchState,
  MatchType,
  Prisma,
  User
} from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
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

export interface CreateMatchInput {
  ownerUserId: string
  type: MatchType
  rules: Partial<NineBallRules> | Partial<EightBallRules>
  playerSlots: Array<{ slot: number; name: string; claim: boolean }>
}

@Injectable()
export class MatchService {
  private readonly logger = new Logger(MatchService.name)

  constructor(private readonly prisma: PrismaService) {}

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

  async joinByCode(code: string, userId: string, slot?: number) {
    const match = await this.prisma.match.findUnique({ where: { code: code.toUpperCase() } })
    if (!match) {
      throw new BusinessException(ErrorCode.MATCH_NOT_FOUND, '房间不存在')
    }
    if (match.state === MatchState.ended || match.state === MatchState.dissolved) {
      throw new BusinessException(ErrorCode.MATCH_CODE_EXPIRED, '房间已结束')
    }
    // 未指定 slot → 作为观众
    if (!slot) {
      return { match: await this.detail(match.id), role: 'spectator' as const }
    }
    await this.occupySlot(match.id, userId, slot)
    return { match: await this.detail(match.id), role: 'player' as const }
  }

  async occupySlot(matchId: string, userId: string, slot: number) {
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
        return // 幂等
      }
      if (occupant.userId !== null) {
        throw new BusinessException(ErrorCode.MATCH_FULL, '该号位已被其他人占据')
      }
      await tx.matchPlayer.update({
        where: { id: occupant.id },
        data: { userId }
      })
      await this.insertEvent(tx, matchId, {
        type: 'seat_occupy',
        slot,
        userId,
        name: occupant.displayName
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
  }

  async kickByAdmin(
    matchId: string,
    targetUserId: string,
    adminId: string,
    reason: string
  ) {
    return this.withMatchLock(matchId, async (tx) => {
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
    })
  }

  // ============ 历史 ============

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
        include: {
          players: { where: { isCurrent: true }, orderBy: { slot: 'asc' } }
        }
      }),
      this.prisma.match.count({ where })
    ])
    return { items: matches, total, page, pageSize }
  }

  // ============ 帮助函数 ============

  /**
   * PG advisory lock 按 matchId hash 加锁；保证同一 match 的事件串行应用
   */
  private async withMatchLock<T>(
    matchId: string,
    fn: (tx: Prisma.TransactionClient) => Promise<T>
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      // hash to int32
      const key = this.hashMatchId(matchId)
      await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${key})`)
      return fn(tx)
    })
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
    await tx.matchEvent.create({
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
