import { Injectable } from '@nestjs/common'
import {
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
   * 之后由 P4 的 startTournament 接力生成 bracket。
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
      select: { id: true, name: true, address: true, coverImage: true }
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
    const items = await this.prisma.tournamentRegistration.findMany({
      where,
      orderBy: { registeredAt: 'asc' }
    })
    return { items, total: items.length }
  }

  async registrationsPublic(tournamentId: string) {
    const items = await this.prisma.tournamentRegistration.findMany({
      where: {
        tournamentId,
        status: TournamentRegistrationStatus.confirmed
      },
      orderBy: { registeredAt: 'asc' },
      select: {
        id: true,
        displayName: true,
        registeredAt: true,
        seed: true
      }
    })
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
