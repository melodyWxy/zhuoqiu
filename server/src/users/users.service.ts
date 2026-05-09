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

  /**
   * 绑定手机号到当前 user。
   * - 当前 user 已有 phone：已经是同号返回幂等；否则报错"已绑定其他号"
   * - phone 已属另一 user：返回 conflictUserId，让客户端走合并流程
   */
  async bindPhone(userId: string, phoneNumber: string): Promise<{
    user: User
    conflictUserId?: string
  }> {
    const me = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!me) throw new Error('user not found')
    if (me.phoneNumber) {
      if (me.phoneNumber === phoneNumber) return { user: me }
      throw new Error('当前账号已绑定其他手机号')
    }
    const other = await this.prisma.user.findUnique({ where: { phoneNumber } })
    if (other && other.id !== userId) {
      return { user: me, conflictUserId: other.id }
    }
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { phoneNumber }
    })
    return { user: updated }
  }

  async unbindPhone(userId: string): Promise<User> {
    const me = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { wechatBindings: true, douyinBindings: true }
    })
    if (!me) throw new Error('user not found')
    if (!me.phoneNumber) throw new Error('未绑定手机号')
    const hasOtherLogin =
      me.wechatBindings.some((b) => b.unboundAt === null) ||
      me.douyinBindings.some((b) => b.unboundAt === null)
    if (!hasOtherLogin) {
      throw new Error('解绑手机号后将无登录方式，请先绑定微信或抖音')
    }
    return this.prisma.user.update({
      where: { id: userId },
      data: { phoneNumber: null }
    })
  }

  /**
   * 合并两个 user：把 secondary 的一切迁到 primary，secondary 标记 deleted。
   */
  async mergeUsers(primaryId: string, secondaryId: string): Promise<void> {
    if (primaryId === secondaryId) throw new Error('不能合并同一账号')

    await this.prisma.$transaction(async (tx) => {
      const [primary, secondary] = await Promise.all([
        tx.user.findUnique({ where: { id: primaryId } }),
        tx.user.findUnique({ where: { id: secondaryId } })
      ])
      if (!primary || !secondary) throw new Error('账号不存在')
      if (secondary.status === 'deleted') return

      // 1. 微信/抖音 binding 转到 primary
      await tx.wechatBinding.updateMany({
        where: { userId: secondaryId, unboundAt: null },
        data: { userId: primaryId }
      })
      await tx.douyinBinding.updateMany({
        where: { userId: secondaryId, unboundAt: null },
        data: { userId: primaryId }
      })

      // 2. matches 归属
      await tx.match.updateMany({
        where: { ownerUserId: secondaryId },
        data: { ownerUserId: primaryId }
      })
      await tx.matchPlayer.updateMany({
        where: { userId: secondaryId },
        data: { userId: primaryId }
      })

      // 3. 手机号迁移（primary 无 / secondary 有 → 转给 primary）
      if (!primary.phoneNumber && secondary.phoneNumber) {
        await tx.user.update({
          where: { id: secondaryId },
          data: { phoneNumber: null } // 先释放唯一约束
        })
        await tx.user.update({
          where: { id: primaryId },
          data: { phoneNumber: secondary.phoneNumber }
        })
      }

      // 4. secondary 标记 deleted
      await tx.user.update({
        where: { id: secondaryId },
        data: {
          status: 'deleted',
          deletedAt: new Date(),
          phoneNumber: null
        }
      })
    })
  }

  async unbindWechatById(bindingId: string): Promise<void> {
    await this.prisma.wechatBinding.update({
      where: { id: bindingId },
      data: { unboundAt: new Date() }
    })
  }

  async unbindDouyinById(bindingId: string): Promise<void> {
    await this.prisma.douyinBinding.update({
      where: { id: bindingId },
      data: { unboundAt: new Date() }
    })
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
