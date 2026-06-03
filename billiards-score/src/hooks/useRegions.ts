import { useEffect, useState } from 'react'
import Taro from '@tarojs/taro'
import { regionsApi, type RegionNode } from '../core/api/venue'

const STORAGE_KEY = 'regions:v1'
const STORAGE_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 天

interface CachedShape {
  tree: RegionNode[]
  fetchedAt: number
}

/**
 * 拉全国省市区树。优先读本地缓存（7 天），过期或没有则请求服务端。
 * 任何异常 → 返回空数组，让 UI 自行降级到「该地区暂时无法选择，请稍后重试」。
 */
export function useRegions() {
  const [tree, setTree] = useState<RegionNode[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const cached = readCache()
        if (cached) {
          if (!cancelled) {
            setTree(cached)
            setLoading(false)
          }
          return
        }
        const r = await regionsApi.list()
        if (cancelled) return
        setTree(r.tree)
        writeCache(r.tree)
      } catch {
        if (!cancelled) setTree([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return { tree, loading }
}

function readCache(): RegionNode[] | null {
  try {
    const raw = Taro.getStorageSync(STORAGE_KEY) as CachedShape | string | null
    if (!raw || typeof raw === 'string') return null
    if (Date.now() - raw.fetchedAt > STORAGE_TTL_MS) return null
    return raw.tree
  } catch {
    return null
  }
}

function writeCache(tree: RegionNode[]) {
  try {
    Taro.setStorageSync(STORAGE_KEY, {
      tree,
      fetchedAt: Date.now()
    } satisfies CachedShape)
  } catch {
    // ignore
  }
}
