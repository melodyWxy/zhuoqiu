import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import configuration from './config/configuration'
import { PrismaModule } from './prisma/prisma.module'
import { HealthModule } from './health/health.module'
import { AuthModule } from './auth/auth.module'
import { AdminModule } from './admin/admin.module'
import { UsersModule } from './users/users.module'
import { MeModule } from './me/me.module'
import { MatchModule } from './match/match.module'
import { AuditModule } from './audit/audit.module'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration]
    }),
    PrismaModule,
    UsersModule,
    AuditModule,
    HealthModule,
    AuthModule,
    MatchModule,
    MeModule,
    AdminModule
  ]
})
export class AppModule {}
