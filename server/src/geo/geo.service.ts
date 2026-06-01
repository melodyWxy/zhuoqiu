import { createHash } from 'node:crypto'
import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { AppConfig } from '../config/configuration'

export interface CityResolution {
  city: string | null
  province: string | null
}

export interface AddressResolution extends CityResolution {
  lat: number | null
  lng: number | null
}

interface CacheEntry {
  value: CityResolution
  expiresAt: number
}

const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 天
const CACHE_MAX_SIZE = 50_000 // 防内存爆炸；超过后按 FIFO 丢最早的

/**
 * 服务端地理能力封装。
 *
 * MVP 用进程内 Map 做网格缓存（lat/lng 取 0.01° 网格 ≈ 1km），
 * 多实例部署会各自缓存，等真上量了再换 Redis。
 *
 * 腾讯地图配额耗尽 / key 未配 / 请求异常时，统一返回 city = null，
 * 让前端降级到手选城市，不阻塞主流程。
 */
@Injectable()
export class GeoService {
  private readonly logger = new Logger(GeoService.name)
  private readonly cache = new Map<string, CacheEntry>()

  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  async resolveCity(lat: number, lng: number): Promise<CityResolution> {
    const key = this.gridKey(lat, lng)
    const cached = this.cache.get(key)
    const now = Date.now()
    if (cached && cached.expiresAt > now) {
      return cached.value
    }
    if (cached) this.cache.delete(key)

    const value = await this.callTencentReverseGeocoder(lat, lng)
    this.put(key, value, now)
    return value
  }

  /**
   * 正向地理编码：地址（"济南市历下区..."）→ {lat, lng, city, province}。
   * 用于 venue 入库 / 改地址时填充地理信息。
   * 不缓存：每个 venue 地址通常只查一次，且不同地址命中相同结果概率低。
   */
  async resolveAddress(address: string): Promise<AddressResolution> {
    const trimmed = address.trim()
    if (!trimmed) return { lat: null, lng: null, city: null, province: null }
    return this.callTencentForwardGeocoder(trimmed)
  }

  /** 以 0.01° 网格（约 1km）作为缓存 key，相邻请求共享结果。 */
  private gridKey(lat: number, lng: number): string {
    const round = (n: number) => Math.round(n * 100) / 100
    return `${round(lat)},${round(lng)}`
  }

  /**
   * 腾讯地图 WebService「签名校验」鉴权：
   * 1. 取请求 path + 按 key 字典序排好的 query → `path?k1=v1&k2=v2...`
   * 2. 末尾拼上 SK → 整串做 MD5 → `sig`
   * 3. 把 `sig` 追加到真实请求 URL 末尾
   * SK 缺失时退化为「裸 key」鉴权（控制台必须选 IP 白名单或域名白名单才会通）。
   */
  private buildSignedUrl(path: string, params: Record<string, string>): string {
    const sortedKeys = Object.keys(params).sort()
    const queryStr = sortedKeys.map((k) => `${k}=${params[k]}`).join('&')
    const sk = this.config.get('tencentMap.sk', { infer: true })
    const base = `https://apis.map.qq.com${path}?${queryStr}`
    if (!sk) return base
    const sig = createHash('md5').update(`${path}?${queryStr}${sk}`).digest('hex')
    return `${base}&sig=${sig}`
  }

  private put(key: string, value: CityResolution, now: number) {
    if (this.cache.size >= CACHE_MAX_SIZE) {
      const oldest = this.cache.keys().next().value
      if (oldest) this.cache.delete(oldest)
    }
    this.cache.set(key, { value, expiresAt: now + CACHE_TTL_MS })
  }

  private async callTencentReverseGeocoder(
    lat: number,
    lng: number
  ): Promise<CityResolution> {
    const apiKey = this.config.get('tencentMap.key', { infer: true })
    if (!apiKey) {
      this.logger.warn('TENCENT_MAP_KEY 未配置，跳过逆地址解析')
      return { city: null, province: null }
    }

    const url = this.buildSignedUrl('/ws/geocoder/v1/', {
      location: `${lat},${lng}`,
      key: apiKey,
      get_poi: '0'
    })

    try {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), 5000)
      const resp = await fetch(url, { signal: ctrl.signal })
      clearTimeout(timer)

      if (!resp.ok) {
        this.logger.warn(`腾讯地图 HTTP ${resp.status}`)
        return { city: null, province: null }
      }

      const json = (await resp.json()) as {
        status?: number
        message?: string
        result?: {
          ad_info?: { province?: string; city?: string }
        }
      }

      if (json.status !== 0) {
        this.logger.warn(
          `腾讯地图返回错误 status=${json.status} msg=${json.message}`
        )
        return { city: null, province: null }
      }

      const ad = json.result?.ad_info ?? {}
      return {
        city: ad.city ?? null,
        province: ad.province ?? null
      }
    } catch (err) {
      this.logger.warn(`腾讯地图请求失败: ${(err as Error).message}`)
      return { city: null, province: null }
    }
  }

  private async callTencentForwardGeocoder(
    address: string
  ): Promise<AddressResolution> {
    const apiKey = this.config.get('tencentMap.key', { infer: true })
    if (!apiKey) {
      this.logger.warn('TENCENT_MAP_KEY 未配置，跳过正向地理编码')
      return { lat: null, lng: null, city: null, province: null }
    }

    const url = this.buildSignedUrl('/ws/geocoder/v1/', {
      address,
      key: apiKey
    })

    try {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), 5000)
      const resp = await fetch(url, { signal: ctrl.signal })
      clearTimeout(timer)

      if (!resp.ok) {
        this.logger.warn(`腾讯地图 HTTP ${resp.status}`)
        return { lat: null, lng: null, city: null, province: null }
      }

      const json = (await resp.json()) as {
        status?: number
        message?: string
        result?: {
          location?: { lat?: number; lng?: number }
          address_components?: { province?: string; city?: string }
          ad_info?: { city?: string; province?: string }
        }
      }

      if (json.status !== 0) {
        this.logger.warn(
          `腾讯地图正向解析错误 status=${json.status} msg=${json.message} address=${address}`
        )
        return { lat: null, lng: null, city: null, province: null }
      }

      const r = json.result ?? {}
      // 优先 ad_info（标准化后的「市级」），address_components 兜底
      const province = r.ad_info?.province ?? r.address_components?.province ?? null
      const city = r.ad_info?.city ?? r.address_components?.city ?? null
      const lat = r.location?.lat ?? null
      const lng = r.location?.lng ?? null
      return { lat, lng, city, province }
    } catch (err) {
      this.logger.warn(`腾讯地图正向请求失败: ${(err as Error).message}`)
      return { lat: null, lng: null, city: null, province: null }
    }
  }
}
