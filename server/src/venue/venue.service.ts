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
import { GeoService } from '../geo/geo.service'

/** 公共球房列表/详情共享的 select。改这里就同步改两处。 */
const VENUE_PUBLIC_SELECT = {
  id: true,
  name: true,
  slug: true,
  province: true,
  city: true,
  district: true,
  address: true,
  lat: true,
  lng: true,
  phone: true,
  coverImage: true,
  tablesCount: true,
  openHoursJson: true,
  description: true,
  status: true,
  createdAt: true
} as const

/**
 * 简化版距离平方（欧几里得）。同城范围（< 100km）误差可忽略；
 * 没必要上 Haversine。lat/lng 任一为 null → 排到末尾。
 */
function distSq(
  lat: number | null,
  lng: number | null,
  lat0: number,
  lng0: number
): number {
  if (lat == null || lng == null) return Number.POSITIVE_INFINITY
  const dx = lat - lat0
  const dy = lng - lng0
  return dx * dx + dy * dy
}

@Injectable()
export class VenueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly geo: GeoService
  ) {}

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

  async listPublic(args: {
    keyword?: string
    province?: string
    city?: string
    district?: string
    lat?: number
    lng?: number
    page: number
    pageSize: number
  }) {
    const where: Prisma.VenueWhereInput = {
      status: VenueStatus.active
    }
    if (args.keyword?.trim()) {
      const kw = args.keyword.trim()
      // v2.21：详细地址里不再重复省市区，搜索得把这三段一起匹上，
      // 不然用户搜「上海」会查不到上海的店
      where.OR = [
        { name: { contains: kw, mode: 'insensitive' } },
        { address: { contains: kw, mode: 'insensitive' } },
        { province: { contains: kw, mode: 'insensitive' } },
        { city: { contains: kw, mode: 'insensitive' } },
        { district: { contains: kw, mode: 'insensitive' } }
      ]
    }
    // 三级地区精确筛：每级独立可选，省可单独筛、省+市可一起筛
    if (args.province?.trim()) where.province = args.province.trim()
    if (args.city?.trim()) where.city = args.city.trim()
    if (args.district?.trim()) where.district = args.district.trim()

    // 同城距离排序：用户传了 lat/lng → 取该城市全量后内存排序，
    // PostgreSQL 不带 PostGIS 时手算欧几里得距离即可，城市内的 venue 一般 < 1k 条。
    // 没传 lat/lng → 按创建时间倒序，新店优先。
    const hasUserLoc =
      typeof args.lat === 'number' &&
      typeof args.lng === 'number' &&
      Number.isFinite(args.lat) &&
      Number.isFinite(args.lng)

    if (hasUserLoc && (args.city?.trim() || args.province?.trim())) {
      const all = await this.prisma.venue.findMany({
        where,
        select: VENUE_PUBLIC_SELECT
      })
      const lat0 = args.lat as number
      const lng0 = args.lng as number
      const sorted = [...all].sort((a, b) => {
        const da = distSq(a.lat, a.lng, lat0, lng0)
        const db = distSq(b.lat, b.lng, lat0, lng0)
        return da - db
      })
      const start = (args.page - 1) * args.pageSize
      return {
        items: sorted.slice(start, start + args.pageSize),
        total: sorted.length,
        page: args.page,
        pageSize: args.pageSize
      }
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.venue.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (args.page - 1) * args.pageSize,
        take: args.pageSize,
        select: VENUE_PUBLIC_SELECT
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
      select: VENUE_PUBLIC_SELECT
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
      province?: string
      city?: string
      district?: string
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
    if (patch.phone !== undefined) data.phone = patch.phone
    if (patch.coverImage !== undefined) data.coverImage = patch.coverImage
    if (patch.tablesCount !== undefined) data.tablesCount = patch.tablesCount
    if (patch.openHoursJson !== undefined) {
      data.openHoursJson = patch.openHoursJson as Prisma.InputJsonValue
    }
    if (patch.description !== undefined) data.description = patch.description

    // 省/市/区是商家三级 picker 选的权威值，直接落库
    if (patch.province !== undefined) data.province = patch.province
    if (patch.city !== undefined) data.city = patch.city
    if (patch.district !== undefined) data.district = patch.district
    if (patch.address !== undefined) data.address = patch.address

    // 任一定位字段变了 → 重新做正向地理编码补 lat/lng（同城距离排序用）。
    // 解析失败留 null，不影响城市维度的搜索。
    const locationChanged =
      patch.province !== undefined ||
      patch.city !== undefined ||
      patch.district !== undefined ||
      patch.address !== undefined
    if (locationChanged) {
      const existing = await this.prisma.venue.findUnique({
        where: { id: account.venueId },
        select: { province: true, city: true, district: true, address: true }
      })
      const province = patch.province ?? existing?.province ?? ''
      const city = patch.city ?? existing?.city ?? ''
      const district = patch.district ?? existing?.district ?? ''
      const address = patch.address ?? existing?.address ?? ''
      const fullAddress = `${province}${city}${district}${address}`
      const geo = await this.geo.resolveAddress(fullAddress)
      data.lat = geo.lat
      data.lng = geo.lng
    }

    return this.prisma.venue.update({
      where: { id: account.venueId },
      data
    })
  }
}
