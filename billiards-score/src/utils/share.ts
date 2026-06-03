/**
 * 微信小程序分享卡片工具。
 *
 * 设计参考：`prd/share.md`
 *
 * 注意：
 * - imageUrl 为 weapp 内本地路径（dist 根开始），或 OSS https URL，或 ''/undefined
 *   留给微信自动截图首屏
 * - 联机比赛的 path 走 `pages/join/index?roomCode=...`（与扫码入口一致）
 * - 朋友圈用 `useShareTimeline` 时返回的是 `{ title, query, imageUrl }`，
 *   `query` 仅 query string 不含路径
 */

import type { MatchDetail } from '../core/api/match'

/**
 * 静态 logo 兜底图。复用现有 tab icon（81×81，金色风格），
 * 微信卡片会等比拉伸到 5:4 框内。后续美术给真 share-cover 再换。
 */
const FALLBACK_COVER = '/assets/tabs/home-active.png'

export interface ShareData {
  title: string
  path: string
  imageUrl?: string
}

export interface TimelineShareData {
  title: string
  query?: string
  imageUrl?: string
}

/* -------- 联机比赛 -------- */

export function buildMatchInviteShare(
  type: 'nine_ball' | 'eight_ball',
  roomCode: string
): ShareData {
  const label = type === 'nine_ball' ? '九球' : '中八'
  return {
    title: `${label}房间 ${roomCode}，进来记分？`,
    // join 页读 router.params.code，必须用 code= 命名，否则落地后还要手填房间码
    path: `/pages/join/index?code=${encodeURIComponent(roomCode)}`,
    // imageUrl 留空 → 微信自动截当前页面顶部 5:4 区域当卡片图。
    // 联机房间页中部就是「九球追分 + 房间码」big banner，比 81×81 tabbar logo 应景
    imageUrl: undefined
  }
}

/* -------- 球房 -------- */

interface VenueLite {
  id: string
  name: string
  city?: string | null
  coverImage?: string | null
}

export function buildVenueShare(v: VenueLite): ShareData {
  const subtitle = v.city ? `（${v.city}）` : ''
  return {
    title: `${v.name}${subtitle} · 已认证球房`,
    path: `/pages/venue-detail/index?id=${v.id}`,
    imageUrl: v.coverImage || FALLBACK_COVER
  }
}

export function buildVenueTimelineShare(v: VenueLite): TimelineShareData {
  const subtitle = v.city ? `（${v.city}）` : ''
  return {
    title: `${v.name}${subtitle} · 已认证球房`,
    query: `id=${v.id}`,
    imageUrl: v.coverImage || FALLBACK_COVER
  }
}

/* -------- 赛事 -------- */

interface TournamentLite {
  id: string
  /** 赛事标题，对应 server 端 TournamentItem.title 字段 */
  title: string
  status?: string
}

const STATUS_TEXT: Record<string, string> = {
  draft: '筹备中',
  registering: '正在报名',
  registration_closed: '报名截止',
  in_progress: '进行中',
  completed: '已结束',
  cancelled: '已取消'
}

export function buildTournamentShare(t: TournamentLite): ShareData {
  const status = STATUS_TEXT[t.status ?? ''] ?? ''
  const suffix = status ? ` · ${status}` : ''
  return {
    title: `${t.title}${suffix}`,
    path: `/pages/tournament-detail/index?id=${t.id}`,
    imageUrl: FALLBACK_COVER
  }
}

export function buildTournamentTimelineShare(t: TournamentLite): TimelineShareData {
  const status = STATUS_TEXT[t.status ?? ''] ?? ''
  const suffix = status ? ` · ${status}` : ''
  return {
    title: `${t.title}${suffix}`,
    query: `id=${t.id}`,
    imageUrl: FALLBACK_COVER
  }
}

/* -------- 战报（match-detail）-------- */

export function buildMatchReplayShare(d: MatchDetail): ShareData {
  const label = d.type === 'nine_ball' ? '九球' : '中八'
  // 取分数最高的玩家做摘要（多人场景下省得标题挤）
  const players = d.players
    .filter((p) => p.isCurrent)
    .map((p) => ({
      name: p.displayName,
      score: d.computed.scores?.[p.slot] ?? 0
    }))
    .sort((a, b) => b.score - a.score)

  let summary: string
  if (players.length === 2) {
    // 1v1：双方比分都展示
    summary = `${players[0].name} ${players[0].score}:${players[1].score} ${players[1].name}`
  } else if (players.length > 0) {
    // 多人：只展示榜首
    summary = `${players[0].name} 拿了第一`
  } else {
    summary = '一场精彩对决'
  }

  return {
    title: `击球帮战报 · ${label}：${summary}`,
    path: `/pages/match-detail/index?id=${d.id}`,
    imageUrl: FALLBACK_COVER
  }
}

/* -------- 首页 / 通用 -------- */

export function buildHomeShare(): ShareData {
  return {
    title: '击球帮 · 台球记分小程序',
    path: '/pages/index/index'
    // imageUrl 留空 → 微信自动截图首屏（首屏已是 logo + 入口卡片，效果不差）
  }
}

export function buildHomeTimelineShare(): TimelineShareData {
  return {
    title: '击球帮 · 台球记分小程序'
  }
}
