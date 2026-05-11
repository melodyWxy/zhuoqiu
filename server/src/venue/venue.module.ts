import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { VenueAuthController } from './venue-auth.controller'
import { VenueApplicationController } from './venue-application.controller'
import { VenueApplicationAdminController } from './venue-admin.controller'
import { VenueController } from './venue.controller'
import { VenueService } from './venue.service'
import { VenueApplicationService } from './venue-application.service'
import { VenueAuthGuard } from './venue-auth.guard'
import { TournamentService } from './tournament.service'
import { TournamentMerchantController } from './tournament-merchant.controller'
import {
  TournamentPublicController,
  MyTournamentsController
} from './tournament-public.controller'

@Module({
  imports: [AuthModule],
  controllers: [
    VenueAuthController,
    VenueApplicationController,
    VenueApplicationAdminController,
    VenueController,
    TournamentMerchantController,
    TournamentPublicController,
    MyTournamentsController
  ],
  providers: [
    VenueService,
    VenueApplicationService,
    VenueAuthGuard,
    TournamentService
  ],
  exports: [VenueService, VenueApplicationService, TournamentService, VenueAuthGuard]
})
export class VenueModule {}
