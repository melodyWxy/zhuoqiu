import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards
} from '@nestjs/common'
import { VenueApplicationSource } from '@prisma/client'
import { VenueAuthGuard } from './venue-auth.guard'
import { CurrentVenueAccount } from './current-venue-account.decorator'
import { VenueAccountJwtPayload } from '../auth/jwt-payload'
import { VenueApplicationService } from './venue-application.service'
import { SubmitApplicationDto } from './dto/venue-application.dto'

/**
 * 商家侧入驻申请接口。
 * 不加 @RequireClient —— admin_web 和 c_app 都能提交申请。
 */
@Controller('venue/applications')
@UseGuards(VenueAuthGuard)
export class VenueApplicationController {
  constructor(private readonly service: VenueApplicationService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async submit(
    @CurrentVenueAccount() jwt: VenueAccountJwtPayload,
    @Body() dto: SubmitApplicationDto
  ) {
    const source =
      jwt.client === 'c_app'
        ? VenueApplicationSource.c_app
        : VenueApplicationSource.admin_web
    const app = await this.service.submit(jwt.sub, dto, source)
    return { application: app }
  }

  @Get('mine')
  async getMine(@CurrentVenueAccount() jwt: VenueAccountJwtPayload) {
    const app = await this.service.getMine(jwt.sub)
    return { application: app }
  }
}
