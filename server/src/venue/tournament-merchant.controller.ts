import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards
} from '@nestjs/common'
import { TournamentService } from './tournament.service'
import { VenueAuthGuard } from './venue-auth.guard'
import { CurrentVenueAccount } from './current-venue-account.decorator'
import { RequireClient } from './require-client.decorator'
import { VenueAccountJwtPayload } from '../auth/jwt-payload'
import {
  CreateTournamentDto,
  TournamentListQueryDto,
  UpdateTournamentDto
} from './dto/tournament.dto'
import { BusinessException, ErrorCode } from '../common/exceptions/business.exception'

/**
 * 商家管理自家赛事。
 * 写入接口要求 client=admin_web；读接口（list/detail/registrations）也允许 c_app 商家视角（只读）。
 */
@Controller('venue/tournaments')
@UseGuards(VenueAuthGuard)
export class TournamentMerchantController {
  constructor(private readonly service: TournamentService) {}

  @Get()
  async list(
    @CurrentVenueAccount() jwt: VenueAccountJwtPayload,
    @Query() q: TournamentListQueryDto
  ) {
    if (!jwt.venueId) {
      throw new BusinessException(
        ErrorCode.VENUE_NOT_FOUND,
        '你还没有绑定球房'
      )
    }
    return this.service.listOwn(jwt.sub, jwt.venueId, q)
  }

  @Post()
  @RequireClient('admin_web')
  @HttpCode(HttpStatus.OK)
  async create(
    @CurrentVenueAccount() jwt: VenueAccountJwtPayload,
    @Body() dto: CreateTournamentDto
  ) {
    if (!jwt.venueId) {
      throw new BusinessException(
        ErrorCode.VENUE_NOT_FOUND,
        '请先完成入驻'
      )
    }
    const t = await this.service.createDraft(jwt.sub, jwt.venueId, dto)
    return { tournament: t }
  }

  @Get(':id')
  async detail(
    @CurrentVenueAccount() jwt: VenueAccountJwtPayload,
    @Param('id') id: string
  ) {
    const t = await this.service.detailForOwner(id, jwt.sub)
    return { tournament: t }
  }

  @Patch(':id')
  @RequireClient('admin_web')
  async update(
    @CurrentVenueAccount() jwt: VenueAccountJwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateTournamentDto
  ) {
    const t = await this.service.update(id, jwt.sub, dto)
    return { tournament: t }
  }

  @Post(':id/publish')
  @RequireClient('admin_web')
  @HttpCode(HttpStatus.OK)
  async publish(
    @CurrentVenueAccount() jwt: VenueAccountJwtPayload,
    @Param('id') id: string
  ) {
    const t = await this.service.publish(id, jwt.sub)
    return { tournament: t }
  }

  @Post(':id/cancel')
  @RequireClient('admin_web')
  @HttpCode(HttpStatus.OK)
  async cancel(
    @CurrentVenueAccount() jwt: VenueAccountJwtPayload,
    @Param('id') id: string
  ) {
    const t = await this.service.cancel(id, jwt.sub)
    return { tournament: t }
  }

  @Post(':id/close-registration')
  @RequireClient('admin_web')
  @HttpCode(HttpStatus.OK)
  async closeReg(
    @CurrentVenueAccount() jwt: VenueAccountJwtPayload,
    @Param('id') id: string
  ) {
    const t = await this.service.closeRegistration(id, jwt.sub)
    return { tournament: t }
  }

  @Post(':id/start')
  @RequireClient('admin_web')
  @HttpCode(HttpStatus.OK)
  async start(
    @CurrentVenueAccount() jwt: VenueAccountJwtPayload,
    @Param('id') id: string
  ) {
    const t = await this.service.startTournament(id, jwt.sub)
    return { tournament: t }
  }

  @Get(':id/bracket')
  async bracket(@Param('id') id: string) {
    return this.service.getBracket(id)
  }

  @Get(':id/registrations')
  async registrations(
    @CurrentVenueAccount() jwt: VenueAccountJwtPayload,
    @Param('id') id: string,
    @Query('showWithdrawn') showWithdrawn?: string
  ) {
    return this.service.registrationsForOwner(
      id,
      jwt.sub,
      showWithdrawn === 'true'
    )
  }

  @Post(':id/registrations/:regId/kick')
  @RequireClient('admin_web')
  @HttpCode(HttpStatus.OK)
  async kick(
    @CurrentVenueAccount() jwt: VenueAccountJwtPayload,
    @Param('id') id: string,
    @Param('regId') regId: string
  ) {
    const r = await this.service.kick(id, jwt.sub, regId)
    return { registration: r }
  }
}
