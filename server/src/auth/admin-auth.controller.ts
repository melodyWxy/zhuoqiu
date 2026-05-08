import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards
} from '@nestjs/common'
import { Request } from 'express'
import { AuthService } from './auth.service'
import { AdminLoginDto, ChangePasswordDto, RefreshTokenDto } from './dto/login.dto'
import { AdminAuthGuard } from './admin-auth.guard'
import { CurrentAdmin } from './current-admin.decorator'
import { AdminJwtPayload } from './jwt-payload'

@Controller('admin/auth')
export class AdminAuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: AdminLoginDto, @Req() req: Request) {
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ??
      req.socket.remoteAddress ??
      ''
    const account = await this.authService.verifyAdminPassword(
      dto.username,
      dto.password,
      ip
    )
    const tokens = this.authService.issueAdminTokens(account)
    return {
      ...tokens,
      account: {
        id: account.id,
        username: account.username,
        name: account.name,
        role: account.role,
        mustChangePassword: account.mustChangePassword
      }
    }
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshAdminAccessToken(dto.refreshToken)
  }

  @Post('logout')
  @UseGuards(AdminAuthGuard)
  @HttpCode(HttpStatus.OK)
  async logout() {
    // MVP：客户端自己丢弃 token；后续可引入服务端吊销表
    return { ok: true }
  }

  @Post('change-password')
  @UseGuards(AdminAuthGuard)
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @CurrentAdmin() admin: AdminJwtPayload,
    @Body() dto: ChangePasswordDto
  ) {
    await this.authService.changeAdminPassword(admin.sub, dto.oldPassword, dto.newPassword)
    return { ok: true }
  }
}
