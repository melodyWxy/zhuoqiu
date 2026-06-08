import { venueHttp } from './venue-client'
import type {
  VenueApplicationItem,
  VenueApplicationPayload
} from './venues'

export const venueAuthApi = {
  sendSms: (phoneNumber: string) =>
    venueHttp
      .post<{ sentAt: string; expiresInSec: number; devHint: string | null }>(
        '/venue-auth/sms/send',
        { phoneNumber }
      )
      .then((r) => r.data),

  verify: (params: {
    phoneNumber: string
    code: string
    nickname?: string
  }) =>
    venueHttp
      .post<{
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
        client: 'admin_web'
      }>('/venue-auth/sms/verify', { ...params, client: 'admin_web' })
      .then((r) => r.data),

  me: () =>
    venueHttp
      .get<{
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
          province: string | null
          city: string | null
          district: string | null
          address: string
          status: string
          tablesCount: number
        } | null
        client: string
      }>('/venue-auth/me')
      .then((r) => r.data),

  logout: () => venueHttp.post('/venue-auth/logout').then((r) => r.data)
}

export const venueApplicationApi = {
  submit: (params: {
    payload: VenueApplicationPayload
    licenseImage: string
    idCardImage?: string
  }) =>
    venueHttp
      .post<{ application: VenueApplicationItem }>(
        '/venue/applications',
        params
      )
      .then((r) => r.data),

  mine: () =>
    venueHttp
      .get<{ application: VenueApplicationItem | null }>(
        '/venue/applications/mine'
      )
      .then((r) => r.data)
}

export interface VenuePublic {
  id: string
  name: string
  slug: string | null
  province: string | null
  city: string | null
  district: string | null
  address: string
  lat: number | null
  lng: number | null
  phone: string
  coverImage: string | null
  tablesCount: number
  openHoursJson: Record<string, string> | null
  description: string | null
  status: string
  createdAt: string
}

export interface UpdateVenuePayload {
  name?: string
  province?: string
  city?: string
  district?: string
  address?: string
  phone?: string
  coverImage?: string | null
  tablesCount?: number
  openHours?: Array<{ day: string; hours: string }>
  description?: string
}

export const venueMyApi = {
  update: (patch: UpdateVenuePayload) =>
    venueHttp
      .patch<{ venue: VenuePublic }>('/venue/me/venue', patch)
      .then((r) => r.data as unknown as { venue: VenuePublic })
}

// ============ 赛事（商家 + 公共） ============

export type TournamentStatus =
  | 'draft'
  | 'registering'
  | 'registration_closed'
  | 'in_progress'
  | 'completed'
  | 'cancelled'

export type TournamentFormat =
  | 'single_elim'
  | 'double_elim'
  | 'round_robin'
  | 'swiss'

