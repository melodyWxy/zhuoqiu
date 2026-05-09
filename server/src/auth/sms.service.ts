import { Injectable, Logger } from '@nestjs/common'
import { PhoneCodePurpose } from '@prisma/client'
import { randomInt } from 'crypto'
import { PrismaService } from '../prisma/prisma.service'
import { BusinessException, ErrorCode } from '../common/exceptions/business.exception'

const CODE_TTL_MS = 5 * 60 * 1000
const MAX_ATTEMPTS = 5

/**
 * MVP：不接真实短信通道，在日志里打出验证码。
 * 生产接入：阿里云/腾讯云 短信，替换 sendToProvider 即可。
 */
@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name)
  private readonly devFixedCode = process.env.DEV_FIXED_SMS_CODE
  private readonly bypassEnabled = !!this.devFixedCode

  constructor(private readonly prisma: PrismaService) {
    if (this.bypassEnabled) {
      this.logger.warn(
        `⚠️ 开发模式：所有验证码固定为 "${this.devFixedCode}"。生产环境请清空 DEV_FIXED_SMS_CODE。`
      )
    }
  }

  async sendCode(phoneNumber: string, purpose: PhoneCodePurpose): Promise<void> {
    if (this.bypassEnabled) {
      // 开发模式：不写数据库、不限流，直接日志提示
      this.logger.warn(
        `[DEV SMS · BYPASS] ${phoneNumber} (${purpose}) 固定验证码: ${this.devFixedCode}`
      )
      return
    }

    // 防刷：同一号码一分钟内不能重复发送
    const recent = await this.prisma.phoneVerifyCode.findFirst({
      where: {
        phoneNumber,
        purpose,
        createdAt: { gt: new Date(Date.now() - 60_000) }
      }
    })
    if (recent) {
      throw new BusinessException(
        ErrorCode.RATE_LIMITED,
        '请求过于频繁，一分钟后再试'
      )
    }

    const code = this.generateCode()
    await this.prisma.phoneVerifyCode.create({
      data: {
        phoneNumber,
        purpose,
        code,
        expiresAt: new Date(Date.now() + CODE_TTL_MS)
      }
    })
    this.logger.warn(`[DEV SMS] ${phoneNumber} (${purpose}) 验证码: ${code}`)
  }

  async verifyCode(
    phoneNumber: string,
    code: string,
    purpose: PhoneCodePurpose
  ): Promise<void> {
    if (this.bypassEnabled) {
      if (code === this.devFixedCode) {
        return // 开发模式直接通过
      }
      throw new BusinessException(
        ErrorCode.SMS_CODE_INVALID,
        `验证码错误（开发模式固定为 ${this.devFixedCode}）`
      )
    }

    const record = await this.prisma.phoneVerifyCode.findFirst({
      where: {
        phoneNumber,
        purpose,
        usedAt: null,
        expiresAt: { gt: new Date() }
      },
      orderBy: { createdAt: 'desc' }
    })
    if (!record) {
      throw new BusinessException(ErrorCode.SMS_CODE_INVALID, '验证码不存在或已过期')
    }
    if (record.attempts >= MAX_ATTEMPTS) {
      throw new BusinessException(
        ErrorCode.SMS_CODE_INVALID,
        '验证码错误次数过多，请重新获取'
      )
    }
    if (record.code !== code) {
      await this.prisma.phoneVerifyCode.update({
        where: { id: record.id },
        data: { attempts: record.attempts + 1 }
      })
      throw new BusinessException(ErrorCode.SMS_CODE_INVALID, '验证码错误')
    }
    await this.prisma.phoneVerifyCode.update({
      where: { id: record.id },
      data: { usedAt: new Date() }
    })
  }

  private generateCode(): string {
    return randomInt(100000, 1000000).toString()
  }
}
