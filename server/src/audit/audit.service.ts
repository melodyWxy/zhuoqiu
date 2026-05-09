import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(args: {
    adminId: string
    action: string
    targetType?: string
    targetId?: string
    detail?: Record<string, unknown>
    ip: string
    userAgent?: string
  }): Promise<void> {
    await this.prisma.adminAuditLog.create({
      data: {
        actorAdminId: args.adminId,
        action: args.action,
        targetType: args.targetType ?? null,
        targetId: args.targetId ?? null,
        detailJson: (args.detail ?? {}) as unknown as Prisma.InputJsonValue,
        ip: args.ip,
        userAgent: args.userAgent ?? null
      }
    })
  }
}
