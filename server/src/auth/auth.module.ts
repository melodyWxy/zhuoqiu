import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { AuthService } from './auth.service'
import { AdminAuthController } from './admin-auth.controller'
import { UserAuthController } from './user-auth.controller'
import { AdminAuthGuard } from './admin-auth.guard'
import { UserAuthGuard } from './user-auth.guard'
import { SmsService } from './sms.service'
import { WechatService } from './wechat.service'

@Module({
  imports: [JwtModule.register({})],
  controllers: [AdminAuthController, UserAuthController],
  providers: [AuthService, AdminAuthGuard, UserAuthGuard, SmsService, WechatService],
  exports: [AuthService, AdminAuthGuard, UserAuthGuard, SmsService, WechatService]
})
export class AuthModule {}
