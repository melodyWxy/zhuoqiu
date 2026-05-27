import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { VenueModule } from '../venue/venue.module'
import { UploadController } from './upload.controller'
import { OssStsService } from './oss-sts.service'
import { OssDirectService } from './oss-direct.service'

@Module({
  imports: [AuthModule, VenueModule],
  controllers: [UploadController],
  providers: [OssStsService, OssDirectService],
  exports: [OssStsService, OssDirectService]
})
export class UploadModule {}
