import Taro from '@tarojs/taro'
import { API_BASE_URL } from './config'
import { callVenueApi } from './venue-client'
import { callApi } from './client'

export interface VenueApplicationPayload {
  name: string
  contactName: string
  contactPhone: string
  address: string
  tablesCount: number
  openHours: Array<{ day: string; hours: string }>
  description?: string
}

export interface VenueApplicationItem {
  id: string
  applicantAccountId: string
  source: 'c_app' | 'admin_web'
  payloadJson: VenueApplicationPayload
  licenseImage: string | null
  idCardImage: string | null
  status: 'draft' | 'pending' | 'approved' | 'rejected'
  rejectReason: string | null
  reviewedByAdminId: string | null
  reviewedAt: string | null
  venueId: string | null
  createdAt: string
  updatedAt: string
}

export interface VenueMe {
  account: {
    id: string
    phoneNumber: string
    nickname: string
    role: 'owner' | 'staff'
    status: string
    venueId: string | null
  } | null
  venue: {
    id: string
    name: string
    address: string
    status: string
    tablesCount: number
  } | null
  client: string
}

export const venueAuthApi = {
  sendSms: (phoneNumber: string) =>
    callApi<{ sentAt: string; expiresInSec: number; devHint: string | null }>(
      '/venue-auth/sms/send',
      { method: 'POST', data: { phoneNumber }, auth: false }
    ),

  verify: (params: { phoneNumber: string; code: string; nickname?: string }) =>
    callApi<{
      accessToken: string
      refreshToken: string
      expiresIn: number
      account: {
        id: string
        phoneNumber: string
        nickname: string
        role: 'owner' | 'staff'
        venueId: string | null
      }
      client: 'c_app'
    }>('/venue-auth/sms/verify', {
      method: 'POST',
      data: { ...params, client: 'c_app' },
      auth: false
    }),

  me: () => callVenueApi<VenueMe>('/venue-auth/me', { toast: false }),

  logout: () => callVenueApi('/venue-auth/logout', { method: 'POST' })
}

export interface VenuePublic {
  id: string
  name: string
  slug: string | null
  address: string
  phone: string
  coverImage: string | null
  tablesCount: number
  openHoursJson: Record<string, string> | null
  description: string | null
  status: string
  createdAt: string
}

/** 公共球房发现接口，匿名可访问 */
export const venuesPublicApi = {
  list: (params: { keyword?: string; page?: number; pageSize?: number } = {}) => {
    const q = new URLSearchParams()
    if (params.keyword) q.set('keyword', params.keyword)
    if (params.page) q.set('page', String(params.page))
    if (params.pageSize) q.set('pageSize', String(params.pageSize))
    const qs = q.toString()
    return callApi<{
      items: VenuePublic[]
      total: number
      page: number
      pageSize: number
    }>(`/venues${qs ? `?${qs}` : ''}`, { auth: false, toast: false })
  },

  detail: (id: string) =>
    callApi<{ venue: VenuePublic }>(`/venues/${id}`, {
      auth: false,
      toast: false
    })
}

// ============ 赛事（C 端） ============

export type TournamentStatus =
  | 'draft'
  | 'registering'
  | 'registration_closed'
  | 'in_progress'
  | 'completed'
  | 'cancelled'

export interface TournamentItem {
  id: string
  venueId: string
  title: string
  gameType: 'nine_ball' | 'eight_ball'
  format: 'single_elim' | 'double_elim' | 'round_robin' | 'swiss'
  rulesJson: Record<string, number>
  maxPlayers: number
  minPlayers: number
  entryFeeCents: number
  prizePoolText: string | null
  registrationStartsAt: string
  registrationEndsAt: string
  matchStartsAt: string
  coverImage: string | null
  status: TournamentStatus
  registeredCount: number
  createdAt: string
  updatedAt: string
}

export interface TournamentDetailPublic extends TournamentItem {
  venue: {
    id: string
    name: string
    address: string
    coverImage: string | null
  } | null
  noticeText: string | null
}

export interface TournamentRegPublic {
  id: string
  displayName: string
  registeredAt: string
  seed: number | null
}

export interface MyRegistration {
  id: string
  tournamentId: string
  status: 'confirmed' | 'withdrawn' | 'disqualified'
  displayName: string
  seed: number | null
  registeredAt: string
}

export interface BracketPlayerRef {
  id: string
  displayName: string
  seed: number | null
  userId: string
}

export interface BracketMatchItem {
  id: string
  tournamentId: string
  round: number
  slotInRound: number
  playerARegistrationId: string | null
  playerBRegistrationId: string | null
  playerA: BracketPlayerRef | null
  playerB: BracketPlayerRef | null
  winnerRegistrationId: string | null
  winner: BracketPlayerRef | null
  matchId: string | null
  status: 'pending' | 'ready' | 'in_progress' | 'completed' | 'walkover'
  scheduledAt: string | null
}

export interface BracketTree {
  tournamentId: string
  status: string
  totalRounds: number
  rounds: Array<{ round: number; matches: BracketMatchItem[] }>
}

