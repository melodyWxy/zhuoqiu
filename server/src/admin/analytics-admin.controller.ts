import { Controller, Get, UseGuards } from '@nestjs/common'
import { AdminAuthGuard } from '../auth/admin-auth.guard'
import { PrismaService } from '../prisma/prisma.service'
import { MatchState } from '@prisma/client'

@Controller('admin/analytics')
@UseGuards(AdminAuthGuard)
export class AnalyticsAdminController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('overview')
  async overview() {
    const now = new Date()
    const todayStart = new Date(now)
    todayStart.setHours(0, 0, 0, 0)
    const yesterdayStart = new Date(todayStart)
    yesterdayStart.setDate(yesterdayStart.getDate() - 1)

    const [
      onlineMatches,
      todayCreatedMatches,
      yesterdayCreatedMatches,
      todayEndedMatches,
      todayNewUsers
    ] = await this.prisma.$transaction([
      this.prisma.match.count({
        where: { state: { in: [MatchState.in_progress, MatchState.paused] } }
      }),
      this.prisma.match.count({ where: { createdAt: { gte: todayStart } } }),
      this.prisma.match.count({
        where: { createdAt: { gte: yesterdayStart, lt: todayStart } }
      }),
      this.prisma.match.count({
        where: { endedAt: { gte: todayStart } }
      }),
      this.prisma.user.count({ where: { createdAt: { gte: todayStart } } })
    ])

    return {
      onlineMatches,
      todayCreatedMatches,
      todayEndedMatches,
      todayNewUsers,
      onlineUsers: 0, // MVP 占位，后续接 WS 在线会话数
      abnormalMatches: 0, // MVP 占位
      compareToYesterday: {
        todayCreatedMatches: todayCreatedMatches - yesterdayCreatedMatches
      }
    }
  }
}
