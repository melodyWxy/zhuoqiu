import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common'
import { AdminAuthGuard } from '../auth/admin-auth.guard'
import { Roles } from '../auth/roles.decorator'
import { AdminRole } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { CurrentAdmin } from '../auth/current-admin.decorator'
import { AdminJwtPayload } from '../auth/jwt-payload'

@Controller('admin/settings')
@UseGuards(AdminAuthGuard)
export class SettingsAdminController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async getAll() {
    const rows = await this.prisma.systemSetting.findMany()
    const map: Record<string, unknown> = {}
    for (const r of rows) {
      map[r.key] = r.valueJson
    }
    return map
  }

  @Patch()
  @Roles(AdminRole.super_admin)
  async patch(
    @Body() body: Record<string, unknown>,
    @CurrentAdmin() admin: AdminJwtPayload
  ) {
    const entries = Object.entries(body)
    await this.prisma.$transaction(
      entries.map(([key, value]) =>
        this.prisma.systemSetting.upsert({
          where: { key },
          create: { key, valueJson: value as object, updatedBy: admin.sub },
          update: { valueJson: value as object, updatedBy: admin.sub }
        })
      )
    )
    return { updated: entries.length }
  }
}
