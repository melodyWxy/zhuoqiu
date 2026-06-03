import { Body, Controller, HttpCode, HttpStatus, Param, Post, Req, UseGuards } from '@nestjs/common'
import { Request } from 'express'
import { AdminAuthGuard } from '../auth/admin-auth.guard'
import { CurrentAdmin } from '../auth/current-admin.decorator'
import { AdminJwtPayload } from '../auth/jwt-payload'
import { MatchService } from '../match/match.service'
import { ReplayJobService } from '../match/replay-job.service'
import { AuditService } from '../audit/audit.service'
import { KickPlayerDto, ReasonDto } from './dto/admin-write.dto'

function getIp(req: Request): string {
  const fwd = req.headers['x-forwarded-for']
  if (typeof fwd === 'string' && fwd.length > 0) return fwd.split(',')[0]!.trim()
  return req.socket.remoteAddress ?? ''
}

@Controller('admin/matches')
@UseGuards(AdminAuthGuard)
export class MatchesAdminWriteController {
  constructor(
    private readonly matchService: MatchService,
    private readonly replayJob: ReplayJobService,
    private readonly audit: AuditService
  ) {}

  @Post(':id/force-pause')
  @HttpCode(HttpStatus.OK)
  async forcePause(
    @Param('id') id: string,
    @Body() dto: ReasonDto,
    @CurrentAdmin() admin: AdminJwtPayload,
    @Req() req: Request
  ) {
    await this.matchService.forcePauseByAdmin(id, admin.sub, dto.reason)
    await this.audit.log({
      adminId: admin.sub,
      action: 'match.force_pause',
      targetType: 'match',
      targetId: id,
      detail: { reason: dto.reason },
      ip: getIp(req),
      userAgent: req.headers['user-agent'] as string
    })
    return { ok: true }
  }

  @Post(':id/force-end')
  @HttpCode(HttpStatus.OK)
  async forceEnd(
    @Param('id') id: string,
    @Body() dto: ReasonDto,
    @CurrentAdmin() admin: AdminJwtPayload,
    @Req() req: Request
  ) {
    await this.matchService.forceEndByAdmin(id, admin.sub, dto.reason)
    await this.audit.log({
      adminId: admin.sub,
      action: 'match.force_end',
      targetType: 'match',
      targetId: id,
      detail: { reason: dto.reason },
      ip: getIp(req),
      userAgent: req.headers['user-agent'] as string
    })
    return { ok: true }
  }

  /**
   * v2.22 战报海报：admin 手动重新生成（覆盖 24h 缓存）
   */
  @Post(':id/poster')
  @HttpCode(HttpStatus.OK)
  async regeneratePoster(
    @Param('id') id: string,
    @CurrentAdmin() admin: AdminJwtPayload,
    @Req() req: Request
  ) {
    const r = await this.replayJob.generate(id, { force: true })
    await this.audit.log({
      adminId: admin.sub,
      action: 'match.regenerate_poster',
      targetType: 'match',
      targetId: id,
      detail: { posterUrl: r.posterUrl, status: r.status },
      ip: getIp(req),
      userAgent: req.headers['user-agent'] as string
    })
    return { ok: true, posterUrl: r.posterUrl, status: r.status }
  }

  @Post(':id/kick')
  @HttpCode(HttpStatus.OK)
  async kick(
    @Param('id') id: string,
    @Body() dto: KickPlayerDto,
    @CurrentAdmin() admin: AdminJwtPayload,
    @Req() req: Request
  ) {
    await this.matchService.kickByAdmin(id, dto.userId, admin.sub, dto.reason)
    await this.audit.log({
      adminId: admin.sub,
      action: 'match.kick',
      targetType: 'match',
      targetId: id,
      detail: { kickedUserId: dto.userId, reason: dto.reason },
      ip: getIp(req),
      userAgent: req.headers['user-agent'] as string
    })
    return { ok: true }
  }
}
