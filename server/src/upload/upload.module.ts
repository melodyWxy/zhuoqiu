import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { VenueModule } from '../venue/venue.module'
import { UploadController } from './upload.controller'

@Module({
  imports: [AuthModule, VenueModule],
  controllers: [UploadController]
})
export class UploadModule {}
