import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { MatchesAdminController } from './matches-admin.controller'
import { UsersAdminController } from './users-admin.controller'
import { SettingsAdminController } from './settings-admin.controller'
import { AnalyticsAdminController } from './analytics-admin.controller'

@Module({
  imports: [AuthModule],
  controllers: [
    MatchesAdminController,
    UsersAdminController,
    SettingsAdminController,
    AnalyticsAdminController
  ]
})
export class AdminModule {}
