import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { MatchModule } from '../match/match.module'
import { MatchesAdminController } from './matches-admin.controller'
import { MatchesAdminWriteController } from './matches-admin-write.controller'
import { UsersAdminController } from './users-admin.controller'
import { UsersAdminWriteController } from './users-admin-write.controller'
import { SettingsAdminController } from './settings-admin.controller'
import { AnalyticsAdminController } from './analytics-admin.controller'
import { AuditAdminController } from './audit-admin.controller'

@Module({
  imports: [AuthModule, MatchModule],
  controllers: [
    MatchesAdminController,
    MatchesAdminWriteController,
    UsersAdminController,
    UsersAdminWriteController,
    SettingsAdminController,
    AnalyticsAdminController,
    AuditAdminController
  ]
})
export class AdminModule {}
