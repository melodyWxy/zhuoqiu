import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards
} from '@nestjs/common'
import { UserAuthGuard } from '../auth/user-auth.guard'
import { CurrentUser } from '../auth/current-user.decorator'
import { UserJwtPayload } from '../auth/jwt-payload'
import { MatchService } from './match.service'
import {
  CreateMatchDto,
  EndMatchDto,
  JoinMatchDto,
  MatchEventDto,
  SeatActionDto
} from './dto/match.dto'
import { MatchEventPayload } from './state-machine/types'
import { PaginationDto, paginationMeta } from '../common/dto/pagination.dto'
import { BusinessException, ErrorCode } from '../common/exceptions/business.exception'

@Controller()
export class MatchController {
  constructor(private readonly matchService: MatchService) {}

  @Post('matches')
  @UseGuards(UserAuthGuard)
  async create(
    @CurrentUser() user: UserJwtPayload,
    @Body() dto: CreateMatchDto
  ) {
    const detail = await this.matchService.create({
      ownerUserId: user.sub,
      type: dto.type,
      rules: dto.rules ?? {},
      playerSlots: dto.playerSlots.map((s) => ({
        slot: s.slot,
        name: s.name ?? '',
        claim: !!s.claim
      }))
    })
    return detail
  }

  @Post('matches/join')
  @UseGuards(UserAuthGuard)
  async join(
    @CurrentUser() user: UserJwtPayload,
    @Body() dto: JoinMatchDto
  ) {
    return this.matchService.joinByCode(
      dto.code,
      user.sub,
      dto.slot,
      dto.displayName
    )
  }

  @Get('matches/:idOrCode')
  async detail(@Param('idOrCode') idOrCode: string) {
    return this.matchService.detail(idOrCode)
  }

  /**
   * 战报数据：detail + 叙事文案 + 海报状态。
   * 公开接口（matchId 是长哈希不易猜，分享给陌生人能打开是基本诉求）
   */
  @Get('matches/:idOrCode/replay')
  async replay(@Param('idOrCode') idOrCode: string) {
    return this.matchService.replay(idOrCode)
  }

  @Get('matches/:id/events')
  async events(@Param('id') id: string) {
    return this.matchService.listEvents(id)
  }

  @Post('matches/:id/seat')
  @UseGuards(UserAuthGuard)
  async seat(
    @CurrentUser() user: UserJwtPayload,
    @Param('id') id: string,
    @Body() dto: SeatActionDto
  ) {
    if (dto.action === 'occupy') {
      if (!dto.slot) {
        throw new BusinessException(ErrorCode.BAD_REQUEST, '占位必须带 slot')
      }
      await this.matchService.occupySlot(id, user.sub, dto.slot, dto.displayName)
    } else if (dto.action === 'leave') {
      await this.matchService.leaveSlot(id, user.sub)
    } else {
      throw new BusinessException(ErrorCode.BAD_REQUEST, 'action 必须是 occupy / leave')
    }
    return this.matchService.detail(id)
  }

  @Post('matches/:id/events')
  @UseGuards(UserAuthGuard)
  async appendEvent(
    @CurrentUser() user: UserJwtPayload,
    @Param('id') id: string,
    @Body() dto: MatchEventDto
  ) {
    const payload = { type: dto.type, ...(dto.payload ?? {}) } as MatchEventPayload
    const r = await this.matchService.appendEvent(
      id,
      { userId: user.sub },
      payload,
      dto.clientSeq
    )
    const detail = await this.matchService.detail(id)
    return { ...r, matchState: detail }
  }

  @Post('matches/:id/events/undo')
  @UseGuards(UserAuthGuard)
  async undo(
    @CurrentUser() user: UserJwtPayload,
    @Param('id') id: string
  ) {
    const r = await this.matchService.undoLast(id, user.sub)
    if (!r) return { serverSeq: null, undoneEventId: null }
    const detail = await this.matchService.detail(id)
    return {
      serverSeq: r.serverSeq,
      undoneEventId: Number(r.undoneEventId),
      matchState: detail
    }
  }

  @Post('matches/:id/end')
  @UseGuards(UserAuthGuard)
  async end(
    @CurrentUser() user: UserJwtPayload,
    @Param('id') id: string,
    @Body() dto: EndMatchDto
  ) {
    await this.matchService.endByOwner(id, user.sub, dto.reason)
    return this.matchService.detail(id)
  }

  @Get('me/matches')
  @UseGuards(UserAuthGuard)
  async myMatches(
    @CurrentUser() user: UserJwtPayload,
    @Query() q: PaginationDto
  ) {
    const r = await this.matchService.listMyMatches(user.sub, q.page, q.pageSize)
    return paginationMeta(r.items, r.total, r.page, r.pageSize)
  }

  @Get('me/active-match')
  @UseGuards(UserAuthGuard)
  async myActiveMatch(@CurrentUser() user: UserJwtPayload) {
    const match = await this.matchService.findMyActiveMatch(user.sub)
    return { match }
  }
}
