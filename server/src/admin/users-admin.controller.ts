import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common'
import { AdminAuthGuard } from '../auth/admin-auth.guard'
import { PrismaService } from '../prisma/prisma.service'
import { PaginationDto, paginationMeta } from '../common/dto/pagination.dto'
import { Prisma, UserStatus } from '@prisma/client'
import { IsEnum, IsOptional, IsString } from 'class-validator'
import { BusinessException, ErrorCode } from '../common/exceptions/business.exception'

class ListUsersQuery extends PaginationDto {
  @IsOptional()
  @IsString()
  keyword?: string

  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus
}

@Controller('admin/users')
@UseGuards(AdminAuthGuard)
export class UsersAdminController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@Query() q: ListUsersQuery) {
    const where: Prisma.UserWhereInput = { deletedAt: null }
    if (q.status) {
      where.status = q.status
    }
    if (q.keyword) {
      const kw = q.keyword.trim()
      where.OR = [
        { nickname: { contains: kw, mode: 'insensitive' } },
        { phoneNumber: { contains: kw } },
        { id: { equals: kw } }
      ]
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        select: {
          id: true,
          nickname: true,
          avatar: true,
          phoneNumber: true,
          primarySource: true,
          status: true,
          banUntil: true,
          lastActiveAt: true,
          createdAt: true
        }
      }),
      this.prisma.user.count({ where })
    ])

    return paginationMeta(items, total, q.page, q.pageSize)
  }

  @Get(':id')
  async detail(@Param('id') id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        wechatBindings: {
          where: { unboundAt: null },
          select: {
            id: true,
            openId: true,
            unionId: true,
            mpAppId: true,
            bindAt: true
          }
        },
        douyinBindings: {
          where: { unboundAt: null },
          select: {
            id: true,
            openId: true,
            unionId: true,
            mpAppId: true,
            bindAt: true
          }
        }
      }
    })
    if (!user) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '用户不存在')
    }
    return user
  }
}
