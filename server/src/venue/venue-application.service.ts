import { Injectable } from '@nestjs/common'
import {
  Prisma,
  VenueAccountRole,
  VenueApplicationSource,
  VenueApplicationStatus
} from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { BusinessException, ErrorCode } from '../common/exceptions/business.exception'
import { genId } from '../common/utils/id'
import { AuditService } from '../audit/audit.service'
import { GeoService } from '../geo/geo.service'
import {
  ApplicationPayloadDto,
  SubmitApplicationDto
} from './dto/venue-application.dto'

@Injectable()
export class VenueApplicationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly geo: GeoService
  ) {}

  /**
   * 商家提交入驻申请。如已有一份 pending/draft 的申请，则覆盖同一条记录；
   * 被 rejected 过的记录允许重新提交（回到 pending）。
   */
  async submit(
    accountId: string,
    dto: SubmitApplicationDto,
    source: VenueApplicationSource
  ) {
    const account = await this.prisma.venueAccount.findUnique({
      where: { id: accountId }
    })
    if (!account) {
      throw new BusinessException(ErrorCode.UNAUTHORIZED, '商家账号不存在')
    }
    if (account.venueId) {
      throw new BusinessException(
        ErrorCode.VENUE_APPLICATION_STATE_INVALID,
        '你已有绑定的球房，无需重复申请'
      )
    }

    // 找当前账号最近一次未 approved 的申请；可覆盖
    const existing = await this.prisma.venueApplication.findFirst({
      where: {
        applicantAccountId: accountId,
        status: { in: [VenueApplicationStatus.draft, VenueApplicationStatus.pending, VenueApplicationStatus.rejected] }
      },
      orderBy: { createdAt: 'desc' }
    })

    if (existing) {
      return this.prisma.venueApplication.update({
        where: { id: existing.id },
        data: {
          payloadJson: dto.payload as unknown as Prisma.InputJsonValue,
          licenseImage: dto.licenseImage,
          idCardImage: dto.idCardImage,
          status: VenueApplicationStatus.pending,
          rejectReason: null,
          source,
          updatedAt: new Date()
        }
      })
    }

    return this.prisma.venueApplication.create({
      data: {
        id: genId('app'),
        applicantAccountId: accountId,
        source,
        payloadJson: dto.payload as unknown as Prisma.InputJsonValue,
        licenseImage: dto.licenseImage,
        idCardImage: dto.idCardImage,
        status: VenueApplicationStatus.pending
      }
    })
  }

  async getMine(accountId: string) {
    return this.prisma.venueApplication.findFirst({
      where: { applicantAccountId: accountId },
      orderBy: { createdAt: 'desc' }
    })
  }

  async listForAdmin(args: {
    status?: VenueApplicationStatus
    page: number
    pageSize: number
  }) {
    const where: Prisma.VenueApplicationWhereInput = {}
    if (args.status) where.status = args.status

    const [items, total] = await this.prisma.$transaction([
      this.prisma.venueApplication.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (args.page - 1) * args.pageSize,
        take: args.pageSize,
        include: {
          applicant: {
            select: {
              id: true,
              phoneNumber: true,
              nickname: true
            }
          }
        }
      }),
      this.prisma.venueApplication.count({ where })
    ])
    return {
      items,
      total,
      page: args.page,
      pageSize: args.pageSize
    }
  }

  async getByIdForAdmin(id: string) {
    const app = await this.prisma.venueApplication.findUnique({
      where: { id },
      include: {
        applicant: true
      }
    })
    if (!app) {
      throw new BusinessException(
        ErrorCode.VENUE_APPLICATION_NOT_FOUND,
        '申请不存在'
      )
    }
    return app
  }

  async approve(
    id: string,
    adminId: string,
    ctx: { ip: string; userAgent?: string }
  ) {
    // 先读出申请校验状态 + 调外部地理编码（不能放进事务里跑，
    // 否则 5s 网络等待会一直占着行锁）。地理编码失败留 null，
    // 不阻塞审核通过流程。
    const pre = await this.prisma.venueApplication.findUnique({
      where: { id }
    })
    if (!pre) {
      throw new BusinessException(
        ErrorCode.VENUE_APPLICATION_NOT_FOUND,
        '申请不存在'
      )
    }
    if (pre.status !== VenueApplicationStatus.pending) {
      throw new BusinessException(
        ErrorCode.VENUE_APPLICATION_STATE_INVALID,
        '只有 pending 申请可以审核通过'
      )
    }
    const prePayload = pre.payloadJson as unknown as ApplicationPayloadDto
    // 拼上省/市/区前缀给腾讯，提高 lat/lng 精度（详细地址往往省了行政区前缀）
    const fullAddress = `${prePayload.province}${prePayload.city}${prePayload.district}${prePayload.address}`
    const geo = await this.geo.resolveAddress(fullAddress)

    return this.prisma.$transaction(async (tx) => {
      // 事务内重读 + 重检一遍，防并发审核
      const app = await tx.venueApplication.findUnique({
        where: { id },
        include: { applicant: true }
      })
      if (!app) {
        throw new BusinessException(
          ErrorCode.VENUE_APPLICATION_NOT_FOUND,
          '申请不存在'
        )
      }
      if (app.status !== VenueApplicationStatus.pending) {
        throw new BusinessException(
          ErrorCode.VENUE_APPLICATION_STATE_INVALID,
          '只有 pending 申请可以审核通过'
        )
      }
      const payload = app.payloadJson as unknown as ApplicationPayloadDto
      const venueId = genId('v')
      const openHoursRecord = Object.fromEntries(
        (payload.openHours ?? []).map((i) => [i.day, i.hours])
      )

      const venue = await tx.venue.create({
        data: {
          id: venueId,
          name: payload.name,
          address: payload.address,
          // 省/市/区直接用商家入驻时三级 picker 选的值（权威）；
          // 腾讯地图只为「同城距离排序」补 lat/lng，不再决定城市归属
          province: payload.province,
          city: payload.city,
          district: payload.district,
          lat: geo.lat,
          lng: geo.lng,
          phone: payload.contactPhone,
          tablesCount: payload.tablesCount,
          openHoursJson: openHoursRecord as unknown as Prisma.InputJsonValue,
          description: payload.description,
          coverImage: null,
          ownerAccountId: app.applicantAccountId
        }
      })
      // 把申请人账号绑定到该 venue（role=owner 已经是默认值，这里确保）
      await tx.venueAccount.update({
        where: { id: app.applicantAccountId },
        data: {
          venueId: venue.id,
          role: VenueAccountRole.owner
        }
      })
      const updated = await tx.venueApplication.update({
        where: { id },
        data: {
          status: VenueApplicationStatus.approved,
          reviewedByAdminId: adminId,
          reviewedAt: new Date(),
          venueId: venue.id,
          rejectReason: null
        }
      })
      await tx.adminAuditLog.create({
        data: {
          actorAdminId: adminId,
          action: 'approve_venue_application',
          targetType: 'venue_application',
          targetId: app.id,
          detailJson: {
            venueId: venue.id,
            applicantAccountId: app.applicantAccountId,
            source: app.source
          },
          ip: ctx.ip,
          userAgent: ctx.userAgent
        }
      })
      return { application: updated, venue }
    })
  }

  async reject(
    id: string,
    adminId: string,
    reason: string,
    ctx: { ip: string; userAgent?: string }
  ) {
    const app = await this.prisma.venueApplication.findUnique({ where: { id } })
    if (!app) {
      throw new BusinessException(
        ErrorCode.VENUE_APPLICATION_NOT_FOUND,
        '申请不存在'
      )
    }
    if (app.status !== VenueApplicationStatus.pending) {
      throw new BusinessException(
        ErrorCode.VENUE_APPLICATION_STATE_INVALID,
        '只有 pending 申请可以驳回'
      )
    }
    if (!reason.trim()) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '驳回时必须填原因'
      )
    }
    const updated = await this.prisma.venueApplication.update({
      where: { id },
      data: {
        status: VenueApplicationStatus.rejected,
        reviewedByAdminId: adminId,
        reviewedAt: new Date(),
        rejectReason: reason
      }
    })
    await this.audit.log({
      adminId,
      action: 'reject_venue_application',
      targetType: 'venue_application',
      targetId: id,
      detail: { reason },
      ip: ctx.ip,
      userAgent: ctx.userAgent
    })
    return updated
  }
}
