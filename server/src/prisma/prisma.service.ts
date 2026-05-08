import { Injectable, OnModuleDestroy, OnModuleInit, Logger } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name)

  async onModuleInit() {
    await this.$connect()
    this.logger.log('PostgreSQL 已连接')
  }

  async onModuleDestroy() {
    await this.$disconnect()
  }
}
