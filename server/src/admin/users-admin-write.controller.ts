import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards
} from '@nestjs/common'
import { Request } from 'express'
import { UserStatus } from '@prisma/client'
import { AdminAuthGuard } from '../auth/admin-auth.guard'
import { CurrentAdmin } from '../auth/current-admin.decorator'
import { AdminJwtPayload } from '../auth/jwt-payload'
import { PrismaService } from '../prisma/prisma.service'
import { AuditService } from '../audit/audit.service'
import { BanUserDto, UnbanUserDto } from './dto/admin-write.dto'
import { BusinessException, ErrorCode } from '../common/exceptions/business.exception'

function getIp(req: Request): string {
  const fwd = req.headers['x-forwarded-for']
  if (typeof fwd === 'string' && fwd.length > 0) return fwd.split(',')[0]!.trim()
  return req.socket.remoteAddress ?? ''
}

@Controller('admin/users')
@UseGuards(AdminAuthGuard)
export class UsersAdminWriteController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  @Post(':id/ban')
  @HttpCode(HttpStatus.OK)
  async ban(
    @Param('id') id: string,
    @Body() dto: BanUserDto,
    @CurrentAdmin() admin: AdminJwtPayload,
    @Req() req: Request
  ) {
    const user = await this.prisma.user.findUnique({ where: { id } })
    if (!user) throw new BusinessException(ErrorCode.BAD_REQUEST, '用户不存在')

    const banUntil =
      dto.durationDays === 0
        ? null // 永久
        : new Date(Date.now() + dto.durationDays * 86400_000)

    await this.prisma.user.update({
      where: { id },
      data: {
        status: UserStatus.banned,
        banUntil,
        banReason: dto.reason
      }
    })
    await this.audit.log({
      adminId: admin.sub,
      action: 'user.ban',
      targetType: 'user',
      targetId: id,
      detail: {
        durationDays: dto.durationDays,
        banUntil: banUntil?.toISOString() ?? 'permanent',
        reason: dto.reason
      },
      ip: getIp(req),
      userAgent: req.headers['user-agent'] as string
    })
    return { ok: true, banUntil }
  }

  @Post(':id/unban')
  @HttpCode(HttpStatus.OK)
  async unban(
    @Param('id') id: string,
    @Body() dto: UnbanUserDto,
    @CurrentAdmin() admin: AdminJwtPayload,
    @Req() req: Request
  ) {
    const user = await this.prisma.user.findUnique({ where: { id } })
    if (!user) throw new BusinessException(ErrorCode.BAD_REQUEST, '用户不存在')

    await this.prisma.user.update({
      where: { id },
      data: { status: UserStatus.active, banUntil: null, banReason: null }
    })
    await this.audit.log({
      adminId: admin.sub,
      action: 'user.unban',
      targetType: 'user',
      targetId: id,
      detail: { reason: dto.reason ?? '' },
      ip: getIp(req),
      userAgent: req.headers['user-agent'] as string
    })
    return { ok: true }
  }
}
