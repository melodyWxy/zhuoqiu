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
import { BracketService } from './bracket.service'
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
    TournamentService,
    BracketService
  ],
  exports: [
    VenueService,
    VenueApplicationService,
    TournamentService,
    BracketService,
    VenueAuthGuard
  ]
})
export class VenueModule {}
