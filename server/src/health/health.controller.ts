import { Controller, Get } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check() {
    let dbOk = false
    try {
      await this.prisma.$queryRaw`SELECT 1`
      dbOk = true
    } catch {
      dbOk = false
    }
    return {
      status: dbOk ? 'ok' : 'degraded',
      uptimeSec: Math.round(process.uptime()),
      db: dbOk ? 'up' : 'down',
      serverTime: new Date().toISOString()
    }
  }
}
