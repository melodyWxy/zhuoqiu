import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { VenueAuthController } from './venue-auth.controller'
import { VenueApplicationController } from './venue-application.controller'
import { VenueApplicationAdminController } from './venue-admin.controller'
import { VenueService } from './venue.service'
import { VenueApplicationService } from './venue-application.service'
import { VenueAuthGuard } from './venue-auth.guard'

@Module({
  imports: [AuthModule],
  controllers: [
    VenueAuthController,
    VenueApplicationController,
    VenueApplicationAdminController
  ],
  providers: [VenueService, VenueApplicationService, VenueAuthGuard],
  exports: [VenueService, VenueApplicationService, VenueAuthGuard]
})
export class VenueModule {}
