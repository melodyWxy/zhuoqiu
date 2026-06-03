import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards
} from '@nestjs/common'
import { PhoneCodePurpose } from '@prisma/client'
import { AuthService } from '../auth/auth.service'
import { SmsService } from '../auth/sms.service'
import {
  VenueRefreshTokenDto,
  VenueSendSmsDto,
  VenueVerifySmsDto
} from './dto/venue-auth.dto'
import { VenueService } from './venue.service'
import { VenueAuthGuard } from './venue-auth.guard'
import { CurrentVenueAccount } from './current-venue-account.decorator'
import { VenueAccountJwtPayload } from '../auth/jwt-payload'

/**
 * 商家账号认证入口（v2.10）。
 * 两种登入端：
 *   - admin 后台：`client: 'admin_web'` → 完整权限
 *   - C 端：    `client: 'c_app'`    → 只读视角，写入接口会被 RequireClient 拒绝
 */
@Controller('venue-auth')
export class VenueAuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly smsService: SmsService,
    private readonly venueService: VenueService
  ) {}

  @Post('sms/send')
  @HttpCode(HttpStatus.OK)
  async sendSms(@Body() dto: VenueSendSmsDto) {
    await this.smsService.sendCode(dto.phoneNumber, PhoneCodePurpose.venue_login)
    const devCode = process.env.DEV_FIXED_SMS_CODE
    return {
      sentAt: new Date().toISOString(),
      expiresInSec: 300,
      devHint: devCode ? `本地开发模式：验证码固定为 ${devCode}` : null
    }
  }

  @Post('sms/verify')
  @HttpCode(HttpStatus.OK)
  async verifySms(@Body() dto: VenueVerifySmsDto) {
    await this.smsService.verifyCode(
      dto.phoneNumber,
      dto.code,
      PhoneCodePurpose.venue_login
    )
    const account = await this.venueService.upsertByPhoneLogin(
      dto.phoneNumber,
      dto.nickname
    )
    const tokens = this.authService.issueVenueAccountTokens(account, dto.client)
    return {
      ...tokens,
      account: this.projectAccount(account),
      client: dto.client
    }
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: VenueRefreshTokenDto) {
    return this.authService.refreshVenueAccountAccessToken(dto.refreshToken)
  }

  @Post('logout')
  @UseGuards(VenueAuthGuard)
  @HttpCode(HttpStatus.OK)
  async logout() {
    return { ok: true }
  }

  @Get('me')
  @UseGuards(VenueAuthGuard)
  async me(@CurrentVenueAccount() jwt: VenueAccountJwtPayload) {
    const acc = await this.venueService.getAccountWithVenue(jwt.sub)
    if (!acc) return { account: null, venue: null }
    const venue = acc.ownedVenue ?? acc.venue
    return {
      account: {
        id: acc.id,
        phoneNumber: acc.phoneNumber.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2'),
        nickname: acc.nickname,
        role: acc.role,
        status: acc.status,
        venueId: acc.venueId ?? venue?.id ?? null,
        lastLoginAt: acc.lastLoginAt
      },
      venue: venue
        ? {
            id: venue.id,
            name: venue.name,
            province: venue.province,
            city: venue.city,
            district: venue.district,
            address: venue.address,
            status: venue.status,
            tablesCount: venue.tablesCount
          }
        : null,
      client: jwt.client
    }
  }

  private projectAccount(a: {
    id: string
    phoneNumber: string
    nickname: string
    role: string
    venueId: string | null
  }) {
    return {
      id: a.id,
      phoneNumber: a.phoneNumber.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2'),
      nickname: a.nickname,
      role: a.role,
      venueId: a.venueId
    }
  }
}
