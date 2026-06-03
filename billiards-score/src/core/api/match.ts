import { callApi } from './client'

export interface PlayerSlotInput {
  slot: number
  name: string
  claim?: boolean
}

export interface MatchDetail {
  id: string
  code: string | null
  type: 'nine_ball' | 'eight_ball'
  rules: Record<string, number>
  state: 'waiting' | 'in_progress' | 'paused' | 'ended' | 'dissolved'
  players: Array<{
    slot: number
    displayName: string
    userId: string | null
    /** emoji（'🎱' / '🧍'）或 OSS URL；空位时为 null */
    avatar: string | null
    isCurrent: boolean
    joinedAt: string
    leftAt: string | null
  }>
  computed: {
    scores?: Record<number, number>
    stats?: Record<
      number,
      { bigJack: number; smallJack: number; golden9: number; normalWin: number }
    >
    wins?: Record<number, number>
  }
  timer: {
    startedAt: string | null
    accumulatedMs: number
    isPaused: boolean
  }
  lastEventSeq: number
  ownerUserId: string
  owner: { id: string; nickname: string; avatar?: string } | null
  endedAt: string | null
  endedBy: string | null
  endedReason: string | null
}

export interface EventResult {
  serverSeq: number
  matchState: MatchDetail
}

/** v2.22 我页累计战绩 */
export interface MyStats {
  totalMatches: number
  wins: number
  winRate: number
  nineBall: {
    matches: number
    wins: number
    bigJack: number
    smallJack: number
    golden9: number
    normalWin: number
    highScore: number
    highScoreVs: string
  }
  eightBall: {
    matches: number
    wins: number
    totalWinRounds: number
  }
  recent: Array<{
    matchId: string
    type: 'nine_ball' | 'eight_ball'
    opponent: string
    myScore: number
    oppScore: number
    endedAt: string | null
    isWin: boolean
  }>
}

/** 战报响应：detail + 叙事文案 + 海报状态 */
export interface ReplayResponse {
  detail: MatchDetail
  narrative: {
    headline: string
    subline: string
    championSlot: number | null
    type: 'nine_ball' | 'eight_ball'
  }
  poster: {
    status: 'pending' | 'ready' | 'failed'
    url: string | null
    qrUrl: string | null
    failedReason?: string
  }
}

export const matchApi = {
  create: (input: {
    type: 'nine_ball' | 'eight_ball'
    rules?: Record<string, number>
    playerSlots: PlayerSlotInput[]
  }) => callApi<MatchDetail>('/matches', { method: 'POST', data: input }),

  join: (code: string, slot?: number, displayName?: string) =>
    callApi<{ match: MatchDetail; role: 'player' | 'spectator' }>(
      '/matches/join',
      { method: 'POST', data: { code, slot, displayName } }
    ),

  detail: (idOrCode: string, opts?: { toast?: boolean }) =>
    callApi<MatchDetail>(`/matches/${idOrCode}`, { toast: opts?.toast ?? true }),

  /** 战报：detail + 叙事 + 海报。Phase A 海报字段为 pending。 */
  replay: (idOrCode: string) =>
    callApi<ReplayResponse>(`/matches/${idOrCode}/replay`, { toast: false }),

  /** v2.22 战报小程序码 scene 反查：matchId 后 12 字符 → 完整 id；找不到返回 null */
  byIdSuffix: (suffix: string) =>
    callApi<{ id: string } | null>(`/matches/by-suffix/${encodeURIComponent(suffix)}`, {
      toast: false
    }),

  /** v2.22 战绩聚合：当前用户累计战绩 */
  myStats: () =>
    callApi<MyStats>('/me/stats', { toast: false }),

  seat: (id: string, action: 'occupy' | 'leave', slot?: number, displayName?: string) =>
    callApi<MatchDetail>(`/matches/${id}/seat`, {
      method: 'POST',
      data: { action, slot, displayName }
    }),

  event: (
    id: string,
    type: string,
    payload: Record<string, unknown>,
    clientSeq?: number
  ) =>
    callApi<EventResult>(`/matches/${id}/events`, {
      method: 'POST',
      data: { type, payload, clientSeq }
    }),

  undo: (id: string) =>
    callApi<{
      serverSeq: number | null
      undoneEventId: number | null
      matchState?: MatchDetail
    }>(`/matches/${id}/events/undo`, { method: 'POST' }),

  end: (id: string, reason?: string) =>
    callApi<MatchDetail>(`/matches/${id}/end`, {
      method: 'POST',
      data: { reason }
    }),

  myHistory: (page = 1, pageSize = 20) =>
    callApi<{
      items: Array<MatchDetail & { durationMs: number; myScore?: number }>
      total: number
      page: number
      pageSize: number
    }>(`/me/matches?page=${page}&pageSize=${pageSize}`),

  myActiveMatch: () =>
    callApi<{ match: MatchDetail | null }>(`/me/active-match`, { toast: false }),

  events: (id: string) =>
    callApi<{
      items: Array<{
        id: number
        serverSeq: number
        actorUserId: string | null
        actorAdminId: string | null
        actorNickname: string | null
        actorPhoneMasked: string | null
        actorAdminName: string | null
        type: string
        payloadJson: Record<string, unknown>
        undone: boolean
        undoneByEventId: number | null
        createdAt: string
      }>
      total: number
    }>(`/matches/${id}/events`)
}
