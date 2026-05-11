import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards
} from '@nestjs/common'
import { TournamentService } from './tournament.service'
import { TournamentListQueryDto, RegisterTournamentDto } from './dto/tournament.dto'
import { UserAuthGuard } from '../auth/user-auth.guard'
import { CurrentUser } from '../auth/current-user.decorator'
import { UserJwtPayload } from '../auth/jwt-payload'
import { PrismaService } from '../prisma/prisma.service'
import { BusinessException, ErrorCode } from '../common/exceptions/business.exception'

/**
 * 公共赛事接口：列表 / 详情 / 报名名单（匿名）；报名 / 取消 / 我报的（需 user token）。
 */
@Controller('tournaments')
export class TournamentPublicController {
  constructor(
    private readonly service: TournamentService,
    private readonly prisma: PrismaService
  ) {}

  @Get()
  async list(@Query() q: TournamentListQueryDto) {
    return this.service.listPublic(q)
  }

  @Get(':id')
  async detail(@Param('id') id: string) {
    return this.service.detailPublic(id)
  }

  @Get(':id/registrations')
  async registrations(@Param('id') id: string) {
    return this.service.registrationsPublic(id)
  }

  @Get(':id/bracket')
  async bracket(@Param('id') id: string) {
    return this.service.getBracket(id)
  }

  @Post(':id/register')
  @UseGuards(UserAuthGuard)
  @HttpCode(HttpStatus.OK)
  async register(
    @Param('id') id: string,
    @CurrentUser() user: UserJwtPayload,
    @Body() dto: RegisterTournamentDto
  ) {
    const u = await this.prisma.user.findUnique({
      where: { id: user.sub },
      select: { id: true, nickname: true, phoneNumber: true }
    })
    if (!u) {
      throw new BusinessException(ErrorCode.UNAUTHORIZED, '用户不存在')
    }
    const reg = await this.service.register(id, u, dto.displayName)
    return { registration: reg }
  }

  @Post(':id/withdraw')
  @UseGuards(UserAuthGuard)
  @HttpCode(HttpStatus.OK)
  async withdraw(
    @Param('id') id: string,
    @CurrentUser() user: UserJwtPayload
  ) {
    const reg = await this.service.withdraw(id, user.sub)
    return { registration: reg }
  }

  @Get(':id/my-registration')
  @UseGuards(UserAuthGuard)
  async myReg(
    @Param('id') id: string,
    @CurrentUser() user: UserJwtPayload
  ) {
    const reg = await this.service.myRegistration(id, user.sub)
    return { registration: reg }
  }
}

@Controller('me/tournaments')
@UseGuards(UserAuthGuard)
export class MyTournamentsController {
  constructor(private readonly service: TournamentService) {}

  @Get()
  async list(@CurrentUser() user: UserJwtPayload) {
    return this.service.myTournaments(user.sub)
  }
}