export interface TournamentItem {
  id: string
  venueId: string
  title: string
  gameType: 'nine_ball' | 'eight_ball'
  format: TournamentFormat
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

export interface TournamentRegistrationItem {
  id: string
  tournamentId: string
  userId: string
  displayName: string
  phone: string
  seed: number | null
  status: 'confirmed' | 'withdrawn' | 'disqualified'
  registeredAt: string
}

export interface CreateTournamentPayload {
  title: string
  gameType: 'nine_ball' | 'eight_ball'
  format: TournamentFormat
  rules: Record<string, number>
  maxPlayers: number
  minPlayers: number
  entryFeeCents?: number
  prizePoolText?: string
  registrationStartsAt: string
  registrationEndsAt: string
  matchStartsAt: string
  coverImage?: string
  noticeText?: string
}

export type UpdateTournamentPayload = Partial<CreateTournamentPayload>

export type BracketMatchStatus =
  | 'pending'
  | 'ready'
  | 'in_progress'
  | 'completed'
  | 'walkover'

export interface BracketPlayerRef {
  id: string
  displayName: string
  seed: number | null
  userId: string
}

export type BracketGroup = 'winners' | 'losers' | 'grand_final'

export interface BracketMatchItem {
  id: string
  tournamentId: string
  bracketGroup: BracketGroup
  round: number
  slotInRound: number
  playerARegistrationId: string | null
  playerBRegistrationId: string | null
  playerA: BracketPlayerRef | null
  playerB: BracketPlayerRef | null
  winnerRegistrationId: string | null
  winner: BracketPlayerRef | null
  matchId: string | null
  status: BracketMatchStatus
  scheduledAt: string | null
}

interface BracketRoundGroup {
  round: number
  matches: BracketMatchItem[]
}

export interface BracketTree {
  tournamentId: string
  status: string
  format?: TournamentFormat
  totalRounds: number
  /** 向后兼容 = 胜者组（单败时即全部对阵） */
  rounds: BracketRoundGroup[]
  /** 双败：胜者组 / 败者组 / 总决赛（含决胜局）。单败时 losers/grandFinal 为空 */
  winners?: BracketRoundGroup[]
  losers?: BracketRoundGroup[]
  grandFinal?: BracketMatchItem[]
}

export const tournamentMerchantApi = {
  list: (params: { status?: TournamentStatus; page?: number; pageSize?: number } = {}) =>
    venueHttp
      .get<{
        items: TournamentItem[]
        total: number
        page: number
        pageSize: number
      }>('/venue/tournaments', { params })
      .then((r) => r.data as unknown as {
        items: TournamentItem[]
        total: number
        page: number
        pageSize: number
      }),

  create: (payload: CreateTournamentPayload) =>
    venueHttp
      .post<{ tournament: TournamentItem }>('/venue/tournaments', payload)
      .then((r) => r.data as unknown as { tournament: TournamentItem }),

  detail: (id: string) =>
    venueHttp
      .get<{ tournament: TournamentItem }>(`/venue/tournaments/${id}`)
      .then((r) => r.data as unknown as { tournament: TournamentItem }),

  update: (id: string, patch: UpdateTournamentPayload) =>
    venueHttp
      .patch<{ tournament: TournamentItem }>(`/venue/tournaments/${id}`, patch)
      .then((r) => r.data as unknown as { tournament: TournamentItem }),

  publish: (id: string) =>
    venueHttp
      .post<{ tournament: TournamentItem }>(`/venue/tournaments/${id}/publish`)
      .then((r) => r.data as unknown as { tournament: TournamentItem }),

  cancel: (id: string) =>
    venueHttp
      .post<{ tournament: TournamentItem }>(`/venue/tournaments/${id}/cancel`)
      .then((r) => r.data as unknown as { tournament: TournamentItem }),

  closeRegistration: (id: string) =>
    venueHttp
      .post<{ tournament: TournamentItem }>(
        `/venue/tournaments/${id}/close-registration`
      )
      .then((r) => r.data as unknown as { tournament: TournamentItem }),

  registrations: (id: string, showWithdrawn = false) =>
    venueHttp
      .get<{ items: TournamentRegistrationItem[]; total: number }>(
        `/venue/tournaments/${id}/registrations`,
        { params: { showWithdrawn: showWithdrawn ? 'true' : undefined } }
      )
      .then((r) => r.data as unknown as {
        items: TournamentRegistrationItem[]
        total: number
      }),

  kick: (id: string, regId: string) =>
    venueHttp
      .post<{ registration: TournamentRegistrationItem }>(
        `/venue/tournaments/${id}/registrations/${regId}/kick`
      )
      .then((r) => r.data),

  start: (id: string) =>
    venueHttp
      .post<{ tournament: TournamentItem }>(`/venue/tournaments/${id}/start`)
      .then((r) => r.data as unknown as { tournament: TournamentItem }),

  bracket: (id: string) =>
    venueHttp
      .get<BracketTree>(`/venue/tournaments/${id}/bracket`)
      .then((r) => r.data as unknown as BracketTree),

  startBracketMatch: (id: string, bmId: string) =>
    venueHttp
      .post<{ matchId: string; code: string; bracketMatchId: string }>(
        `/venue/tournaments/${id}/bracket/${bmId}/start`
      )
      .then((r) => r.data as unknown as {
        matchId: string
        code: string
        bracketMatchId: string
      }),

  walkover: (id: string, bmId: string, winnerSide: 'A' | 'B') =>
    venueHttp
      .post<{ ok: boolean }>(`/venue/tournaments/${id}/bracket/${bmId}/walkover`, {
        winnerSide
      })
      .then((r) => r.data)
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

// STS 有效期 900s，缓存到还剩 60s 前，避免每次都来一次 AssumeRole
let cachedToken: (StsToken & { category: string; expireAt: number }) | null = null

async function getStsToken(category: string): Promise<StsToken> {
  const now = Date.now()
  if (
    cachedToken &&
    cachedToken.category === category &&
    cachedToken.expireAt - now > 60_000
  ) {
    return cachedToken
  }
  const r = await venueHttp.get<StsToken>(
    `/uploads/sts-token?category=${encodeURIComponent(category)}`
  )
  const tok = r.data as unknown as StsToken
  cachedToken = {
    ...tok,
    category,
    expireAt: new Date(tok.expiration).getTime()
  }
  return tok
}

function ext(filename: string): string {
  const i = filename.lastIndexOf('.')
  return i >= 0 ? filename.slice(i).toLowerCase() : ''
}

function randomId(len = 16): string {
  const arr = new Uint8Array(len)
  crypto.getRandomValues(arr)
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('')
}

export const uploadApi = {
  /**
   * STS 直传阿里云 OSS：
   *   1) GET /uploads/sts-token 拿 900s 临时凭证
   *   2) 用 ali-oss JS SDK put 到 `{prefix}/{randomId}{ext}`
   *   3) 返回最终公网 URL 给业务用
   */
  upload: async (
    file: File,
    category: string
  ): Promise<{ url: string; path: string }> => {
    const tok = await getStsToken(category)
    const OSS = (await import('ali-oss')).default
    const client = new OSS({
      region: tok.region,
      accessKeyId: tok.accessKeyId,
      accessKeySecret: tok.accessKeySecret,
      stsToken: tok.securityToken,
      bucket: tok.bucket,
      endpoint: tok.endpoint ?? undefined,
      secure: true
    })
    const objectKey = `${tok.objectKeyPrefix}/${randomId()}${ext(file.name)}`
    const res = await client.put(objectKey, file)
    return { url: res.url, path: objectKey }
  }
}
