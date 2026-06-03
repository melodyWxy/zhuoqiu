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
import { RealtimeModule } from './realtime/realtime.module'
import { VenueModule } from './venue/venue.module'
import { UploadModule } from './upload/upload.module'
import { FeedbackModule } from './feedback/feedback.module'
import { GeoModule } from './geo/geo.module'
import { RegionsModule } from './regions/regions.module'

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
    RealtimeModule,
    MatchModule,
    MeModule,
    AdminModule,
    VenueModule,
    UploadModule,
    FeedbackModule,
    GeoModule,
    RegionsModule
  ]
})
export class AppModule {}
