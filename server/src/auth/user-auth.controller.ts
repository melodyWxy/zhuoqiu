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
import { WechatService } from './wechat.service'
import { UsersService } from '../users/users.service'
import { UserAuthGuard } from './user-auth.guard'
import { CurrentUser } from './current-user.decorator'
import { UserJwtPayload } from './jwt-payload'
import {
  DouyinLoginDto,
  SendSmsDto,
  VerifySmsDto,
  WechatLoginDto,
  WechatPhoneDto
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
    private readonly smsService: SmsService,
    private readonly wechatService: WechatService
  ) {}

  @Post('wechat')
  @HttpCode(HttpStatus.OK)
  async wechatLogin(@Body() dto: WechatLoginDto) {
    const session = await this.wechatService.code2Session(dto.code)
    const user = await this.usersService.upsertByWechat({
      mpAppId: dto.appId ?? 'dev-wxmp',
      openId: session.openId,
      unionId: session.unionId
    })
    const tokens = this.authService.issueUserTokens(user)
    return { ...tokens, user: this.projectUser(user) }
  }

  /**
   * 微信登录后由 <Button open-type="getPhoneNumber"> 触发；用户已登录态。
   * 服务端拿 code → wx getuserphonenumber → bindPhone。
   * 若手机号已被另一账号占用，抛 LOGIN_FAILED；前端引导用户走"我"页面的 BindPhoneSheet 合并流程。
   */
  @Post('wechat/phone')
  @UseGuards(UserAuthGuard)
  @HttpCode(HttpStatus.OK)
  async wechatBindPhone(
    @CurrentUser() current: UserJwtPayload,
    @Body() dto: WechatPhoneDto
  ) {
    const info = await this.wechatService.getPhoneNumber(dto.code)
    // info.phoneNumber 形如 +8613800138000；存库统一保留 +8 国际格式
    const phone = info.phoneNumber.startsWith('+')
      ? info.phoneNumber
      : `+${info.countryCode}${info.purePhoneNumber}`
    const r = await this.usersService.bindPhone(current.sub, phone)
    if (!r.user || r.conflictUserId) {
      throw new BusinessException(
        ErrorCode.LOGIN_FAILED,
        '该手机号已属另一账号，请到「我」页面进行账号合并'
      )
    }
    return { user: this.projectUser(r.user) }
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
