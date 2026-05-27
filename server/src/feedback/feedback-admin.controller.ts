import {
  Controller,
  Get,
  Param,
  Patch,
  Query,
  Req,
  UseGuards
} from '@nestjs/common'
import { Request } from 'express'
import { AdminAuthGuard } from '../auth/admin-auth.guard'
import { CurrentAdmin } from '../auth/current-admin.decorator'
import { AdminJwtPayload } from '../auth/jwt-payload'
import { AuditService } from '../audit/audit.service'
import { FeedbackService } from './feedback.service'
import { AdminListFeedbackDto } from './dto/admin-list.dto'

function getIp(req: Request): string {
  const fwd = req.headers['x-forwarded-for']
  if (typeof fwd === 'string' && fwd.length > 0) return fwd.split(',')[0]!.trim()
  return req.socket.remoteAddress ?? ''
}

@Controller('admin/feedback')
@UseGuards(AdminAuthGuard)
export class FeedbackAdminController {
  constructor(
    private readonly service: FeedbackService,
    private readonly audit: AuditService
  ) {}

  @Get()
  list(@Query() q: AdminListFeedbackDto) {
    return this.service.adminList({
      page: q.page,
      pageSize: q.pageSize,
      type: q.type,
      status: q.status
    })
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.adminGet(id)
  }

  @Patch(':id/resolve')
  async resolve(
    @Param('id') id: string,
    @CurrentAdmin() admin: AdminJwtPayload,
    @Req() req: Request
  ) {
    const fb = await this.service.adminResolve(id, admin.sub)
    await this.audit.log({
      adminId: admin.sub,
      action: 'feedback.resolve',
      targetType: 'feedback',
      targetId: id,
      ip: getIp(req),
      userAgent: req.headers['user-agent'] as string
    })
    return fb
  }
}
