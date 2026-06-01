import { createHash } from 'node:crypto'
import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { AppConfig } from '../config/configuration'

export interface RegionNode {
  /** 6 位行政区划代码，如「110000」「110100」「110101」 */
  code: string
  /** 展示名（取腾讯 fullname 优先，回落 name） */
  name: string
  children?: RegionNode[]
}

interface CacheEntry {
  tree: RegionNode[]
  fetchedAt: number
}

const TTL_MS = 24 * 60 * 60 * 1000 // 24 小时
const STALE_OK_MS = 7 * 24 * 60 * 60 * 1000 // 拉新失败时，1 周内的旧缓存仍可用

/**
 * 全国省/市/区行政区划树。
 *
 * 调腾讯地图 `/ws/district/v1/list`，返回结构是「分层级 + cidx 索引」的扁平数组，
 * 这里转成嵌套树后缓存。新鲜数据 24h 过期；过期但 < 1 周时拉新失败仍兜底返回旧值，
 * 避免单点抖动让 c 端 / admin 入驻流程整个挂掉。
 */
@Injectable()
export class RegionsService {
  private readonly logger = new Logger(RegionsService.name)
  private cache: CacheEntry | null = null
  private inflight: Promise<RegionNode[]> | null = null

  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  async getTree(): Promise<RegionNode[]> {
    const now = Date.now()
    if (this.cache && now - this.cache.fetchedAt < TTL_MS) {
      return this.cache.tree
    }
    // 并发请求合并：第一个进来的去拉，其他人等结果
    if (!this.inflight) {
      this.inflight = this.fetchAndCache(now).finally(() => {
        this.inflight = null
      })
    }
    try {
      return await this.inflight
    } catch (err) {
      // 拉新失败但有「过期但还能用」的旧缓存 → 用旧的
      if (this.cache && now - this.cache.fetchedAt < STALE_OK_MS) {
        this.logger.warn(
          `regions 拉新失败，回退到 ${Math.round((now - this.cache.fetchedAt) / 3600_000)}h 前的旧缓存：${(err as Error).message}`
        )
        return this.cache.tree
      }
      throw err
    }
  }

  private async fetchAndCache(now: number): Promise<RegionNode[]> {
    const tree = await this.fetchFromTencent()
    this.cache = { tree, fetchedAt: now }
    this.logger.log(`regions 缓存刷新成功，省级 ${tree.length} 条`)
    return tree
  }

  private async fetchFromTencent(): Promise<RegionNode[]> {
    const apiKey = this.config.get('tencentMap.key', { infer: true })
    if (!apiKey) {
      throw new Error('TENCENT_MAP_KEY 未配置')
    }
    const url = this.buildSignedUrl('/ws/district/v1/list', { key: apiKey })

    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 8000)
    let resp: Response
    try {
      resp = await fetch(url, { signal: ctrl.signal })
    } finally {
      clearTimeout(timer)
    }
    if (!resp.ok) {
      throw new Error(`tencent district HTTP ${resp.status}`)
    }
    const json = (await resp.json()) as {
      status?: number
      message?: string
      result?: TencentDistrictItem[][]
    }
    if (json.status !== 0) {
      throw new Error(
        `tencent district status=${json.status} msg=${json.message}`
      )
    }
    const layers = json.result ?? []
    return buildTree(layers)
  }

  private buildSignedUrl(path: string, params: Record<string, string>): string {
    const sortedKeys = Object.keys(params).sort()
    const queryStr = sortedKeys.map((k) => `${k}=${params[k]}`).join('&')
    const sk = this.config.get('tencentMap.sk', { infer: true })
    const base = `https://apis.map.qq.com${path}?${queryStr}`
    if (!sk) return base
    const sig = createHash('md5').update(`${path}?${queryStr}${sk}`).digest('hex')
    return `${base}&sig=${sig}`
  }
}

interface TencentDistrictItem {
  id: string
  /** 短名（如「济南」），区级项可能没有 */
  name?: string
  /** 全称（如「济南市」），区级项一定有 */
  fullname?: string
  /**
   * 子节点在「下一层」数组里的 [起, 止] 索引，闭区间。
   * 直辖市的 layer-1 children 直接就是区，layer-2 不会有它们。
   */
  cidx?: [number, number]
}

const displayName = (it: TencentDistrictItem): string =>
  it.fullname ?? it.name ?? it.id

/**
 * 把腾讯返回的「分层 + cidx」结构转成统一三级嵌套树。
 *
 * 关键处理：腾讯接口对**直辖市**只返回两层（省 → 区），普通省返回三层（省 → 市 → 区）。
 * 这里把直辖市补一层「市级镜像」，让前后端 cascader 都看到一致的三级结构。
 */
function buildTree(layers: TencentDistrictItem[][]): RegionNode[] {
  if (layers.length === 0) return []
  return layers[0].map((p) => buildProvinceNode(p, layers))
}

function buildProvinceNode(
  p: TencentDistrictItem,
  layers: TencentDistrictItem[][]
): RegionNode {
  const node: RegionNode = { code: p.id, name: displayName(p) }
  const layer1 = layers[1]
  if (!p.cidx || !layer1) return node

  const [start, end] = p.cidx
  const direct: TencentDistrictItem[] = []
  for (let i = start; i <= end && i < layer1.length; i++) {
    direct.push(layer1[i])
  }
  if (direct.length === 0) return node

  // 直辖市判定：行政区划码后 4 位非「00」就是区级（如 110101 东城区）
  // 普通省的 layer-1 是市级，码后 4 位都是「00」（如 370100 济南市）
  const isMunicipality = direct.every((c) => !c.id.endsWith('00'))

  if (isMunicipality) {
    const districts: RegionNode[] = direct.map((d) => ({
      code: d.id,
      name: displayName(d)
    }))
    node.children = [
      {
        code: p.id,
        name: displayName(p),
        children: districts
      }
    ]
    return node
  }

  const layer2 = layers[2] ?? []
  node.children = direct.map((cityItem) => {
    const cityNode: RegionNode = {
      code: cityItem.id,
      name: displayName(cityItem)
    }
    if (cityItem.cidx) {
      const [s, e] = cityItem.cidx
      const districts: RegionNode[] = []
      for (let i = s; i <= e && i < layer2.length; i++) {
        const d = layer2[i]
        districts.push({ code: d.id, name: displayName(d) })
      }
      if (districts.length > 0) cityNode.children = districts
    }
    return cityNode
  })
  return node
}
