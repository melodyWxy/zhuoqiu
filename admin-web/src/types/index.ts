export type AdminRole = 'super_admin' | 'operator' | 'readonly'
export type MatchType = 'nine_ball' | 'eight_ball'
export type MatchState = 'waiting' | 'in_progress' | 'paused' | 'ended' | 'dissolved'
export type UserStatus = 'active' | 'banned' | 'deleted'

export interface AdminAccount {
  id: string
  username: string
  name: string
  role: AdminRole
  mustChangePassword: boolean
}

export interface LoginResponse {
  accessToken: string
  refreshToken: string
  expiresIn: number
  account: AdminAccount
}

export interface Pagination<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

export interface MatchPlayerRow {
  slot: number
  displayName: string
  userId: string | null
  isCurrent: boolean
}

/** v2.22 战报海报状态 */
export type ReplayStatus = 'pending' | 'ready' | 'failed'

export interface MatchListItem {
  id: string
  code: string | null
  type: MatchType
  state: MatchState
  ownerUserId: string
  owner: { id: string; nickname: string; phoneNumber: string | null } | null
  createdAt: string
  endedAt: string | null
  players: MatchPlayerRow[]
  /** v2.22 战报海报：可能为 null（未生成 / 还在 pending） */
  replayStatus?: ReplayStatus | null
  replayPosterUrl?: string | null
}

export interface MatchDetail {
  id: string
  code: string | null
  type: MatchType
  rules: Record<string, number>
  state: MatchState
  players: MatchPlayerRow[]
  computed: {
    scores?: Record<number, number>
    stats?: Record<number, { bigJack: number; smallJack: number; golden9: number; normalWin: number }>
    wins?: Record<number, number>
  }
  timer: { startedAt: string | null; accumulatedMs: number; isPaused: boolean }
  lastEventSeq: number
  ownerUserId: string
  owner: { id: string; nickname: string; avatar?: string } | null
  endedAt: string | null
  endedBy: string | null
  endedReason: string | null
  /** v2.22 战报海报字段 */
  replayStatus?: ReplayStatus | null
  replayPosterUrl?: string | null
  replayQrUrl?: string | null
  replayGeneratedAt?: string | null
  replayFailedReason?: string | null
}

export interface MatchEventItem {
  id: number
  matchId: string
  serverSeq: number
  actorUserId: string | null
  actorAdminId: string | null
  type: string
  payloadJson: Record<string, unknown>
  undone: boolean
  undoneByEventId: number | null
  createdAt: string
}

export interface UserListItem {
  id: string
  nickname: string
  avatar: string
  phoneNumber: string | null
  primarySource: 'wechat' | 'douyin' | 'phone'
  status: UserStatus
  banUntil: string | null
  lastActiveAt: string | null
  createdAt: string
}

export interface UserDetail extends UserListItem {
  banReason?: string | null
  wechatBindings: Array<{
    id: string
    openId: string
    unionId: string | null
    mpAppId: string
    bindAt: string
  }>
  douyinBindings: Array<{
    id: string
    openId: string
    unionId: string | null
    mpAppId: string
    bindAt: string
  }>
}

export interface AuditLogItem {
  id: number
  actorAdminId: string
  action: string
  targetType: string | null
  targetId: string | null
  detailJson: Record<string, unknown>
  ip: string
  createdAt: string
  actor?: { id: string; username: string; name: string }
}

export interface AnalyticsOverview {
  onlineMatches: number
  todayCreatedMatches: number
  todayEndedMatches: number
  todayNewUsers: number
  onlineUsers: number
  abnormalMatches: number
  compareToYesterday: { todayCreatedMatches: number }
}
