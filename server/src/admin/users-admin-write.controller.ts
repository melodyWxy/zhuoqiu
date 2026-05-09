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
import { IsNotEmpty, IsString, Length } from 'class-validator'
import { Request } from 'express'
import { AdminRole, UserStatus } from '@prisma/client'
import { AdminAuthGuard } from '../auth/admin-auth.guard'
import { Roles } from '../auth/roles.decorator'
import { CurrentAdmin } from '../auth/current-admin.decorator'
import { AdminJwtPayload } from '../auth/jwt-payload'
import { PrismaService } from '../prisma/prisma.service'
import { AuditService } from '../audit/audit.service'
import { UsersService } from '../users/users.service'
import { BanUserDto, UnbanUserDto } from './dto/admin-write.dto'
import { BusinessException, ErrorCode } from '../common/exceptions/business.exception'

class MergeUsersDto {
  @IsString() @IsNotEmpty()
  primaryUserId!: string

  @IsString() @IsNotEmpty()
  secondaryUserId!: string

  @IsString() @IsNotEmpty() @Length(1, 255)
  reason!: string
}

class UnbindBindingDto {
  @IsString() @IsNotEmpty()
  bindingId!: string

  @IsString() @IsNotEmpty() @Length(1, 255)
  reason!: string
}

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
    private readonly audit: AuditService,
    private readonly usersService: UsersService
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

  @Post(':id/unbind-wechat')
  @HttpCode(HttpStatus.OK)
  async unbindWechat(
    @Param('id') id: string,
    @Body() dto: UnbindBindingDto,
    @CurrentAdmin() admin: AdminJwtPayload,
    @Req() req: Request
  ) {
    const binding = await this.prisma.wechatBinding.findUnique({
      where: { id: dto.bindingId }
    })
    if (!binding || binding.userId !== id) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '绑定不存在')
    }
    await this.usersService.unbindWechatById(dto.bindingId)
    await this.audit.log({
      adminId: admin.sub,
      action: 'user.unbind_wechat',
      targetType: 'user',
      targetId: id,
      detail: { bindingId: dto.bindingId, reason: dto.reason },
      ip: getIp(req),
      userAgent: req.headers['user-agent'] as string
    })
    return { ok: true }
  }

  @Post(':id/unbind-douyin')
  @HttpCode(HttpStatus.OK)
  async unbindDouyin(
    @Param('id') id: string,
    @Body() dto: UnbindBindingDto,
    @CurrentAdmin() admin: AdminJwtPayload,
    @Req() req: Request
  ) {
    const binding = await this.prisma.douyinBinding.findUnique({
      where: { id: dto.bindingId }
    })
    if (!binding || binding.userId !== id) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '绑定不存在')
    }
    await this.usersService.unbindDouyinById(dto.bindingId)
    await this.audit.log({
      adminId: admin.sub,
      action: 'user.unbind_douyin',
      targetType: 'user',
      targetId: id,
      detail: { bindingId: dto.bindingId, reason: dto.reason },
      ip: getIp(req),
      userAgent: req.headers['user-agent'] as string
    })
    return { ok: true }
  }
}

// 独立控制器，避免 /admin/users/:id 吃掉 merge 路径
@Controller('admin/user-merge')
@UseGuards(AdminAuthGuard)
export class UsersMergeController {
  constructor(
    private readonly usersService: UsersService,
    private readonly audit: AuditService,
    private readonly prisma: PrismaService
  ) {}

  @Post()
  @Roles(AdminRole.super_admin)
  @HttpCode(HttpStatus.OK)
  async merge(
    @Body() dto: MergeUsersDto,
    @CurrentAdmin() admin: AdminJwtPayload,
    @Req() req: Request
  ) {
    // 快照 secondary 用于审计
    const [primary, secondary] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: dto.primaryUserId } }),
      this.prisma.user.findUnique({ where: { id: dto.secondaryUserId } })
    ])
    if (!primary || !secondary) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '账号不存在')
    }
    try {
      await this.usersService.mergeUsers(dto.primaryUserId, dto.secondaryUserId)
    } catch (e) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        (e as Error).message ?? '合并失败'
      )
    }
    await this.audit.log({
      adminId: admin.sub,
      action: 'user.merge',
      targetType: 'user',
      targetId: dto.primaryUserId,
      detail: {
        primaryUserId: dto.primaryUserId,
        secondaryUserId: dto.secondaryUserId,
        reason: dto.reason
      },
      ip: getIp(req),
      userAgent: req.headers['user-agent'] as string
    })
    return { ok: true }
  }
}
