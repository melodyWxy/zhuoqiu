import { Injectable, Logger } from '@nestjs/common'
import RPCClient from '@alicloud/pop-core'
import { BusinessException, ErrorCode } from '../common/exceptions/business.exception'
import { randomBytes } from 'crypto'

/**
 * 阿里云 OSS STS token service。
 *
 * 前端拿临时 token 直传 OSS，避免：
 * 1) 文件走 server 带宽；
 * 2) 主 AccessKey 暴露给前端。
 *
 * 流程：
 *   client GET /uploads/sts-token?category=xxx
 *   → server 用长期 AK + RoleArn 调 STS:AssumeRole
 *   → 返回 { credentials, bucket, region, endpoint, objectKeyPrefix, expiration }
 *   → client 用这组 credentials 调 ali-oss JS SDK 把文件 put 到 `{prefix}/{randomName}.{ext}`
 *   → client 把最终 url / path 报给 server（后续业务接口只传 URL 或 path）
 */

interface AssumeRoleResult {
  Credentials: {
    AccessKeyId: string
    AccessKeySecret: string
    SecurityToken: string
    Expiration: string
  }
  AssumedRoleUser: { Arn: string; AssumedRoleId: string }
  RequestId: string
}

export interface StsTokenResponse {
  region: string
  bucket: string
  /** 自定义域名 endpoint（若配置了），否则 null，前端按默认拼 */
  endpoint: string | null
  accessKeyId: string
  accessKeySecret: string
  securityToken: string
  expiration: string // ISO 8601
  /** 约定的 objectKey 前缀，如 license/20260512 —— 前端 put 的 key 必须以此开头 */
  objectKeyPrefix: string
  /** 临时凭证的有效秒数，便于前端决定是否续 */
  expiresInSec: number
}

// Policy 里的 category 白名单：保持和业务上传用途对齐
const ALLOWED_CATEGORIES = new Set([
  'license',
  'id-card',
  'venue-cover',
  'tournament-cover',
  'avatar',
  'general'
])

// 临时凭证有效期（秒）。阿里云允许范围 900s - 3600s；900s 够一次上传，最安全
const DEFAULT_DURATION_SEC = 900

@Injectable()
export class OssStsService {
  private readonly logger = new Logger(OssStsService.name)
  private client: RPCClient | null = null

  private get bucket(): string {
    const b = process.env.OSS_BUCKET
    if (!b) throw new BusinessException(ErrorCode.INTERNAL_ERROR, 'OSS 未配置 bucket')
    return b
  }

  private get region(): string {
    return process.env.OSS_REGION ?? 'oss-cn-beijing'
  }

  private get roleArn(): string {
    const r = process.env.OSS_ROLE_ARN
    if (!r) {
      throw new BusinessException(
        ErrorCode.INTERNAL_ERROR,
        'OSS 未配置 RoleArn（STS 直传必需）'
      )
    }
    return r
  }

  private getClient(): RPCClient {
    if (this.client) return this.client
    const id = process.env.OSS_ACCESS_KEY_ID
    const secret = process.env.OSS_ACCESS_KEY_SECRET
    if (!id || !secret) {
      throw new BusinessException(
        ErrorCode.INTERNAL_ERROR,
        'OSS 未配置 AccessKey'
      )
    }
    this.client = new RPCClient({
      accessKeyId: id,
      accessKeySecret: secret,
      endpoint: 'https://sts.aliyuncs.com',
      apiVersion: '2015-04-01'
    })
    return this.client
  }

  /**
   * 为一个 category 签一个只读"可 put 该前缀下任意 object" 的 STS token。
   *
   * sessionName 带上调用者身份（venueAccountId），出问题能从 OSS 日志查。
   */
  async issueUploadToken(
    category: string,
    sessionName: string
  ): Promise<StsTokenResponse> {
    const cat = ALLOWED_CATEGORIES.has(category) ? category : 'general'
    const dir = this.todayDir()
    const prefix = `${cat}/${dir}`

    const policy = {
      Version: '1',
      Statement: [
        {
          Effect: 'Allow',
          Action: ['oss:PutObject'],
          Resource: [`acs:oss:*:*:${this.bucket}/${prefix}/*`]
        }
      ]
    }

    const result = (await this.getClient().request(
      'AssumeRole',
      {
        RoleArn: this.roleArn,
        RoleSessionName: this.safeSessionName(sessionName),
        DurationSeconds: DEFAULT_DURATION_SEC,
        Policy: JSON.stringify(policy)
      },
      { method: 'POST' }
    )) as AssumeRoleResult

    const c = result.Credentials
    return {
      region: this.region,
      bucket: this.bucket,
      endpoint: process.env.OSS_ENDPOINT || null,
      accessKeyId: c.AccessKeyId,
      accessKeySecret: c.AccessKeySecret,
      securityToken: c.SecurityToken,
      expiration: c.Expiration,
      objectKeyPrefix: prefix,
      expiresInSec: DEFAULT_DURATION_SEC
    }
  }

  /** 供业务接口校验前端回传的 url 是否指向本 bucket。简单白名单防伪造。 */
  isValidObjectUrl(url: string): boolean {
    if (!url) return false
    const custom = process.env.OSS_ENDPOINT
    if (custom) {
      try {
        const u = new URL(url)
        const host = new URL(custom.startsWith('http') ? custom : `https://${custom}`).host
        return u.host === host
      } catch {
        return false
      }
    }
    // 默认 <bucket>.<region>.aliyuncs.com
    const expectedHost = `${this.bucket}.${this.region}.aliyuncs.com`
    try {
      const u = new URL(url)
      return u.host === expectedHost
    } catch {
      return false
    }
  }

  private todayDir(): string {
    const d = new Date()
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}${m}${day}`
  }

  /** sessionName 限制：只接 [0-9a-zA-Z._-]，长度 2–32 */
  private safeSessionName(raw: string): string {
    const cleaned = raw.replace(/[^0-9a-zA-Z._-]/g, '').slice(0, 32)
    if (cleaned.length >= 2) return cleaned
    return 'upload-' + randomBytes(4).toString('hex')
  }
}
