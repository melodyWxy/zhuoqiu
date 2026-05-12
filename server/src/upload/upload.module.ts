import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { VenueModule } from '../venue/venue.module'
import { UploadController } from './upload.controller'
import { OssStsService } from './oss-sts.service'

@Module({
  imports: [AuthModule, VenueModule],
  controllers: [UploadController],
  providers: [OssStsService],
  exports: [OssStsService]
})
export class UploadModule {}