export const tournamentsPublicApi = {
  list: (params: {
    venueId?: string
    status?: TournamentStatus
    page?: number
    pageSize?: number
  } = {}) => {
    const q = new URLSearchParams()
    if (params.venueId) q.set('venueId', params.venueId)
    if (params.status) q.set('status', params.status)
    if (params.page) q.set('page', String(params.page))
    if (params.pageSize) q.set('pageSize', String(params.pageSize))
    const qs = q.toString()
    return callApi<{
      items: TournamentItem[]
      total: number
      page: number
      pageSize: number
    }>(`/tournaments${qs ? `?${qs}` : ''}`, { auth: false, toast: false })
  },

  detail: (id: string) =>
    callApi<TournamentDetailPublic>(`/tournaments/${id}`, {
      auth: false,
      toast: false
    }),

  registrations: (id: string) =>
    callApi<{ items: TournamentRegPublic[]; total: number }>(
      `/tournaments/${id}/registrations`,
      { auth: false, toast: false }
    ),

  register: (id: string, displayName?: string) =>
    callApi<{ registration: MyRegistration }>(`/tournaments/${id}/register`, {
      method: 'POST',
      data: displayName ? { displayName } : {}
    }),

  withdraw: (id: string) =>
    callApi<{ registration: MyRegistration }>(`/tournaments/${id}/withdraw`, {
      method: 'POST'
    }),

  myRegistration: (id: string) =>
    callApi<{ registration: MyRegistration | null }>(
      `/tournaments/${id}/my-registration`,
      { toast: false }
    ),

  myTournaments: () =>
    callApi<{
      items: Array<{
        registrationId: string
        registrationStatus: 'confirmed' | 'withdrawn' | 'disqualified'
        seed: number | null
        registeredAt: string
        tournament: TournamentItem
      }>
      total: number
    }>(`/me/tournaments`, { toast: false }),

  bracket: (id: string) =>
    callApi<BracketTree>(`/tournaments/${id}/bracket`, {
      auth: false,
      toast: false
    })
}

export const venueApplicationApi = {
  submit: (params: {
    payload: VenueApplicationPayload
    licenseImage: string
    idCardImage?: string
  }) =>
    callVenueApi<{ application: VenueApplicationItem }>(
      '/venue/applications',
      { method: 'POST', data: params }
    ),

  mine: () =>
    callVenueApi<{ application: VenueApplicationItem | null }>(
      '/venue/applications/mine',
      { toast: false }
    )
}

interface StsToken {
  region: string
  bucket: string
  endpoint: string | null
  accessKeyId: string
  accessKeySecret: string
  securityToken: string
  expiration: string
  objectKeyPrefix: string
  expiresInSec: number
}

let cachedToken: (StsToken & { category: string; expireAt: number }) | null = null

async function fetchStsToken(category: string, accessToken: string): Promise<StsToken> {
  const now = Date.now()
  if (
    cachedToken &&
    cachedToken.category === category &&
    cachedToken.expireAt - now > 60_000
  ) {
    return cachedToken
  }
  const r = await Taro.request<{ code: number; data?: StsToken; message?: string }>({
    url: `${API_BASE_URL}/uploads/sts-token?category=${encodeURIComponent(category)}`,
    method: 'GET',
    header: { Authorization: `Bearer ${accessToken}` }
  })
  if (r.statusCode !== 200 || r.data.code !== 0 || !r.data.data) {
    throw new Error(r.data.message ?? '获取上传凭证失败')
  }
  const tok = r.data.data
  cachedToken = {
    ...tok,
    category,
    expireAt: new Date(tok.expiration).getTime()
  }
  return tok
}

function extOfPath(path: string): string {
  const slashed = path.split('?')[0]
  const i = slashed.lastIndexOf('.')
  return i >= 0 ? slashed.slice(i).toLowerCase() : ''
}

function randomHex(len = 16): string {
  const arr = new Uint8Array(len)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(arr)
  } else {
    for (let i = 0; i < len; i++) arr[i] = Math.floor(Math.random() * 256)
  }
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * H5 端文件直传 OSS：
 *   1) GET /uploads/sts-token 拿 900s 临时凭证
 *   2) 从 Taro.chooseImage 给的 blob: / 本地路径 fetch 出 Blob
 *   3) 用 ali-oss JS SDK put 到 {prefix}/{random}{ext}
 *
 * 非 H5 端（小程序）暂不支持（要用 uni-upload 或自己签名 formAliyun）。
 */
export async function uploadVenueFile(
  filePath: string,
  category: string,
  token: string
): Promise<{ url: string; path: string }> {
  if (typeof window === 'undefined' || typeof fetch === 'undefined') {
    throw new Error('当前环境暂不支持 OSS 直传（小程序端待接入）')
  }
  const sts = await fetchStsToken(category, token)
  const blob = await fetch(filePath).then((r) => r.blob())
  const OSS = (await import('ali-oss')).default
  const client = new OSS({
    region: sts.region,
    accessKeyId: sts.accessKeyId,
    accessKeySecret: sts.accessKeySecret,
    stsToken: sts.securityToken,
    bucket: sts.bucket,
    endpoint: sts.endpoint ?? undefined,
    secure: true
  })
  const objectKey = `${sts.objectKeyPrefix}/${randomHex()}${extOfPath(filePath) || '.jpg'}`
  const res = await client.put(objectKey, blob)
  return { url: res.url, path: objectKey }
}
