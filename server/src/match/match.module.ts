import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { UploadModule } from '../upload/upload.module'
import { MatchController } from './match.controller'
import { MatchService } from './match.service'
import { ReplayRendererService } from './replay-renderer.service'
import { ReplayJobService } from './replay-job.service'

@Module({
  imports: [AuthModule, UploadModule],
  controllers: [MatchController],
  providers: [MatchService, ReplayRendererService, ReplayJobService],
  exports: [MatchService, ReplayJobService]
})
export class MatchModule {}
