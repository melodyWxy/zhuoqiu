import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common'
import { OptionalUserAuthGuard } from '../auth/optional-user-auth.guard'
import { UserRequest } from '../auth/user-auth.guard'
import { FeedbackService } from './feedback.service'
import { SubmitFeedbackDto } from './dto/submit.dto'

@Controller('feedback')
@UseGuards(OptionalUserAuthGuard)
export class FeedbackController {
  constructor(private readonly service: FeedbackService) {}

  @Post()
  async submit(@Body() body: SubmitFeedbackDto, @Req() req: UserRequest) {
    const userId = req.user?.sub ?? null
    return this.service.create({
      type: body.type,
      content: body.content,
      userId
    })
  }
}
