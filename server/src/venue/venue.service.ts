import { Injectable } from '@nestjs/common'
import { VenueAccount, VenueAccountStatus } from '@prisma/client'
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
}
