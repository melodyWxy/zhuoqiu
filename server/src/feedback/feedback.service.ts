import { Injectable, NotFoundException } from '@nestjs/common'
import { Prisma, FeedbackType, FeedbackStatus } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { genId } from '../common/utils/id'

const USER_SELECT = {
  id: true,
  nickname: true,
  avatar: true,
  phoneNumber: true
} as const

@Injectable()
export class FeedbackService {
  constructor(private readonly prisma: PrismaService) {}

  async create(args: {
    type: FeedbackType
    content: string
    userId?: string | null
  }) {
    const fb = await this.prisma.feedback.create({
      data: {
        id: genId('fb'),
        userId: args.userId ?? null,
        type: args.type,
        content: args.content
      }
    })
    return { id: fb.id }
  }

  async adminList(args: {
    page: number
    pageSize: number
    type?: FeedbackType
    status?: FeedbackStatus
  }) {
    const where: Prisma.FeedbackWhereInput = {}
    if (args.type) where.type = args.type
    if (args.status) where.status = args.status

    const [items, total] = await this.prisma.$transaction([
      this.prisma.feedback.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (args.page - 1) * args.pageSize,
        take: args.pageSize,
        include: { user: { select: USER_SELECT } }
      }),
      this.prisma.feedback.count({ where })
    ])
    return { items, total, page: args.page, pageSize: args.pageSize }
  }

  async adminGet(id: string) {
    const fb = await this.prisma.feedback.findUnique({
      where: { id },
      include: { user: { select: USER_SELECT } }
    })
    if (!fb) throw new NotFoundException('反馈不存在')
    return fb
  }

  async adminResolve(id: string, adminId: string) {
    const fb = await this.prisma.feedback.findUnique({ where: { id } })
    if (!fb) throw new NotFoundException('反馈不存在')
    if (fb.status === FeedbackStatus.resolved) {
      // 幂等：已是 resolved 直接返回当前状态
      return this.adminGet(id)
    }
    await this.prisma.feedback.update({
      where: { id },
      data: {
        status: FeedbackStatus.resolved,
        resolvedAt: new Date(),
        resolvedBy: adminId
      }
    })
    return this.adminGet(id)
  }
}
