import { Injectable, Logger } from '@nestjs/common'
import { WechatService } from '../auth/wechat.service'

/**
 * 微信小程序码（wxacode.getUnlimited）封装。
 *
 * 文档：https://developers.weixin.qq.com/miniprogram/dev/OpenApiDoc/qrcode-link/qr-code/wxacode.getUnlimited.html
 *
 * 关键约束：
 *   - scene 字段最多 32 个**字符**（不是字节，但中文按 UTF-8 多字节，建议 ASCII）
 *   - 总数无上限（不像 createQRCode 限 10 万）
 *   - check_path = false：开发版 page 还没发布也能生成
 *   - env_version: 'release' / 'trial' / 'develop'
 *     - release：正式版（默认）
 *     - trial：体验版
 *     - develop：开发版（仅同 AppID 的开发者扫码）
 *   - 未发布的小程序拉 wxacode 会报错（errcode=41030 等）
 */
@Injectable()
export class WxacodeService {
  private readonly logger = new Logger(WxacodeService.name)

  constructor(private readonly wechat: WechatService) {}

  /**
   * 拉小程序码 PNG buffer。
   *
   * @param scene 32 字符内的 ASCII；建议 `m=${matchIdSuffix}` 形式
   * @param page 落地页路径（不带前导 /），如 `pages/match-detail/index`
   * @param envVersion 默认 release；测试期可传 trial
   * @returns PNG buffer
   */
  async getUnlimited(
    scene: string,
    page: string,
    envVersion: 'release' | 'trial' | 'develop' = 'release'
  ): Promise<Buffer> {
    if (scene.length > 32) {
      throw new Error(`scene 超过 32 字符限制: ${scene.length}`)
    }
    const token = await this.wechat.getStableAccessToken()
    const url = `https://api.weixin.qq.com/wxa/getwxacodeunlimit?access_token=${encodeURIComponent(token)}`
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        scene,
        page,
        check_path: false,
        env_version: envVersion,
        // 视觉：金色 (D4AF37) 主题
        line_color: { r: 212, g: 175, b: 55 },
        is_hyaline: false,
        width: 280
      })
    })
    if (!r.ok) {
      throw new Error(`wxacode HTTP ${r.status}`)
    }
    const ct = r.headers.get('content-type') ?? ''
    // 成功时 content-type=image/jpeg；失败时返回 JSON 错误
    if (ct.includes('json')) {
      const err = await r.json().catch(() => ({}))
      const e = err as { errcode?: number; errmsg?: string }
      throw new Error(`wxacode err ${e.errcode}: ${e.errmsg}`)
    }
    const arrBuf = await r.arrayBuffer()
    return Buffer.from(arrBuf)
  }
}
