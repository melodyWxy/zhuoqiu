import { Injectable, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { ConfigService } from '@nestjs/config'
import * as bcrypt from 'bcrypt'
import { randomUUID } from 'crypto'
import { PrismaService } from '../prisma/prisma.service'
import { BusinessException, ErrorCode } from '../common/exceptions/business.exception'
import {
  AdminJwtPayload,
  AdminRefreshPayload,
  UserJwtPayload,
  UserRefreshPayload
} from './jwt-payload'
import { AppConfig } from '../config/configuration'
import { AdminAccount, AdminStatus, User } from '@prisma/client'

const LOGIN_FAIL_THRESHOLD = 5
const LOGIN_LOCK_MS = 15 * 60 * 1000

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<AppConfig>
  ) {}

  async verifyAdminPassword(
    username: string,
    password: string,
    ip: string
  ): Promise<AdminAccount> {
    const account = await this.prisma.adminAccount.findUnique({ where: { username } })
    if (!account) {
      throw new BusinessException(ErrorCode.LOGIN_FAILED, '账号或密码错误')
    }

    if (account.status !== AdminStatus.active) {
      throw new BusinessException(ErrorCode.ACCOUNT_BANNED, '账号已停用')
    }

    if (account.lockedUntil && account.lockedUntil > new Date()) {
      throw new BusinessException(
        ErrorCode.ACCOUNT_LOCKED,
        `账号已锁定，请 ${Math.ceil(
          (account.lockedUntil.getTime() - Date.now()) / 60000
        )} 分钟后重试`
      )
    }

    const ok = await bcrypt.compare(password, account.passwordHash)
    if (!ok) {
      const failed = account.failedLoginCount + 1
      await this.prisma.adminAccount.update({
        where: { id: account.id },
        data: {
          failedLoginCount: failed,
          lockedUntil:
            failed >= LOGIN_FAIL_THRESHOLD
              ? new Date(Date.now() + LOGIN_LOCK_MS)
              : null
        }
      })
      throw new BusinessException(ErrorCode.LOGIN_FAILED, '账号或密码错误')
    }

    // 成功 → 清零失败计数、更新最后登录信息
    await this.prisma.adminAccount.update({
      where: { id: account.id },
      data: {
        failedLoginCount: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
        lastLoginIp: ip
      }
    })

    return account
  }

  issueAdminTokens(account: AdminAccount): {
    accessToken: string
    refreshToken: string
    expiresIn: number
  } {
    const jwtConfig = this.config.get('jwt', { infer: true })!
    const accessPayload: AdminJwtPayload = {
      type: 'admin',
      sub: account.id,
      role: account.role,
      jti: randomUUID()
    }
    const refreshPayload: AdminRefreshPayload = {
      type: 'admin_refresh',
      sub: account.id,
      jti: randomUUID()
    }

    const accessToken = this.jwt.sign(accessPayload, {
      secret: jwtConfig.accessSecret,
      expiresIn: jwtConfig.accessTtl
    })
    const refreshToken = this.jwt.sign(refreshPayload, {
      secret: jwtConfig.refreshSecret,
      expiresIn: jwtConfig.refreshTtl
    })

    const expiresIn = this.parseTtlToSeconds(jwtConfig.accessTtl)

    return { accessToken, refreshToken, expiresIn }
  }

  async refreshAdminAccessToken(refreshToken: string): Promise<{
    accessToken: string
    expiresIn: number
  }> {
    const jwtConfig = this.config.get('jwt', { infer: true })!
    let payload: AdminRefreshPayload
    try {
      payload = this.jwt.verify<AdminRefreshPayload>(refreshToken, {
        secret: jwtConfig.refreshSecret
      })
    } catch {
      throw new UnauthorizedException('refresh token 无效或已过期')
    }
    if (payload.type !== 'admin_refresh') {
      throw new UnauthorizedException('token 类型不匹配')
    }
    const account = await this.prisma.adminAccount.findUnique({
      where: { id: payload.sub }
    })
    if (!account || account.status !== AdminStatus.active) {
      throw new UnauthorizedException('账号不可用')
    }

    const access: AdminJwtPayload = {
      type: 'admin',
      sub: account.id,
      role: account.role,
      jti: randomUUID()
    }
    const accessToken = this.jwt.sign(access, {
      secret: jwtConfig.accessSecret,
      expiresIn: jwtConfig.accessTtl
    })
    return {
      accessToken,
      expiresIn: this.parseTtlToSeconds(jwtConfig.accessTtl)
    }
  }

  // ============ C 端 user token ============

  issueUserTokens(user: User): {
    accessToken: string
    refreshToken: string
    expiresIn: number
  } {
    const jwtConfig = this.config.get('jwt', { infer: true })!
    const accessPayload: UserJwtPayload = {
      type: 'user',
      sub: user.id,
      jti: randomUUID()
    }
    const refreshPayload: UserRefreshPayload = {
      type: 'user_refresh',
      sub: user.id,
      jti: randomUUID()
    }
    const accessToken = this.jwt.sign(accessPayload, {
      secret: jwtConfig.accessSecret,
      expiresIn: jwtConfig.accessTtl
    })
    const refreshToken = this.jwt.sign(refreshPayload, {
      secret: jwtConfig.refreshSecret,
      expiresIn: jwtConfig.refreshTtl
    })
    return {
      accessToken,
      refreshToken,
      expiresIn: this.parseTtlToSeconds(jwtConfig.accessTtl)
    }
  }

  async refreshUserAccessToken(refreshToken: string): Promise<{
    accessToken: string
    expiresIn: number
  }> {
    const jwtConfig = this.config.get('jwt', { infer: true })!
    let payload: UserRefreshPayload
    try {
      payload = this.jwt.verify<UserRefreshPayload>(refreshToken, {
        secret: jwtConfig.refreshSecret
      })
    } catch {
      throw new UnauthorizedException('refresh token 无效或已过期')
    }
    if (payload.type !== 'user_refresh') {
      throw new UnauthorizedException('token 类型不匹配')
    }
    const access: UserJwtPayload = {
      type: 'user',
      sub: payload.sub,
      jti: randomUUID()
    }
    const accessToken = this.jwt.sign(access, {
      secret: jwtConfig.accessSecret,
      expiresIn: jwtConfig.accessTtl
    })
    return {
      accessToken,
      expiresIn: this.parseTtlToSeconds(jwtConfig.accessTtl)
    }
  }

  verifyUserAccessToken(token: string): UserJwtPayload {
    const jwtConfig = this.config.get('jwt', { infer: true })!
    const payload = this.jwt.verify<UserJwtPayload>(token, {
      secret: jwtConfig.accessSecret
    })
    if (payload.type !== 'user') {
      throw new UnauthorizedException('token 类型不匹配')
    }
    return payload
  }

  verifyAdminAccessToken(token: string): AdminJwtPayload {
    const jwtConfig = this.config.get('jwt', { infer: true })!
    const payload = this.jwt.verify<AdminJwtPayload>(token, {
      secret: jwtConfig.accessSecret
    })
    if (payload.type !== 'admin') {
      throw new UnauthorizedException('token 类型不匹配')
    }
    return payload
  }

  async changeAdminPassword(
    adminId: string,
    oldPassword: string,
    newPassword: string
  ): Promise<void> {
    const account = await this.prisma.adminAccount.findUnique({ where: { id: adminId } })
    if (!account) {
      throw new UnauthorizedException('账号不存在')
    }
    const ok = await bcrypt.compare(oldPassword, account.passwordHash)
    if (!ok) {
      throw new BusinessException(ErrorCode.LOGIN_FAILED, '旧密码错误')
    }
    const hash = await bcrypt.hash(newPassword, 10)
    await this.prisma.adminAccount.update({
      where: { id: adminId },
      data: { passwordHash: hash, mustChangePassword: false }
    })
  }

  private parseTtlToSeconds(ttl: string): number {
    // 简单解析 15m / 7d / 3600s / 3600；生产用库
    const m = ttl.match(/^(\d+)([smhd]?)$/)
    if (!m) return 900
    const n = parseInt(m[1], 10)
    switch (m[2]) {
      case 's':
      case '':
        return n
      case 'm':
        return n * 60
      case 'h':
        return n * 3600
      case 'd':
        return n * 86400
      default:
        return 900
    }
  }
}
