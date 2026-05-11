import { Injectable } from '@nestjs/common'
import {
  Prisma,
  VenueAccount,
  VenueAccountStatus,
  VenueStatus
} from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { BusinessException, ErrorCode } from '../common/exceptions/business.exception'
import { genId } from '../common/utils/id'

@Injectable()
export class VenueService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 登录时 upsert 商家账号：存在则更新 lastLoginAt，不存在则建一个 owner 账号（尚未绑定 venue）。
   */
  async upsertByPhoneLogin(
    phoneNumber: string,
    nickname?: string
  ): Promise<VenueAccount> {
    const existing = await this.prisma.venueAccount.findUnique({
      where: { phoneNumber }
    })
    if (existing) {
      if (existing.status !== VenueAccountStatus.active) {
        throw new BusinessException(ErrorCode.ACCOUNT_BANNED, '商家账号已停用')
      }
      return this.prisma.venueAccount.update({
        where: { id: existing.id },
        data: { lastLoginAt: new Date() }
      })
    }
    const tail = phoneNumber.slice(-4)
    return this.prisma.venueAccount.create({
      data: {
        id: genId('va'),
        phoneNumber,
        nickname: nickname?.trim() || `商家_${tail}`,
        role: 'owner',
        status: VenueAccountStatus.active,
        lastLoginAt: new Date()
      }
    })
  }

  async getAccountById(id: string): Promise<VenueAccount | null> {
    return this.prisma.venueAccount.findUnique({ where: { id } })
  }

  async getAccountWithVenue(id: string) {
    return this.prisma.venueAccount.findUnique({
      where: { id },
      include: {
        ownedVenue: true,
        venue: true
      }
    })
  }

  // ============ 公共接口（C 端 / Admin 都可读） ============

  async listPublic(args: { keyword?: string; page: number; pageSize: number }) {
    const where: Prisma.VenueWhereInput = {
      status: VenueStatus.active
    }
    if (args.keyword?.trim()) {
      where.OR = [
        { name: { contains: args.keyword, mode: 'insensitive' } },
        { address: { contains: args.keyword, mode: 'insensitive' } }
      ]
    }
    const [items, total] = await this.prisma.$transaction([
      this.prisma.venue.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (args.page - 1) * args.pageSize,
        take: args.pageSize,
        select: {
          id: true,
          name: true,
          slug: true,
          address: true,
          phone: true,
          coverImage: true,
          tablesCount: true,
          openHoursJson: true,
          description: true,
          status: true,
          createdAt: true
        }
      }),
      this.prisma.venue.count({ where })
    ])
    return {
      items,
      total,
      page: args.page,
      pageSize: args.pageSize
    }
  }

  async getPublic(id: string) {
    const venue = await this.prisma.venue.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        slug: true,
        address: true,
        phone: true,
        coverImage: true,
        tablesCount: true,
        openHoursJson: true,
        description: true,
        status: true,
        createdAt: true
      }
    })
    if (!venue || venue.status !== VenueStatus.active) {
      throw new BusinessException(ErrorCode.VENUE_NOT_FOUND, '球房不存在或已停用')
    }
    return venue
  }

  // ============ 商家自家 venue 更新（限 admin_web） ============

  async updateOwnVenue(
    accountId: string,
    patch: {
      name?: string
      address?: string
      phone?: string
      coverImage?: string | null
      tablesCount?: number
      openHoursJson?: unknown
      description?: string | null
    }
  ) {
    const account = await this.prisma.venueAccount.findUnique({
      where: { id: accountId }
    })
    if (!account) {
      throw new BusinessException(ErrorCode.UNAUTHORIZED, '商家账号不存在')
    }
    if (!account.venueId) {
      throw new BusinessException(
        ErrorCode.VENUE_NOT_FOUND,
        '你还没有绑定球房，请先完成入驻申请'
      )
    }
    // role=owner 才能改
    if (account.role !== 'owner') {
      throw new BusinessException(
        ErrorCode.FORBIDDEN,
        '仅 owner 可以修改店铺资料'
      )
    }
    const data: Prisma.VenueUpdateInput = {}
    if (patch.name !== undefined) data.name = patch.name
    if (patch.address !== undefined) data.address = patch.address
    if (patch.phone !== undefined) data.phone = patch.phone
    if (patch.coverImage !== undefined) data.coverImage = patch.coverImage
    if (patch.tablesCount !== undefined) data.tablesCount = patch.tablesCount
    if (patch.openHoursJson !== undefined) {
      data.openHoursJson = patch.openHoursJson as Prisma.InputJsonValue
    }
    if (patch.description !== undefined) data.description = patch.description
    return this.prisma.venue.update({
      where: { id: account.venueId },
      data
    })
  }
}
