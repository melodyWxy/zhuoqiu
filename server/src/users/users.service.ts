import { Injectable } from '@nestjs/common'
import { PrimarySource, Prisma, User, UserStatus } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { genId } from '../common/utils/id'

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getById(userId: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id: userId } })
  }

  async getPublic(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        wechatBindings: {
          where: { unboundAt: null },
          select: { openId: true, unionId: true, mpAppId: true, bindAt: true }
        },
        douyinBindings: {
          where: { unboundAt: null },
          select: { openId: true, unionId: true, mpAppId: true, bindAt: true }
        }
      }
    })
  }

  /**
   * 通过手机号登录：已有则返回，否则创建
   */
  async upsertByPhone(phoneNumber: string, nickname?: string): Promise<User> {
    const existing = await this.prisma.user.findUnique({ where: { phoneNumber } })
    if (existing) return existing
    return this.prisma.user.create({
      data: {
        id: genId('u'),
        phoneNumber,
        nickname: nickname ?? this.defaultNicknameForPhone(phoneNumber),
        primarySource: PrimarySource.phone,
        status: UserStatus.active
      }
    })
  }

  /**
   * 微信登录：找 binding → 若有返回 user；没有则建 user + binding
   */
  async upsertByWechat(args: {
    mpAppId: string
    openId: string
    unionId?: string
    nickname?: string
  }): Promise<User> {
    const existing = await this.prisma.wechatBinding.findFirst({
      where: { mpAppId: args.mpAppId, openId: args.openId, unboundAt: null },
      include: { user: true }
    })
    if (existing?.user) return existing.user

    // 若有 unionId，尝试通过 unionId 跨小程序找到同一 user
    if (args.unionId) {
      const sibling = await this.prisma.wechatBinding.findFirst({
        where: { unionId: args.unionId, unboundAt: null },
        include: { user: true }
      })
      if (sibling?.user) {
        // 同一人在不同小程序 → 复用 user，再建一条新 binding
        await this.prisma.wechatBinding.create({
          data: {
            id: genId('wb'),
            userId: sibling.user.id,
            mpAppId: args.mpAppId,
            openId: args.openId,
            unionId: args.unionId
          }
        })
        return sibling.user
      }
    }

    // 完全新用户
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          id: genId('u'),
          nickname: args.nickname ?? '微信用户',
          primarySource: PrimarySource.wechat,
          status: UserStatus.active
        }
      })
      await tx.wechatBinding.create({
        data: {
          id: genId('wb'),
          userId: user.id,
          mpAppId: args.mpAppId,
          openId: args.openId,
          unionId: args.unionId ?? null
        }
      })
      return user
    })
  }

  async upsertByDouyin(args: {
    mpAppId: string
    openId: string
    unionId?: string
    nickname?: string
  }): Promise<User> {
    const existing = await this.prisma.douyinBinding.findFirst({
      where: { mpAppId: args.mpAppId, openId: args.openId, unboundAt: null },
      include: { user: true }
    })
    if (existing?.user) return existing.user

    if (args.unionId) {
      const sibling = await this.prisma.douyinBinding.findFirst({
        where: { unionId: args.unionId, unboundAt: null },
        include: { user: true }
      })
      if (sibling?.user) {
        await this.prisma.douyinBinding.create({
          data: {
            id: genId('db'),
            userId: sibling.user.id,
            mpAppId: args.mpAppId,
            openId: args.openId,
            unionId: args.unionId
          }
        })
        return sibling.user
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          id: genId('u'),
          nickname: args.nickname ?? '抖音用户',
          primarySource: PrimarySource.douyin,
          status: UserStatus.active
        }
      })
      await tx.douyinBinding.create({
        data: {
          id: genId('db'),
          userId: user.id,
          mpAppId: args.mpAppId,
          openId: args.openId,
          unionId: args.unionId ?? null
        }
      })
      return user
    })
  }

  async updateProfile(
    userId: string,
    data: Partial<Pick<User, 'nickname' | 'avatar'>>
  ): Promise<User> {
    return this.prisma.user.update({ where: { id: userId }, data })
  }

  async touchActive(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { lastActiveAt: new Date() }
    })
  }

  async isBanned(user: User): Promise<boolean> {
    if (user.status === UserStatus.banned) {
      if (!user.banUntil || user.banUntil > new Date()) return true
      // 过期 → 自动解封
      await this.prisma.user.update({
        where: { id: user.id },
        data: { status: UserStatus.active, banUntil: null }
      })
      return false
    }
    return false
  }

  private defaultNicknameForPhone(phoneNumber: string): string {
    const tail = phoneNumber.slice(-4)
    return `球友_${tail}`
  }
}
