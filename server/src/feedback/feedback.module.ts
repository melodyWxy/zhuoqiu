import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { FeedbackController } from './feedback.controller'
import { FeedbackAdminController } from './feedback-admin.controller'
import { FeedbackService } from './feedback.service'

@Module({
  imports: [AuthModule],
  controllers: [FeedbackController, FeedbackAdminController],
  providers: [FeedbackService]
})
export class FeedbackModule {}
