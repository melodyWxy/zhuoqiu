import { Controller, Get, Query, UseGuards } from '@nestjs/common'
import { IsOptional, IsString } from 'class-validator'
import { AdminAuthGuard } from '../auth/admin-auth.guard'
import { PrismaService } from '../prisma/prisma.service'
import { CurrentAdmin } from '../auth/current-admin.decorator'
import { AdminJwtPayload } from '../auth/jwt-payload'
import { Prisma, AdminRole } from '@prisma/client'
import { PaginationDto, paginationMeta } from '../common/dto/pagination.dto'

class ListAuditQuery extends PaginationDto {
  @IsOptional()
  @IsString()
  actorAdminId?: string

  @IsOptional()
  @IsString()
  action?: string

  @IsOptional()
  @IsString()
  targetId?: string

  @IsOptional()
  @IsString()
  from?: string

  @IsOptional()
  @IsString()
  to?: string
}

@Controller('admin/audit-logs')
@UseGuards(AdminAuthGuard)
export class AuditAdminController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(
    @Query() q: ListAuditQuery,
    @CurrentAdmin() admin: AdminJwtPayload
  ) {
    const where: Prisma.AdminAuditLogWhereInput = {}

    // operator / readonly 只能看自己的日志
    if (admin.role !== AdminRole.super_admin) {
      where.actorAdminId = admin.sub
    } else if (q.actorAdminId) {
      where.actorAdminId = q.actorAdminId
    }

    if (q.action) where.action = q.action
    if (q.targetId) where.targetId = q.targetId
    if (q.from || q.to) {
      where.createdAt = {
        ...(q.from ? { gte: new Date(q.from) } : {}),
        ...(q.to ? { lte: new Date(q.to) } : {})
      }
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.adminAuditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: {
          actor: { select: { id: true, username: true, name: true } }
        }
      }),
      this.prisma.adminAuditLog.count({ where })
    ])
    return paginationMeta(
      items.map((it) => ({
        ...it,
        id: Number(it.id) // BigInt → number（MVP 列表里不会爆 2^53）
      })),
      total,
      q.page,
      q.pageSize
    )
  }
}
