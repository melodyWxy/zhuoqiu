import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { VenueAuthController } from './venue-auth.controller'
import { VenueService } from './venue.service'
import { VenueAuthGuard } from './venue-auth.guard'

@Module({
  imports: [AuthModule],
  controllers: [VenueAuthController],
  providers: [VenueService, VenueAuthGuard],
  exports: [VenueService, VenueAuthGuard]
})
export class VenueModule {}
