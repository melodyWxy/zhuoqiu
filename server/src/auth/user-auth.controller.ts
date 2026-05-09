import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards
} from '@nestjs/common'
import { PhoneCodePurpose } from '@prisma/client'
import { AuthService } from './auth.service'
import { SmsService } from './sms.service'
import { UsersService } from '../users/users.service'
import { UserAuthGuard } from './user-auth.guard'
import {
  DouyinLoginDto,
  SendSmsDto,
  VerifySmsDto,
  WechatLoginDto
} from './dto/client-login.dto'
import { RefreshTokenDto } from './dto/login.dto'
import { BusinessException, ErrorCode } from '../common/exceptions/business.exception'

/**
 * C 端 auth：微信 / 抖音 / 手机号。MVP 阶段微信抖音 mock（不真正换 openId）。
 */
@Controller('auth')
export class UserAuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
    private readonly smsService: SmsService
  ) {}

  @Post('wechat')
  @HttpCode(HttpStatus.OK)
  async wechatLogin(@Body() dto: WechatLoginDto) {
    // MVP mock：把 code 当成伪 openId；生产接入 wx code2session
    const appId = dto.appId ?? 'dev-wxmp'
    const openId = `mock_wx_${dto.code.slice(0, 32)}`
    const user = await this.usersService.upsertByWechat({
      mpAppId: appId,
      openId
    })
    const tokens = this.authService.issueUserTokens(user)
    return { ...tokens, user: this.projectUser(user) }
  }

  @Post('douyin')
  @HttpCode(HttpStatus.OK)
  async douyinLogin(@Body() dto: DouyinLoginDto) {
    const appId = dto.appId ?? 'dev-dymp'
    const openId = `mock_dy_${dto.code.slice(0, 32)}`
    const user = await this.usersService.upsertByDouyin({
      mpAppId: appId,
      openId
    })
    const tokens = this.authService.issueUserTokens(user)
    return { ...tokens, user: this.projectUser(user) }
  }

  @Post('phone/send-sms')
  @HttpCode(HttpStatus.OK)
  async sendSms(@Body() dto: SendSmsDto) {
    await this.smsService.sendCode(dto.phoneNumber, dto.purpose)
    const devCode = process.env.DEV_FIXED_SMS_CODE
    return {
      sentAt: new Date().toISOString(),
      expiresInSec: 300,
      devHint: devCode ? `本地开发模式：验证码固定为 ${devCode}` : null
    }
  }

  @Post('phone/verify')
  @HttpCode(HttpStatus.OK)
  async verifyPhone(@Body() dto: VerifySmsDto) {
    await this.smsService.verifyCode(dto.phoneNumber, dto.code, dto.purpose)
    if (dto.purpose !== PhoneCodePurpose.login) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '此接口仅用于登录，绑定/合并请走 /me 下对应接口'
      )
    }
    const user = await this.usersService.upsertByPhone(dto.phoneNumber)
    const tokens = this.authService.issueUserTokens(user)
    return { ...tokens, user: this.projectUser(user) }
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshUserAccessToken(dto.refreshToken)
  }

  @Post('logout')
  @UseGuards(UserAuthGuard)
  @HttpCode(HttpStatus.OK)
  async logout() {
    return { ok: true }
  }

  private projectUser(user: {
    id: string
    nickname: string
    avatar: string
    phoneNumber: string | null
  }) {
    return {
      id: user.id,
      nickname: user.nickname,
      avatar: user.avatar,
      phoneNumber: user.phoneNumber
        ? user.phoneNumber.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2')
        : null
    }
  }
}
