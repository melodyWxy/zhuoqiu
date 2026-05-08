import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { AuthService } from './auth.service'
import { AdminAuthController } from './admin-auth.controller'
import { AdminAuthGuard } from './admin-auth.guard'

@Module({
  imports: [JwtModule.register({})],
  controllers: [AdminAuthController],
  providers: [AuthService, AdminAuthGuard],
  exports: [AuthService, AdminAuthGuard]
})
export class AuthModule {}
