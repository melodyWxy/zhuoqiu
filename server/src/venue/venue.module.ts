import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { VenueAuthController } from './venue-auth.controller'
import { VenueApplicationController } from './venue-application.controller'
import { VenueApplicationAdminController } from './venue-admin.controller'
import { VenueController } from './venue.controller'
import { VenueService } from './venue.service'
import { VenueApplicationService } from './venue-application.service'
import { VenueAuthGuard } from './venue-auth.guard'

@Module({
  imports: [AuthModule],
  controllers: [
    VenueAuthController,
    VenueApplicationController,
    VenueApplicationAdminController,
    VenueController
  ],
  providers: [VenueService, VenueApplicationService, VenueAuthGuard],
  exports: [VenueService, VenueApplicationService, VenueAuthGuard]
})
export class VenueModule {}
