/**
 * 一次性脚本：用腾讯地图正向解析回填老 venue 的 province/city/district/lat/lng。
 *
 * 用法：
 *   cd server && npx ts-node scripts/backfill-venue-city.ts            # dry-run
 *   cd server && npx ts-node scripts/backfill-venue-city.ts --apply    # 真写库
 *
 * 选取条件：province / city / district / lat / lng 任一为 null
 * 单次更新只覆盖原本为 null 的字段，不会覆盖已有人工值
 *
 * 依赖：.env 里 TENCENT_MAP_KEY / TENCENT_MAP_SK 必须配齐
 */
import 'dotenv/config'
import { createHash } from 'node:crypto'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const TENCENT_KEY = process.env.TENCENT_MAP_KEY ?? ''
const TENCENT_SK = process.env.TENCENT_MAP_SK ?? ''
const APPLY = process.argv.includes('--apply')
const SLEEP_MS = 200

interface Resolution {
  city: string | null
  province: string | null
  lat: number | null
  lng: number | null
}

function buildSignedUrl(path: string, params: Record<string, string>): string {
  const sortedKeys = Object.keys(params).sort()
  const queryStr = sortedKeys.map((k) => `${k}=${params[k]}`).join('&')
  const base = `https://apis.map.qq.com${path}?${queryStr}`
  if (!TENCENT_SK) return base
  const sig = createHash('md5').update(`${path}?${queryStr}${TENCENT_SK}`).digest('hex')
  return `${base}&sig=${sig}`
}

async function geocode(address: string): Promise<Resolution> {
  if (!TENCENT_KEY) {
    return { city: null, province: null, lat: null, lng: null }
  }
  const url = buildSignedUrl('/ws/geocoder/v1/', {
    address,
    key: TENCENT_KEY
  })
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 5000)
    const resp = await fetch(url, { signal: ctrl.signal })
    clearTimeout(timer)
    if (!resp.ok) {
      console.warn(`[geocode] HTTP ${resp.status} for: ${address}`)
      return { city: null, province: null, lat: null, lng: null }
    }
    const json = (await resp.json()) as {
      status?: number
      message?: string
      result?: {
        location?: { lat?: number; lng?: number }
        ad_info?: { city?: string; province?: string }
        address_components?: { province?: string; city?: string }
      }
    }
    if (json.status !== 0) {
      console.warn(
        `[geocode] status=${json.status} msg=${json.message} address=${address}`
      )
      return { city: null, province: null, lat: null, lng: null }
    }
    const r = json.result ?? {}
    return {
      city: r.ad_info?.city ?? r.address_components?.city ?? null,
      province: r.ad_info?.province ?? r.address_components?.province ?? null,
      lat: r.location?.lat ?? null,
      lng: r.location?.lng ?? null
    }
  } catch (err) {
    console.warn(`[geocode] error: ${(err as Error).message}`)
    return { city: null, province: null, lat: null, lng: null }
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function main() {
  if (!TENCENT_KEY) {
    console.error('TENCENT_MAP_KEY 未配置，退出')
    process.exit(1)
  }
  console.log(`[backfill] mode = ${APPLY ? 'APPLY' : 'DRY-RUN'}`)

  const targets = await prisma.venue.findMany({
    where: {
      OR: [
        { province: null },
        { city: null },
        { district: null },
        { lat: null },
        { lng: null }
      ]
    },
    select: {
      id: true,
      name: true,
      province: true,
      city: true,
      district: true,
      address: true,
      lat: true,
      lng: true
    }
  })
  console.log(`[backfill] 待处理 ${targets.length} 条`)

  let okCount = 0
  let failCount = 0

  for (const v of targets) {
    // 拼上已知的省/市/区给腾讯，提高解析准确度
    const fullAddress = `${v.province ?? ''}${v.city ?? ''}${v.district ?? ''}${v.address}`
    const geo = await geocode(fullAddress)
    if (geo.city || geo.lat != null) {
      okCount++
      console.log(
        `  ✓ ${v.id} ${v.name} → ${geo.province} / ${geo.city} (${geo.lat},${geo.lng})`
      )
      if (APPLY) {
        // 只覆盖原本为 null 的字段
        await prisma.venue.update({
          where: { id: v.id },
          data: {
            province: v.province ?? geo.province,
            city: v.city ?? geo.city,
            // district 腾讯不直接给，留 null 让 admin/商家自己改
            lat: v.lat ?? geo.lat,
            lng: v.lng ?? geo.lng
          }
        })
      }
    } else {
      failCount++
      console.log(`  ✗ ${v.id} ${v.name} → 无法解析（地址：${fullAddress}）`)
    }
    await sleep(SLEEP_MS)
  }

  console.log(
    `[backfill] 完成。成功 ${okCount} 条 / 失败 ${failCount} 条 / 总 ${targets.length} 条`
  )
  if (!APPLY && okCount > 0) {
    console.log('[backfill] 当前为 DRY-RUN，加 --apply 才真正写库')
  }
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
