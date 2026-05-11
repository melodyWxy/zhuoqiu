import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UseGuards
} from '@nestjs/common'
import { Request } from 'express'
import { AdminRole, VenueApplicationStatus } from '@prisma/client'
import { AdminAuthGuard } from '../auth/admin-auth.guard'
import { Roles } from '../auth/roles.decorator'
import { CurrentAdmin } from '../auth/current-admin.decorator'
import { AdminJwtPayload } from '../auth/jwt-payload'
import { PaginationDto } from '../common/dto/pagination.dto'
import { VenueApplicationService } from './venue-application.service'
import { ReviewApplicationDto } from './dto/venue-application.dto'

function getIp(req: Request): string {
  const fwd = req.headers['x-forwarded-for']
  if (typeof fwd === 'string' && fwd.length > 0) return fwd.split(',')[0]!.trim()
  return req.socket.remoteAddress ?? ''
}

@Controller('admin/venue-applications')
@UseGuards(AdminAuthGuard)
export class VenueApplicationAdminController {
  constructor(private readonly service: VenueApplicationService) {}

  @Get()
  @Roles(AdminRole.super_admin, AdminRole.operator, AdminRole.readonly)
  async list(
    @Query() q: PaginationDto,
    @Query('status') status?: VenueApplicationStatus
  ) {
    return this.service.listForAdmin({
      status,
      page: q.page,
      pageSize: q.pageSize
    })
  }

  @Get(':id')
  @Roles(AdminRole.super_admin, AdminRole.operator, AdminRole.readonly)
  async detail(@Param('id') id: string) {
    return this.service.getByIdForAdmin(id)
  }

  @Post(':id/approve')
  @Roles(AdminRole.super_admin, AdminRole.operator)
  @HttpCode(HttpStatus.OK)
  async approve(
    @Param('id') id: string,
    @CurrentAdmin() admin: AdminJwtPayload,
    @Req() req: Request
  ) {
    return this.service.approve(id, admin.sub, {
      ip: getIp(req),
      userAgent: req.headers['user-agent']
    })
  }

  @Post(':id/reject')
  @Roles(AdminRole.super_admin, AdminRole.operator)
  @HttpCode(HttpStatus.OK)
  async reject(
    @Param('id') id: string,
    @Body() dto: ReviewApplicationDto,
    @CurrentAdmin() admin: AdminJwtPayload,
    @Req() req: Request
  ) {
    return this.service.reject(id, admin.sub, dto.rejectReason ?? '', {
      ip: getIp(req),
      userAgent: req.headers['user-agent']
    })
  }
}
