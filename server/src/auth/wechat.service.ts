import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { AppConfig } from '../config/configuration'
import { BusinessException, ErrorCode } from '../common/exceptions/business.exception'

interface Code2SessionResult {
  openId: string
  unionId?: string
  sessionKey?: string
}

interface PhoneNumberResult {
  phoneNumber: string // 带 + 的国际号，如 +8613800138000
  purePhoneNumber: string
  countryCode: string
}

const WX_BASE = 'https://api.weixin.qq.com'

/**
 * 封装微信小程序服务端接口：
 *  - jscode2session（登录）
 *  - stable_token（应用级 access_token，内存缓存）
 *  - getuserphonenumber（手机号）
 *
 * 当 `WECHAT_MP_APP_ID` / `WECHAT_MP_APP_SECRET` 任一为空时，全部走 mock 回落，
 * 让本地 / CI 不依赖真实微信凭据。
 */
@Injectable()
export class WechatService {
  private readonly logger = new Logger(WechatService.name)
  private accessTokenCache: { token: string; expiresAt: number } | null = null

  constructor(private readonly config: ConfigService<AppConfig>) {}

  isMock(): boolean {
    const w = this.config.get('wechat', { infer: true })
    return !w || !w.appId || !w.appSecret
  }

  async code2Session(code: string): Promise<Code2SessionResult> {
    if (this.isMock()) {
      return { openId: `mock_wx_${code.slice(0, 32)}` }
    }
    const { appId, appSecret } = this.config.get('wechat', { infer: true })!
    const url = `${WX_BASE}/sns/jscode2session?appid=${encodeURIComponent(
      appId
    )}&secret=${encodeURIComponent(appSecret)}&js_code=${encodeURIComponent(
      code
    )}&grant_type=authorization_code`
    const json = await this.callWx<{
      openid?: string
      unionid?: string
      session_key?: string
      errcode?: number
      errmsg?: string
    }>(url)
    if (json.errcode || !json.openid) {
      this.logger.warn(`code2session 失败: ${JSON.stringify(json)}`)
      throw new BusinessException(
        ErrorCode.LOGIN_FAILED,
        `微信登录失败：${json.errmsg ?? 'unknown'}`
      )
    }
    return {
      openId: json.openid,
      unionId: json.unionid,
      sessionKey: json.session_key
    }
  }

  async getPhoneNumber(code: string): Promise<PhoneNumberResult> {
    if (this.isMock()) {
      return {
        phoneNumber: '+8613000000000',
        purePhoneNumber: '13000000000',
        countryCode: '86'
      }
    }
    const token = await this.getStableAccessToken()
    const url = `${WX_BASE}/wxa/business/getuserphonenumber?access_token=${encodeURIComponent(
      token
    )}`
    const json = await this.callWx<{
      errcode?: number
      errmsg?: string
      phone_info?: {
        phoneNumber: string
        purePhoneNumber: string
        countryCode: string
      }
    }>(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code })
    })
    if (json.errcode || !json.phone_info) {
      this.logger.warn(`getuserphonenumber 失败: ${JSON.stringify(json)}`)
      throw new BusinessException(
        ErrorCode.LOGIN_FAILED,
        `获取微信手机号失败：${json.errmsg ?? 'unknown'}`
      )
    }
    return json.phone_info
  }

  /** v2.22 战报系统 wxacode 生成需要复用 access_token，给一个公开访问入口 */
  async getStableAccessToken(): Promise<string> {
    const now = Date.now()
    if (this.accessTokenCache && this.accessTokenCache.expiresAt > now + 60_000) {
      return this.accessTokenCache.token
    }
    const { appId, appSecret } = this.config.get('wechat', { infer: true })!
    const url = `${WX_BASE}/cgi-bin/stable_token`
    const json = await this.callWx<{
      access_token?: string
      expires_in?: number
      errcode?: number
      errmsg?: string
    }>(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'client_credential',
        appid: appId,
        secret: appSecret,
        force_refresh: false
      })
    })
    if (!json.access_token) {
      this.logger.warn(`stable_token 失败: ${JSON.stringify(json)}`)
      throw new BusinessException(
        ErrorCode.INTERNAL_ERROR,
        `获取微信 access_token 失败：${json.errmsg ?? 'unknown'}`
      )
    }
    const ttlSec = json.expires_in ?? 7200
    this.accessTokenCache = {
      token: json.access_token,
      expiresAt: now + (ttlSec - 200) * 1000
    }
    return json.access_token
  }

  private async callWx<T>(url: string, init?: RequestInit): Promise<T> {
    const r = await fetch(url, init).catch((e) => {
      this.logger.error(`微信接口网络异常 ${url}: ${(e as Error).message}`)
      throw new BusinessException(
        ErrorCode.INTERNAL_ERROR,
        '微信服务暂不可用，请稍后再试'
      )
    })
    return (await r.json()) as T
  }
}
