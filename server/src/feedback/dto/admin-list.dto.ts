import { IsEnum, IsOptional } from 'class-validator'
import { FeedbackType, FeedbackStatus } from '@prisma/client'
import { PaginationDto } from '../../common/dto/pagination.dto'

export class AdminListFeedbackDto extends PaginationDto {
  @IsOptional()
  @IsEnum(FeedbackType)
  type?: FeedbackType

  @IsOptional()
  @IsEnum(FeedbackStatus)
  status?: FeedbackStatus
}
