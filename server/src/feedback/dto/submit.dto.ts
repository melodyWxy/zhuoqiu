import { IsEnum, IsString, Length } from 'class-validator'
import { FeedbackType } from '@prisma/client'

export class SubmitFeedbackDto {
  @IsEnum(FeedbackType)
  type!: FeedbackType

  @IsString()
  @Length(1, 500)
  content!: string
}
