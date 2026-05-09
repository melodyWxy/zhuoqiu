import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Post, UseGuards } from '@nestjs/common'
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches
} from 'class-validator'
import { UserAuthGuard } from '../auth/user-auth.guard'
import { CurrentUser } from '../auth/current-user.decorator'
import { UserJwtPayload } from '../auth/jwt-payload'
import { UsersService } from '../users/users.service'
import { SmsService } from '../auth/sms.service'
import { BusinessException, ErrorCode } from '../common/exceptions/business.exception'
import { PhoneCodePurpose } from '@prisma/client'

class UpdateMeDto {
  @IsOptional()
  @IsString()
  @Length(1, 32)
  nickname?: string

  @IsOptional()
  @IsString()
  @Length(1, 32)
  avatar?: string
}

class BindPhoneDto {
  @IsString()
  @Matches(/^\+?\d{8,15}$/)
  phoneNumber!: string

  @IsString()
  @Length(6, 6)
  code!: string
}

class UnbindPhoneDto {
  @IsString()
  @Length(6, 6)
  code!: string
}

class MergeAccountsDto {
  @IsString()
  @Matches(/^\+?\d{8,15}$/)
  phoneNumber!: string

  @IsString()
  @Length(6, 6)
  code!: string

  @IsEnum(['keep_current', 'keep_other'])
  strategy!: 'keep_current' | 'keep_other'
}

@Controller('me')
@UseGuards(UserAuthGuard)
export class MeController {
  constructor(
    private readonly usersService: UsersService,
    private readonly smsService: SmsService
  ) {}

  @Get()
  async me(@CurrentUser() user: UserJwtPayload) {
    const u = await this.usersService.getPublic(user.sub)
    if (!u) {
      throw new BusinessException(ErrorCode.UNAUTHORIZED, '用户不存在')
    }
    return {
      id: u.id,
      nickname: u.nickname,
      avatar: u.avatar,
      phoneNumber: u.phoneNumber
        ? u.phoneNumber.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2')
        : null,
      primarySource: u.primarySource,
      wechatBinding: u.wechatBindings[0] ?? null,
      douyinBinding: u.douyinBindings[0] ?? null,
      createdAt: u.createdAt,
      lastActiveAt: u.lastActiveAt
    }
  }

  @Patch()
  async update(
    @CurrentUser() user: UserJwtPayload,
    @Body() dto: UpdateMeDto
  ) {
    const updated = await this.usersService.updateProfile(user.sub, dto)
    return {
      id: updated.id,
      nickname: updated.nickname,
      avatar: updated.avatar
    }
  }

  @Post('bind-phone')
  @HttpCode(HttpStatus.OK)
  async bindPhone(
    @CurrentUser() user: UserJwtPayload,
    @Body() dto: BindPhoneDto
  ) {
    await this.smsService.verifyCode(
      dto.phoneNumber,
      dto.code,
      PhoneCodePurpose.bind
    )
    try {
      const r = await this.usersService.bindPhone(user.sub, dto.phoneNumber)
      if (r.conflictUserId) {
        // 手机号属于另一账号 → 返回冲突提示，客户端走合并流程
        return {
          bound: false,
          conflictUserId: r.conflictUserId,
          hint: '该手机号已被另一个账号使用，是否合并？'
        }
      }
      return { bound: true }
    } catch (e) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        (e as Error).message ?? '绑定失败'
      )
    }
  }

  @Post('unbind-phone')
  @HttpCode(HttpStatus.OK)
  async unbindPhone(
    @CurrentUser() user: UserJwtPayload,
    @Body() dto: UnbindPhoneDto
  ) {
    const u = await this.usersService.getById(user.sub)
    if (!u?.phoneNumber) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '未绑定手机号')
    }
    await this.smsService.verifyCode(
      u.phoneNumber,
      dto.code,
      PhoneCodePurpose.bind
    )
    try {
      await this.usersService.unbindPhone(user.sub)
      return { ok: true }
    } catch (e) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        (e as Error).message ?? '解绑失败'
      )
    }
  }

  @Post('merge-accounts')
  @HttpCode(HttpStatus.OK)
  async merge(
    @CurrentUser() user: UserJwtPayload,
    @Body() dto: MergeAccountsDto
  ) {
    await this.smsService.verifyCode(
      dto.phoneNumber,
      dto.code,
      PhoneCodePurpose.merge
    )
    // 找到手机号对应的另一个账号
    const me = await this.usersService.getById(user.sub)
    if (!me) throw new BusinessException(ErrorCode.UNAUTHORIZED, '账号不存在')

    // 若当前账号手机号恰好等于要合并的手机号 → 已经是同一账号
    if (me.phoneNumber === dto.phoneNumber) {
      return { merged: false, reason: '当前账号已绑定该手机号' }
    }

    // 要合并的另一账号
    const theOther = await this.usersService['prisma'].user.findUnique({
      where: { phoneNumber: dto.phoneNumber }
    })
    if (!theOther) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '目标手机号未注册，无需合并'
      )
    }
    if (theOther.id === user.sub) {
      return { merged: false, reason: '目标账号就是当前账号' }
    }

    const [primaryId, secondaryId] =
      dto.strategy === 'keep_current'
        ? [user.sub, theOther.id]
        : [theOther.id, user.sub]

    try {
      await this.usersService.mergeUsers(primaryId, secondaryId)
    } catch (e) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        (e as Error).message ?? '合并失败'
      )
    }
    return { merged: true, primaryUserId: primaryId, secondaryUserId: secondaryId }
  }
}
