import { Injectable, Logger } from '@nestjs/common'
// @ts-expect-error ali-oss 没出 .d.ts；运行时 OK，给 any 即可
import OSS from 'ali-oss'
import { BusinessException, ErrorCode } from '../common/exceptions/business.exception'

/**
 * 服务端直传 OSS（用主 AccessKey）。
 *
 * 适用：
 *  - 文件较小（< 5 MB），server 中转无压力
 *  - 不需要走 STS（不暴露 AK 给前端）
 *
 * 不适用：
 *  - 大文件 / 高并发上传 → 用 OssStsService 让前端直传
 *
 * 与 OssStsService 区别：
 *  - 两者共用 OSS_BUCKET / OSS_REGION / OSS_ACCESS_KEY_ID / OSS_ACCESS_KEY_SECRET
 *  - OssStsService 走 STS:AssumeRole 签临时凭证给前端
 *  - 本服务直接用主 AK 在 server 内部 put
 */
@Injectable()
export class OssDirectService {
  private readonly logger = new Logger(OssDirectService.name)
  private client: OSS | null = null

  isEnabled(): boolean {
    return (process.env.OSS_ENABLED ?? '').toLowerCase() === 'true'
  }

  private getClient(): OSS {
    if (this.client) return this.client
    const region = process.env.OSS_REGION
    const accessKeyId = process.env.OSS_ACCESS_KEY_ID
    const accessKeySecret = process.env.OSS_ACCESS_KEY_SECRET
    const bucket = process.env.OSS_BUCKET
    if (!region || !accessKeyId || !accessKeySecret || !bucket) {
      throw new BusinessException(
        ErrorCode.INTERNAL_ERROR,
        'OSS 直传未配置完整的 OSS_REGION / OSS_ACCESS_KEY_ID / OSS_ACCESS_KEY_SECRET / OSS_BUCKET'
      )
    }
    this.client = new OSS({
      region,
      accessKeyId,
      accessKeySecret,
      bucket,
      // 自定义 endpoint（如 CNAME）有就用；否则 ali-oss 自己根据 region 拼默认 endpoint
      endpoint: process.env.OSS_ENDPOINT || undefined,
      cname: !!process.env.OSS_ENDPOINT,
      secure: true
    })
    return this.client
  }

  /**
   * 上传 Buffer 到 OSS。
   *
   * @param key OSS object key（如 `avatar/20260527/abc.png`），不要前导 `/`
   * @param buffer 文件内容
   * @param mime 用于设置 Content-Type / 浏览器直接渲染图片
   * @returns 完整 https URL（带 CNAME 时优先用 CNAME，否则 https://{bucket}.{region}.aliyuncs.com/{key}）
   */
  async putBuffer(key: string, buffer: Buffer, mime: string): Promise<string> {
    const client = this.getClient()
    try {
      const r = await client.put(key, buffer, {
        headers: {
          'Content-Type': mime,
          // 防止浏览器把 svg 等当成下载，强制 inline
          'Content-Disposition': 'inline'
        },
        // ali-oss 默认 1 分钟超时；图片应该秒传，给 30s 上限即可
        timeout: 30_000
      })
      return this.normalizeUrl(r.url, key)
    } catch (e) {
      this.logger.error(`OSS put 失败 key=${key}: ${(e as Error).message}`)
      throw new BusinessException(
        ErrorCode.INTERNAL_ERROR,
        '文件上传失败，请稍后再试'
      )
    }
  }

  /**
   * ali-oss 在某些 region 返回 http URL；统一兜底为 https。
   * CNAME 自定义域名走 process.env.OSS_ENDPOINT。
   */
  private normalizeUrl(rawUrl: string, key: string): string {
    if (process.env.OSS_ENDPOINT) {
      const base = process.env.OSS_ENDPOINT.replace(/\/$/, '')
      const proto = base.startsWith('http') ? '' : 'https://'
      return `${proto}${base}/${key}`
    }
    return rawUrl.replace(/^http:\/\//, 'https://')
  }
}
