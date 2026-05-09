import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common'
import { AdminAuthGuard } from '../auth/admin-auth.guard'
import { PrismaService } from '../prisma/prisma.service'
import { PaginationDto, paginationMeta } from '../common/dto/pagination.dto'
import { BusinessException, ErrorCode } from '../common/exceptions/business.exception'
import { Prisma, MatchState, MatchType } from '@prisma/client'
import { IsEnum, IsOptional, IsString } from 'class-validator'
import { Transform } from 'class-transformer'
import { MatchService } from '../match/match.service'

class ListMatchesQuery extends PaginationDto {
  @IsOptional()
  @IsString()
  keyword?: string

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.split(',') : value))
  @IsEnum(MatchState, { each: true })
  state?: MatchState[]

  @IsOptional()
  @IsEnum(MatchType)
  type?: MatchType

  @IsOptional()
  @IsString()
  createdFrom?: string

  @IsOptional()
  @IsString()
  createdTo?: string
}

@Controller('admin/matches')
@UseGuards(AdminAuthGuard)
export class MatchesAdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly matchService: MatchService
  ) {}

  @Get()
  async list(@Query() q: ListMatchesQuery) {
    const where: Prisma.MatchWhereInput = {}

    if (q.state && q.state.length > 0) {
      where.state = { in: q.state }
    }
    if (q.type) {
      where.type = q.type
    }
    if (q.createdFrom || q.createdTo) {
      where.createdAt = {
        ...(q.createdFrom ? { gte: new Date(q.createdFrom) } : {}),
        ...(q.createdTo ? { lte: new Date(q.createdTo) } : {})
      }
    }
    if (q.keyword) {
      const kw = q.keyword.trim()
      where.OR = [
        { code: { equals: kw.toUpperCase() } },
        { owner: { nickname: { contains: kw, mode: 'insensitive' } } },
        { owner: { phoneNumber: { contains: kw } } }
      ]
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.match.findMany({
        where,
        include: {
          owner: {
            select: { id: true, nickname: true, phoneNumber: true }
          },
          players: {
            where: { isCurrent: true },
            orderBy: { slot: 'asc' }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize
      }),
      this.prisma.match.count({ where })
    ])

    return paginationMeta(items, total, q.page, q.pageSize)
  }

  @Get(':id')
  async detail(@Param('id') id: string) {
    // 复用 MatchService.detail（含 timer/computed/players）
    // 再补一个 admin-only 字段：owner.phoneNumber
    const detail = await this.matchService.detail(id)
    const ownerWithPhone = await this.prisma.user.findUnique({
      where: { id: detail.ownerUserId },
      select: { id: true, nickname: true, avatar: true, phoneNumber: true }
    })
    return { ...detail, owner: ownerWithPhone ?? detail.owner }
  }

  @Get(':id/events')
  async events(@Param('id') id: string, @Query() q: PaginationDto) {
    const match = await this.prisma.match.findUnique({ where: { id } })
    if (!match) {
      throw new BusinessException(ErrorCode.MATCH_NOT_FOUND, '房间不存在')
    }
    const [items, total] = await this.prisma.$transaction([
      this.prisma.matchEvent.findMany({
        where: { matchId: id },
        orderBy: { serverSeq: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize
      }),
      this.prisma.matchEvent.count({ where: { matchId: id } })
    ])
    return paginationMeta(items, total, q.page, q.pageSize)
  }
}
