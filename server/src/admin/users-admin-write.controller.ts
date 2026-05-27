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
import { AdminRole, PrimarySource, UserStatus } from '@prisma/client'
import { AdminAuthGuard } from '../auth/admin-auth.guard'
import { Roles } from '../auth/roles.decorator'
import { CurrentAdmin } from '../auth/current-admin.decorator'
import { AdminJwtPayload } from '../auth/jwt-payload'
import { PrismaService } from '../prisma/prisma.service'
import { AuditService } from '../audit/audit.service'
import { UsersService } from '../users/users.service'
import { BanUserDto, DeleteUserDto, UnbanUserDto } from './dto/admin-write.dto'
import { BusinessException, ErrorCode } from '../common/exceptions/business.exception'

const SYSTEM_USER_ID = 'u_system'

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

  /**
   * 真删 user：
   *  - cascade：wechat_bindings / douyin_bindings 由 schema 的 onDelete: Cascade 跟进
   *  - 手动：phone_verify_codes（按 phone 绑定，不在 user 上有 FK）/ tournament_registrations
   *  - 历史比赛保留：matches.owner_user_id 必填且无 cascade，转给系统占位用户 u_system；
   *    match_players.user_id / match_events.actor_user_id 是 nullable，置 NULL 匿名化
   *
   * 仅 super_admin 能调；操作不可逆，前端务必做二次确认。
   */
  @Post(':id/delete')
  @Roles(AdminRole.super_admin)
  @HttpCode(HttpStatus.OK)
  async delete(
    @Param('id') id: string,
    @Body() dto: DeleteUserDto,
    @CurrentAdmin() admin: AdminJwtPayload,
    @Req() req: Request
  ) {
    if (id === SYSTEM_USER_ID) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '系统占位账号不可删除')
    }
    const user = await this.prisma.user.findUnique({ where: { id } })
    if (!user) throw new BusinessException(ErrorCode.BAD_REQUEST, '用户不存在')

    // 删之前留快照，便于审计
    const snapshot = {
      nickname: user.nickname,
      phoneNumber: user.phoneNumber,
      primarySource: user.primarySource,
      createdAt: user.createdAt.toISOString()
    }

    await this.prisma.$transaction(async (tx) => {
      // 1. 系统占位账号不存在则建（status=banned 不会被分到任何业务里）
      await tx.user.upsert({
        where: { id: SYSTEM_USER_ID },
        create: {
          id: SYSTEM_USER_ID,
          nickname: '系统',
          avatar: '🤖',
          primarySource: PrimarySource.phone,
          status: UserStatus.banned
        },
        update: {}
      })

      // 2. 同手机号的验证码（不依赖 FK）
      if (user.phoneNumber) {
        await tx.phoneVerifyCode.deleteMany({
          where: { phoneNumber: user.phoneNumber }
        })
      }

      // 3. 赛事报名（避免唯一键冲突）
      await tx.tournamentRegistration.deleteMany({ where: { userId: id } })

      // 4. 历史比赛参与记录匿名化
      await tx.matchPlayer.updateMany({
        where: { userId: id },
        data: { userId: null }
      })
      await tx.matchEvent.updateMany({
        where: { actorUserId: id },
        data: { actorUserId: null }
      })

      // 5. ownerMatches → 系统占位
      await tx.match.updateMany({
        where: { ownerUserId: id },
        data: { ownerUserId: SYSTEM_USER_ID }
      })

      // 6. 真删 user（wechat/douyin bindings cascade）
      await tx.user.delete({ where: { id } })
    })

    await this.audit.log({
      adminId: admin.sub,
      action: 'user.delete',
      targetType: 'user',
      targetId: id,
      detail: { reason: dto.reason, snapshot },
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
