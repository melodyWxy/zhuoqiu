import { Injectable } from '@nestjs/common'
import {
  BracketMatchStatus,
  Prisma,
  Tournament,
  TournamentRegistration,
  TournamentRegistrationStatus,
  TournamentStatus
} from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { BusinessException, ErrorCode } from '../common/exceptions/business.exception'
import { genId } from '../common/utils/id'
import {
  CreateTournamentDto,
  TournamentListQueryDto,
  UpdateTournamentDto
} from './dto/tournament.dto'
import { planBracket, planDoubleElim } from './bracket-utils'
import { advanceFromCompletedMatch } from './bracket-advance'

@Injectable()
export class TournamentService {
  constructor(private readonly prisma: PrismaService) {}

  // ============ 商家：CRUD + 状态切换 ============

  async createDraft(
    accountId: string,
    venueId: string,
    dto: CreateTournamentDto
  ): Promise<Tournament> {
    if (dto.minPlayers > dto.maxPlayers) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '最小人数不能大于最大人数'
      )
    }
    const regStarts = new Date(dto.registrationStartsAt)
    const regEnds = new Date(dto.registrationEndsAt)
    const matchStarts = new Date(dto.matchStartsAt)
    if (regEnds <= regStarts) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '报名截止时间必须晚于开始时间'
      )
    }
    if (matchStarts < regEnds) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '开赛时间不能早于报名截止时间'
      )
    }
    return this.prisma.tournament.create({
      data: {
        id: genId('t'),
        venueId,
        title: dto.title,
        gameType: dto.gameType,
        format: dto.format,
        rulesJson: dto.rules as Prisma.InputJsonValue,
        maxPlayers: dto.maxPlayers,
        minPlayers: dto.minPlayers,
        entryFeeCents: dto.entryFeeCents ?? 0,
        prizePoolText: dto.prizePoolText,
        registrationStartsAt: regStarts,
        registrationEndsAt: regEnds,
        matchStartsAt: matchStarts,
        coverImage: dto.coverImage,
        noticeText: dto.noticeText,
        status: TournamentStatus.draft,
        createdByAccountId: accountId
      }
    })
  }

  async update(id: string, accountId: string, dto: UpdateTournamentDto) {
    const t = await this.findOwn(id, accountId)
    if (
      t.status !== TournamentStatus.draft &&
      t.status !== TournamentStatus.registering
    ) {
      throw new BusinessException(
        ErrorCode.TOURNAMENT_STATE_INVALID,
        '当前状态不可编辑'
      )
    }
    const data: Prisma.TournamentUpdateInput = {}
    if (dto.title !== undefined) data.title = dto.title
    if (dto.rules !== undefined)
      data.rulesJson = dto.rules as Prisma.InputJsonValue
    if (dto.maxPlayers !== undefined) data.maxPlayers = dto.maxPlayers
    if (dto.minPlayers !== undefined) data.minPlayers = dto.minPlayers
    if (dto.entryFeeCents !== undefined) data.entryFeeCents = dto.entryFeeCents
    if (dto.prizePoolText !== undefined) data.prizePoolText = dto.prizePoolText
    if (dto.registrationStartsAt !== undefined)
      data.registrationStartsAt = new Date(dto.registrationStartsAt)
    if (dto.registrationEndsAt !== undefined)
      data.registrationEndsAt = new Date(dto.registrationEndsAt)
    if (dto.matchStartsAt !== undefined)
      data.matchStartsAt = new Date(dto.matchStartsAt)
    if (dto.coverImage !== undefined) data.coverImage = dto.coverImage
    if (dto.noticeText !== undefined) data.noticeText = dto.noticeText
    return this.prisma.tournament.update({ where: { id }, data })
  }

  async publish(id: string, accountId: string) {
    const t = await this.findOwn(id, accountId)
    if (t.status !== TournamentStatus.draft) {
      throw new BusinessException(
        ErrorCode.TOURNAMENT_STATE_INVALID,
        '只有草稿可以发布'
      )
    }
    return this.prisma.tournament.update({
      where: { id },
      data: { status: TournamentStatus.registering }
    })
  }

  async cancel(id: string, accountId: string) {
    const t = await this.findOwn(id, accountId)
    if (
      t.status === TournamentStatus.completed ||
      t.status === TournamentStatus.cancelled
    ) {
      throw new BusinessException(
        ErrorCode.TOURNAMENT_STATE_INVALID,
        '已结束/已取消的赛事不能再取消'
      )
    }
    return this.prisma.tournament.update({
      where: { id },
      data: { status: TournamentStatus.cancelled }
    })
  }

  /**
   * 关闭报名（registering → registration_closed）。
   * 之后由 startTournament 接力生成 bracket。
   */
  async closeRegistration(id: string, accountId: string) {
    const t = await this.findOwn(id, accountId)
    if (t.status !== TournamentStatus.registering) {
      throw new BusinessException(
        ErrorCode.TOURNAMENT_STATE_INVALID,
        '当前状态不能关闭报名'
      )
    }
    return this.prisma.tournament.update({
      where: { id },
      data: { status: TournamentStatus.registration_closed }
    })
  }

  /**
   * 生成 bracket 并开赛（registration_closed → in_progress）。
   * - 只支持 single_elim
   * - 按报名顺序分配 seed
   * - 补 BYE 到 2^k
   * - 一次性生成全部轮次（首轮填人 + 其余 round 为 pending）
   * - 首轮一方 BYE 时自动 walkover，winner 填入下一轮对应位置
   */
  async startTournament(id: string, accountId: string) {
    return this.prisma.$transaction(async (tx) => {
      const t = await tx.tournament.findUnique({ where: { id } })
      if (!t) {
        throw new BusinessException(
          ErrorCode.TOURNAMENT_NOT_FOUND,
          '赛事不存在'
        )
      }
      const acc = await tx.venueAccount.findUnique({ where: { id: accountId } })
      if (!acc || acc.venueId !== t.venueId) {
        throw new BusinessException(
          ErrorCode.TOURNAMENT_NOT_OWNER,
          '不是你自家球房的赛事'
        )
      }
      if (
        t.status !== TournamentStatus.registering &&
        t.status !== TournamentStatus.registration_closed
      ) {
        throw new BusinessException(
          ErrorCode.TOURNAMENT_STATE_INVALID,
          '当前状态不能开赛'
        )
      }
      if (t.format !== 'single_elim' && t.format !== 'double_elim') {
        throw new BusinessException(
          ErrorCode.BAD_REQUEST,
          '仅单败 / 双败淘汰支持开赛（循环赛 / 瑞士轮 v2.11+）'
        )
      }

      // 清理已有 bracket（避免重复调用产生脏数据）
      await tx.tournamentBracketMatch.deleteMany({
        where: { tournamentId: id }
      })

      // 按报名顺序分配 seed；filter 掉 withdrawn/disqualified
      const regs = await tx.tournamentRegistration.findMany({
        where: {
          tournamentId: id,
          status: TournamentRegistrationStatus.confirmed
        },
        orderBy: { registeredAt: 'asc' }
      })
      if (regs.length < t.minPlayers) {
        throw new BusinessException(
          ErrorCode.TOURNAMENT_STATE_INVALID,
          `报名人数不足 ${t.minPlayers}`
        )
      }
      // 写入 seed
      for (let i = 0; i < regs.length; i++) {
        await tx.tournamentRegistration.update({
          where: { id: regs[i].id },
          data: { seed: i + 1 }
        })
      }
      const seedToReg = new Map<number, TournamentRegistration>()
      regs.forEach((r, i) => seedToReg.set(i + 1, r))

      // 双败：用显式指针物化整图，单独走 genDoubleElimBracket
      if (t.format === 'double_elim') {
        await this.genDoubleElimBracket(tx, t.id, regs)
        return tx.tournament.update({
          where: { id },
          data: { status: TournamentStatus.in_progress }
        })
      }

      // ---- 以下单败淘汰（原逻辑，无指针，推进走 legacy floor）----
      const plan = planBracket(regs.length)

      // 生成所有 round 的 pending bracket
      // 存一个 grid[round][slot] = id，供首轮 walkover 时向上回填
      const grid: string[][] = []
      for (let r = 0; r < plan.rounds; r++) {
        const row: string[] = []
        for (let s = 0; s < plan.matchesPerRound[r]; s++) {
          const bid = genId('bm')
          row.push(bid)
        }
        grid.push(row)
      }

      // 首轮：按 firstRoundSeeds 配对
      const firstRound = plan.firstRoundSeeds
      type BracketCreateInput = Parameters<
        typeof tx.tournamentBracketMatch.create
      >[0]['data']
      const firstRoundRecords: BracketCreateInput[] = []
      const walkoverWinners: Array<{ round: number; slot: number; regId: string }> = []

      for (let s = 0; s < plan.matchesPerRound[0]; s++) {
        const seedA = firstRound[s * 2]
        const seedB = firstRound[s * 2 + 1]
        const regA = seedA ? seedToReg.get(seedA) ?? null : null
        const regB = seedB ? seedToReg.get(seedB) ?? null : null
        const id = grid[0][s]

        let status: BracketMatchStatus = BracketMatchStatus.pending
        let winnerRegistrationId: string | null = null

        if (regA && !regB) {
          status = BracketMatchStatus.walkover
          winnerRegistrationId = regA.id
          walkoverWinners.push({ round: 1, slot: s, regId: regA.id })
        } else if (!regA && regB) {
          status = BracketMatchStatus.walkover
          winnerRegistrationId = regB.id
          walkoverWinners.push({ round: 1, slot: s, regId: regB.id })
        } else if (regA && regB) {
          status = BracketMatchStatus.ready
        }
        // 两边都 null 基本不会出现（奇数 BYE 只会落在头部一侧）

        firstRoundRecords.push({
          id,
          tournamentId: id // placeholder; overwritten below
        } as BracketCreateInput)
        // 真正 create
        await tx.tournamentBracketMatch.create({
          data: {
            id,
            tournamentId: t.id,
            round: 1,
            slotInRound: s,
            playerARegistrationId: regA?.id ?? null,
            playerBRegistrationId: regB?.id ?? null,
            status,
            winnerRegistrationId
          }
        })
      }

      // 后续 round：全 pending，无玩家
      for (let r = 1; r < plan.rounds; r++) {
        for (let s = 0; s < plan.matchesPerRound[r]; s++) {
          await tx.tournamentBracketMatch.create({
            data: {
              id: grid[r][s],
              tournamentId: t.id,
              round: r + 1,
              slotInRound: s,
              status: BracketMatchStatus.pending
            }
          })
        }
      }

      // 处理首轮 walkover：填入第二轮对应位置
      for (const w of walkoverWinners) {
        const nextRound = w.round + 1
        if (nextRound > plan.rounds) continue
        const nextSlot = Math.floor(w.slot / 2)
        const nextId = grid[nextRound - 1][nextSlot]
        // 决定填 A 还是 B：偶数 slot 的 winner → playerA，奇数 slot → playerB
        const side = w.slot % 2 === 0 ? 'playerARegistrationId' : 'playerBRegistrationId'
        const existing = await tx.tournamentBracketMatch.findUnique({
          where: { id: nextId }
        })
        const updated: Prisma.TournamentBracketMatchUpdateInput = {
          [side]: w.regId
        } as Prisma.TournamentBracketMatchUpdateInput
        await tx.tournamentBracketMatch.update({
          where: { id: nextId },
          data: updated
        })
        // 如果下一轮双方都已就位，状态置 ready
        const refreshed = await tx.tournamentBracketMatch.findUnique({
          where: { id: nextId }
        })
        if (
          refreshed?.playerARegistrationId &&
          refreshed?.playerBRegistrationId &&
          refreshed.status === BracketMatchStatus.pending
        ) {
          await tx.tournamentBracketMatch.update({
            where: { id: nextId },
            data: { status: BracketMatchStatus.ready }
          })
        }
        void existing
      }

      return tx.tournament.update({
        where: { id },
        data: { status: TournamentStatus.in_progress }
      })
    })
  }

  /**
   * 双败：把 planDoubleElim 计划物化成 bracket（含显式 winnerTo/loserTo 指针），
   * 再用统一推进处理 WB 首轮 BYE 的自动晋级 + 败者下沉。
   */
  private async genDoubleElimBracket(
    tx: Prisma.TransactionClient,
    tournamentId: string,
    regs: TournamentRegistration[]
  ) {
    const plan = planDoubleElim(regs.length)
    const seedToReg = new Map<number, TournamentRegistration>()
    regs.forEach((r, i) => seedToReg.set(i + 1, r))
    // 先给每个计划节点分配稳定的 bm id，便于把 key 指针翻译成真实 id
    const idByKey = new Map<string, string>()
    for (const nd of plan.nodes) idByKey.set(nd.key, genId('bm'))

    for (const nd of plan.nodes) {
      const id = idByKey.get(nd.key)!
      const isWbFirst = nd.group === 'winners' && nd.round === 1
      let playerARegistrationId: string | null = null
      let playerBRegistrationId: string | null = null
      let slotASettled = false
      let slotBSettled = false
      let status: BracketMatchStatus = BracketMatchStatus.pending
      let winnerRegistrationId: string | null = null

      if (isWbFirst) {
        const regA = nd.seedA != null ? seedToReg.get(nd.seedA) ?? null : null
        const regB = nd.seedB != null ? seedToReg.get(nd.seedB) ?? null : null
        playerARegistrationId = regA?.id ?? null
        playerBRegistrationId = regB?.id ?? null
        slotASettled = true
        slotBSettled = true
        if (regA && regB) {
          status = BracketMatchStatus.ready
        } else {
          status = BracketMatchStatus.walkover
          winnerRegistrationId = regA?.id ?? regB?.id ?? null
        }
      }

      await tx.tournamentBracketMatch.create({
        data: {
          id,
          tournamentId,
          bracketGroup: nd.group,
          round: nd.round,
          slotInRound: nd.slot,
          playerARegistrationId,
          playerBRegistrationId,
          winnerRegistrationId,
          status,
          winnerToMatchId: nd.winnerToKey ? idByKey.get(nd.winnerToKey)! : null,
          winnerToSlot: nd.winnerToSlot ?? null,
          loserToMatchId: nd.loserToKey ? idByKey.get(nd.loserToKey)! : null,
          loserToSlot: nd.loserToSlot ?? null,
          slotASettled,
          slotBSettled
        }
      })
    }

    // WB 首轮 BYE → 沿指针自动晋级（winner 进 WB R2，loser=null 下沉 LB）
    for (const nd of plan.nodes) {
      if (nd.group !== 'winners' || nd.round !== 1) continue
      const id = idByKey.get(nd.key)!
      const row = await tx.tournamentBracketMatch.findUnique({ where: { id } })
      if (row?.status === BracketMatchStatus.walkover) {
        await advanceFromCompletedMatch(tx, id)
      }
    }
  }

  // ============ bracket 查询 ============

  async getBracket(tournamentId: string) {
    const t = await this.prisma.tournament.findUnique({
      where: { id: tournamentId }
    })
    if (!t) {
      throw new BusinessException(
        ErrorCode.TOURNAMENT_NOT_FOUND,
        '赛事不存在'
      )
    }
    const raw = await this.prisma.tournamentBracketMatch.findMany({
      where: { tournamentId },
      orderBy: [{ round: 'asc' }, { slotInRound: 'asc' }],
      include: {
        playerA: { select: { id: true, displayName: true, seed: true, userId: true } },
        playerB: { select: { id: true, displayName: true, seed: true, userId: true } },
        winner: { select: { id: true, displayName: true, seed: true, userId: true } }
      }
    })
    // 用 userId 批量取 user.nickname 覆盖 displayName
    const userIds: string[] = []
    for (const it of raw) {
      if (it.playerA) userIds.push(it.playerA.userId)
      if (it.playerB) userIds.push(it.playerB.userId)
      if (it.winner) userIds.push(it.winner.userId)
    }
    const nickById = await this.nicknameByUserIds(userIds)
    const withNick = <P extends { userId: string; displayName: string } | null>(
      p: P
    ): P =>
      (p
        ? { ...p, displayName: nickById.get(p.userId) || p.displayName }
        : p) as P
    const items = raw.map((it) => ({
      ...it,
      playerA: withNick(it.playerA),
      playerB: withNick(it.playerB),
      winner: withNick(it.winner)
    }))
    // 过滤未激活的决胜局空壳（grand_final round2 且还没人填进来）
    const visible = items.filter(
      (it) =>
        !(
          it.bracketGroup === 'grand_final' &&
          it.round === 2 &&
          it.status === BracketMatchStatus.pending &&
          !it.slotASettled
        )
    )
    // 按 group 分 round → slots
    const groupRounds = (grp: string) => {
      const map: Record<number, typeof items> = {}
      for (const it of visible.filter((x) => x.bracketGroup === grp)) {
        if (!map[it.round]) map[it.round] = []
        map[it.round].push(it)
      }
      return Object.keys(map)
        .map(Number)
        .sort((a, b) => a - b)
        .map((r) => ({ round: r, matches: map[r] }))
    }
    const winners = groupRounds('winners')
    const losers = groupRounds('losers')
    const grandFinal = visible.filter((x) => x.bracketGroup === 'grand_final')
    return {
      tournamentId,
      status: t.status,
      format: t.format,
      // 向后兼容：rounds = 胜者组（单败时即全部对阵）
      rounds: winners,
      totalRounds: winners.length,
      winners,
      losers,
      grandFinal
    }
  }

  // ============ 报名 / 取消报名（C 端 user）============

  async register(
    tournamentId: string,
    user: { id: string; nickname: string; phoneNumber: string | null },
    overrideName?: string
  ): Promise<TournamentRegistration> {
    return this.prisma.$transaction(async (tx) => {
      const t = await tx.tournament.findUnique({ where: { id: tournamentId } })
      if (!t) {
        throw new BusinessException(
          ErrorCode.TOURNAMENT_NOT_FOUND,
          '赛事不存在'
        )
      }
      if (t.status !== TournamentStatus.registering) {
        throw new BusinessException(
          ErrorCode.TOURNAMENT_REGISTRATION_CLOSED,
          '当前不在报名期'
        )
      }
      const now = new Date()
      if (now < t.registrationStartsAt) {
        throw new BusinessException(
          ErrorCode.TOURNAMENT_REGISTRATION_CLOSED,
          '报名尚未开始'
        )
      }
      if (now > t.registrationEndsAt) {
        throw new BusinessException(
          ErrorCode.TOURNAMENT_REGISTRATION_CLOSED,
          '报名已截止'
        )
      }

      const existing = await tx.tournamentRegistration.findUnique({
        where: {
          tournamentId_userId: { tournamentId, userId: user.id }
        }
      })
      if (existing) {
        if (existing.status === TournamentRegistrationStatus.confirmed) {
          throw new BusinessException(
            ErrorCode.TOURNAMENT_ALREADY_REGISTERED,
            '你已报名'
          )
        }
        // withdrawn → 重新报名：判断是否还有名额，再 set confirmed
        const count = await tx.tournamentRegistration.count({
          where: {
            tournamentId,
            status: TournamentRegistrationStatus.confirmed
          }
        })
        if (count >= t.maxPlayers) {
          throw new BusinessException(
            ErrorCode.TOURNAMENT_REGISTRATION_FULL,
            '名额已满'
          )
        }
        return tx.tournamentRegistration.update({
          where: { id: existing.id },
          data: {
            status: TournamentRegistrationStatus.confirmed,
            displayName: overrideName?.trim() || user.nickname,
            phone: user.phoneNumber ?? '',
            registeredAt: new Date()
          }
        })
      }

      // 新报名：先校验名额
      const count = await tx.tournamentRegistration.count({
        where: { tournamentId, status: TournamentRegistrationStatus.confirmed }
      })
      if (count >= t.maxPlayers) {
        throw new BusinessException(
          ErrorCode.TOURNAMENT_REGISTRATION_FULL,
          '名额已满'
        )
      }

      return tx.tournamentRegistration.create({
        data: {
          id: genId('reg'),
          tournamentId,
          userId: user.id,
          displayName: overrideName?.trim() || user.nickname,
          phone: user.phoneNumber ?? '',
          status: TournamentRegistrationStatus.confirmed
        }
      })
    })
  }

  async withdraw(tournamentId: string, userId: string) {
    const reg = await this.prisma.tournamentRegistration.findUnique({
      where: { tournamentId_userId: { tournamentId, userId } }
    })
    if (!reg) {
      throw new BusinessException(
        ErrorCode.TOURNAMENT_REGISTRATION_NOT_FOUND,
        '未找到你的报名记录'
      )
    }
    if (reg.status === TournamentRegistrationStatus.withdrawn) {
      return reg
    }
    const t = await this.prisma.tournament.findUnique({
      where: { id: tournamentId }
    })
    if (!t) {
      throw new BusinessException(
        ErrorCode.TOURNAMENT_NOT_FOUND,
        '赛事不存在'
      )
    }
    if (
      t.status !== TournamentStatus.registering &&
      t.status !== TournamentStatus.draft
    ) {
      throw new BusinessException(
        ErrorCode.TOURNAMENT_STATE_INVALID,
        '当前状态不能取消报名'
      )
    }
    return this.prisma.tournamentRegistration.update({
      where: { id: reg.id },
      data: { status: TournamentRegistrationStatus.withdrawn }
    })
  }

  async kick(
    tournamentId: string,
    accountId: string,
    registrationId: string
  ) {
    const t = await this.findOwn(tournamentId, accountId)
    if (
      t.status !== TournamentStatus.registering &&
      t.status !== TournamentStatus.registration_closed
    ) {
      throw new BusinessException(
        ErrorCode.TOURNAMENT_STATE_INVALID,
        '当前状态不能移除报名'
      )
    }
    const reg = await this.prisma.tournamentRegistration.findUnique({
      where: { id: registrationId }
    })
    if (!reg || reg.tournamentId !== tournamentId) {
      throw new BusinessException(
        ErrorCode.TOURNAMENT_REGISTRATION_NOT_FOUND,
        '报名记录不存在'
      )
    }
    return this.prisma.tournamentRegistration.update({
      where: { id: reg.id },
      data: { status: TournamentRegistrationStatus.disqualified }
    })
  }

  // ============ 读 ============

  async listPublic(args: TournamentListQueryDto) {
    const where: Prisma.TournamentWhereInput = {}
    if (args.venueId) where.venueId = args.venueId
    if (args.status) where.status = args.status
    else where.status = { not: TournamentStatus.draft }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.tournament.findMany({
        where,
        orderBy: [{ matchStartsAt: 'asc' }, { createdAt: 'desc' }],
        skip: (args.page - 1) * args.pageSize,
        take: args.pageSize,
        include: {
          _count: {
            select: {
              registrations: {
                where: { status: TournamentRegistrationStatus.confirmed }
              }
            }
          }
        }
      }),
      this.prisma.tournament.count({ where })
    ])
    return {
      items: items.map((t) => this.projectListItem(t)),
      total,
      page: args.page,
      pageSize: args.pageSize
    }
  }

  async listOwn(accountId: string, venueId: string, args: TournamentListQueryDto) {
    const where: Prisma.TournamentWhereInput = { venueId }
    if (args.status) where.status = args.status

    const [items, total] = await this.prisma.$transaction([
      this.prisma.tournament.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (args.page - 1) * args.pageSize,
        take: args.pageSize,
        include: {
          _count: {
            select: {
              registrations: {
                where: { status: TournamentRegistrationStatus.confirmed }
              }
            }
          }
        }
      }),
      this.prisma.tournament.count({ where })
    ])
    return {
      items: items.map((t) => this.projectListItem(t)),
      total,
      page: args.page,
      pageSize: args.pageSize
    }
  }

  async detailPublic(id: string) {
    const t = await this.prisma.tournament.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            registrations: {
              where: { status: TournamentRegistrationStatus.confirmed }
            }
          }
        }
      }
    })
    if (!t) {
      throw new BusinessException(
        ErrorCode.TOURNAMENT_NOT_FOUND,
        '赛事不存在'
      )
    }
    if (t.status === TournamentStatus.draft) {
      throw new BusinessException(
        ErrorCode.TOURNAMENT_NOT_FOUND,
        '赛事尚未发布'
      )
    }
    const venue = await this.prisma.venue.findUnique({
      where: { id: t.venueId },
      select: {
        id: true,
        name: true,
        province: true,
        city: true,
        district: true,
        address: true,
        coverImage: true
      }
    })
    return { ...this.projectListItem(t), venue, noticeText: t.noticeText }
  }

  async detailForOwner(id: string, accountId: string) {
    const t = await this.findOwn(id, accountId)
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: t.id },
      include: {
        _count: {
          select: {
            registrations: {
              where: { status: TournamentRegistrationStatus.confirmed }
            }
          }
        }
      }
    })
    return tournament ? this.projectListItem(tournament) : null
  }

  async registrationsForOwner(
    tournamentId: string,
    accountId: string,
    showWithdrawn = false
  ) {
    await this.findOwn(tournamentId, accountId)
    const where: Prisma.TournamentRegistrationWhereInput = {
      tournamentId
    }
    if (!showWithdrawn) {
      where.status = TournamentRegistrationStatus.confirmed
    }
    const rows = await this.prisma.tournamentRegistration.findMany({
      where,
      orderBy: { registeredAt: 'asc' }
    })
    // 把 displayName 替换成用户最新 nickname（TournamentRegistration 没声明 user relation）
    const nickById = await this.nicknameByUserIds(rows.map((r) => r.userId))
    const items = rows.map((r) => ({
      ...r,
      displayName: nickById.get(r.userId) || r.displayName
    }))
    return { items, total: items.length }
  }

  private async nicknameByUserIds(ids: string[]): Promise<Map<string, string>> {
    if (!ids.length) return new Map()
    const users = await this.prisma.user.findMany({
      where: { id: { in: [...new Set(ids)] } },
      select: { id: true, nickname: true }
    })
    return new Map(users.map((u) => [u.id, u.nickname]))
  }

  async registrationsPublic(tournamentId: string) {
    const rows = await this.prisma.tournamentRegistration.findMany({
      where: {
        tournamentId,
        status: TournamentRegistrationStatus.confirmed
      },
      orderBy: { registeredAt: 'asc' },
      select: {
        id: true,
        userId: true,
        displayName: true,
        registeredAt: true,
        seed: true
      }
    })
    // TournamentRegistration 没声明 user relation；批量 user.findMany 映射 nickname。
    // C 端公共报名列表：展示名以用户最新 nickname 为准，兜底才用 registration.displayName。
    const userIds = rows.map((r) => r.userId)
    const users = userIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, nickname: true }
        })
      : []
    const nickById = new Map(users.map((u) => [u.id, u.nickname]))
    const items = rows.map((r) => ({
      id: r.id,
      displayName: nickById.get(r.userId) || r.displayName,
      registeredAt: r.registeredAt,
      seed: r.seed
    }))
    return { items, total: items.length }
  }

  async myRegistration(tournamentId: string, userId: string) {
    return this.prisma.tournamentRegistration.findUnique({
      where: { tournamentId_userId: { tournamentId, userId } }
    })
  }

  async myTournaments(userId: string) {
    const regs = await this.prisma.tournamentRegistration.findMany({
      where: {
        userId,
        status: { not: TournamentRegistrationStatus.withdrawn }
      },
      orderBy: { registeredAt: 'desc' },
      include: {
        tournament: {
          include: {
            _count: {
              select: {
                registrations: {
                  where: { status: TournamentRegistrationStatus.confirmed }
                }
              }
            }
          }
        }
      }
    })
    return {
      items: regs.map((r) => ({
        registrationId: r.id,
        registrationStatus: r.status,
        seed: r.seed,
        registeredAt: r.registeredAt,
        tournament: this.projectListItem(r.tournament)
      })),
      total: regs.length
    }
  }

  // ============ helpers ============

  /**
   * 找到账号"自家"的赛事；若 accountId 不属于该赛事的 venue 则 61003。
   */
  private async findOwn(id: string, accountId: string) {
    const t = await this.prisma.tournament.findUnique({ where: { id } })
    if (!t) {
      throw new BusinessException(
        ErrorCode.TOURNAMENT_NOT_FOUND,
        '赛事不存在'
      )
    }
    const account = await this.prisma.venueAccount.findUnique({
      where: { id: accountId }
    })
    if (!account || account.venueId !== t.venueId) {
      throw new BusinessException(
        ErrorCode.TOURNAMENT_NOT_OWNER,
        '不是你自家球房的赛事'
      )
    }
    return t
  }

  private projectListItem(t: Tournament & { _count?: { registrations: number } }) {
    return {
      id: t.id,
      venueId: t.venueId,
      title: t.title,
      gameType: t.gameType,
      format: t.format,
      rulesJson: t.rulesJson,
      maxPlayers: t.maxPlayers,
      minPlayers: t.minPlayers,
      entryFeeCents: t.entryFeeCents,
      prizePoolText: t.prizePoolText,
      registrationStartsAt: t.registrationStartsAt,
      registrationEndsAt: t.registrationEndsAt,
      matchStartsAt: t.matchStartsAt,
      coverImage: t.coverImage,
      status: t.status,
      registeredCount: t._count?.registrations ?? 0,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt
    }
  }
}
