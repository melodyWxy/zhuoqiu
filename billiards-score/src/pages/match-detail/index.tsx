import { View, Text, Image, Button } from '@tarojs/components'
import Taro, { useRouter, useShareAppMessage } from '@tarojs/taro'
import { useEffect, useState } from 'react'
import { matchApi, ReplayResponse } from '../../core/api/match'
import { formatElapsed } from '../../core/game/timer'
import LoadingState from '../../components/LoadingState'
import EmptyState from '../../components/EmptyState'
import { buildMatchReplayShare } from '../../utils/share'
import { isAvatarUrl } from '../../utils/avatar'
import './index.scss'

const EVENT_LABEL: Record<string, string> = {
  score_normal_win: '普胜',
  score_small_jack: '小金',
  score_big_jack: '大金',
  score_golden9: '黄金 9',
  score_eight_ball_win: '本局胜',
  foul: '犯规',
  pause: '暂停',
  resume: '继续',
  undo: '撤销',
  seat_occupy: '占位',
  seat_leave: '离位',
  seat_kick: '踢出',
  rename: '改名',
  end: '结束',
  force_end: '强制结束'
}

function formatTime(s: string): string {
  const d = new Date(s)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function formatDate(s: string | null): string {
  if (!s) return ''
  const d = new Date(s)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function PlayerAvatar({ avatar, fallback }: { avatar: string | null; fallback: string }) {
  const v = avatar ?? ''
  if (isAvatarUrl(v)) {
    return <Image className='md-avatar-img' src={v} mode='aspectFill' />
  }
  return <Text className='md-avatar-emoji'>{v || fallback}</Text>
}

export default function MatchDetailPage() {
  const router = useRouter()
  // 同时支持 ?id=（直链）和 ?ms=（小程序码 scene 后缀反查）
  const directId = router.params.id as string | undefined
  const ms = router.params.ms as string | undefined
  const [matchId, setMatchId] = useState<string | undefined>(directId)
  const [replay, setReplay] = useState<ReplayResponse | null>(null)
  const [events, setEvents] = useState<Array<{
    id: number
    serverSeq: number
    type: string
    payloadJson: Record<string, unknown>
    undone: boolean
    createdAt: string
    actorUserId: string | null
  }>>([])
  const [loading, setLoading] = useState(true)
  const [eventsOpen, setEventsOpen] = useState(false)
  /** 海报轮询：海报 status=pending 时定时拉 replay，最多 20 次（≈ 30s） */
  const [pollExhausted, setPollExhausted] = useState(false)

  // ms 反查：扫小程序码进入时，先拿 12 字符后缀换完整 matchId
  useEffect(() => {
    if (matchId || !ms) return
    matchApi
      .byIdSuffix(ms)
      .then((r) => {
        if (r?.id) {
          setMatchId(r.id)
        } else {
          // 反查不到 → 兜底回首页（Loading 会停在那；用户可手动返回）
          setLoading(false)
        }
      })
      .catch(() => setLoading(false))
  }, [matchId, ms])

  /** 分享战报 —— imageUrl 用海报 url（Phase C-3 接通），先走 buildMatchReplayShare 兜底 */
  useShareAppMessage(() => {
    if (replay) {
      const share = buildMatchReplayShare(replay.detail)
      if (replay.poster.url) share.imageUrl = replay.poster.url
      return share
    }
    return {
      title: '击球帮战报',
      path: matchId ? `/pages/match-detail/index?id=${matchId}` : '/pages/index/index'
    }
  })

  useEffect(() => {
    if (!matchId) return
    Promise.all([matchApi.replay(matchId), matchApi.events(matchId)])
      .then(([r, e]) => {
        setReplay(r)
        setEvents(e.items)
      })
      .finally(() => setLoading(false))
  }, [matchId])

  /**
   * 海报轮询：status=pending 时每 1500ms 拉一次 replay，最多 20 次
   * 重试用户点「重试」时清 pollExhausted，重启轮询
   */
  useEffect(() => {
    if (!matchId || !replay) return
    if (replay.poster.status !== 'pending') return
    if (pollExhausted) return

    let count = 0
    const MAX = 20
    const timer = setInterval(async () => {
      count++
      if (count > MAX) {
        clearInterval(timer)
        setPollExhausted(true)
        return
      }
      try {
        const r = await matchApi.replay(matchId)
        if (r.poster.status !== 'pending') {
          setReplay(r)
          clearInterval(timer)
        }
      } catch {
        // 网络抖动忽略，下次再试
      }
    }, 1500)
    return () => clearInterval(timer)
  }, [matchId, replay, pollExhausted])

  const handleRetryPoster = async () => {
    if (!matchId) return
    setPollExhausted(false)
    try {
      // 直接拉一次新数据；如果 server 端 24h 内已 ready 会立刻给 url
      const r = await matchApi.replay(matchId)
      setReplay(r)
    } catch {
      // ignore
    }
  }

  // 真正缺参（既没 id 也没 ms）
  if (!matchId && !ms) {
    return (
      <EmptyState
        icon='⚠️'
        title='参数错误'
        description='缺少 match id，请从历史记录里重新进入'
      />
    )
  }
  // ms 反查中或反查失败
  if (!matchId && ms) {
    return loading ? (
      <LoadingState text='正在打开战报' />
    ) : (
      <EmptyState
        icon='⚠️'
        title='战报不存在'
        description='可能这场比赛已经被清理；回首页看看其他比赛'
      />
    )
  }
  if (loading || !replay) {
    return <LoadingState text='正在加载战报' />
  }

  const { detail, narrative, poster } = replay
  const players = detail.players.filter((p) => p.isCurrent).sort((a, b) => a.slot - b.slot)
  const isNineBall = detail.type === 'nine_ball'
  const scores = detail.computed.scores ?? {}
  const wins = detail.computed.wins ?? {}
  const stats = detail.computed.stats ?? {}

  const handleViewPoster = () => {
    if (!poster.url) return
    Taro.previewImage({ urls: [poster.url], current: poster.url })
  }

  /**
   * 返回 fallback：当从分享卡片 / 小程序码 / scheme 直接进入时页面栈
   * 深度为 1，navigateBack 会静默失败 → 兜底 switchTab 到首页。
   */
  const handleBack = () => {
    Taro.navigateBack({
      fail: () => {
        Taro.switchTab({ url: '/pages/index/index' }).catch(() =>
          Taro.reLaunch({ url: '/pages/index/index' })
        )
      }
    })
  }

  return (
    <View className='md-page'>
      <View className='md-back' onClick={handleBack}>
        ← 返回
      </View>

      {/* 海报区：pending → loading（或轮询超时给重试）；ready → 大图；failed → 静默兜底 */}
      <View className='md-poster-card'>
        {poster.status === 'pending' && !pollExhausted && (
          <View className='md-poster-pending'>
            <LoadingState text='正在生成战报海报' variant='inline' />
          </View>
        )}
        {poster.status === 'pending' && pollExhausted && (
          <View className='md-poster-retry'>
            <Text className='md-poster-retry-text'>海报生成中，稍后再试</Text>
            <View className='md-poster-retry-btn' onClick={handleRetryPoster}>
              点击重试
            </View>
          </View>
        )}
        {poster.status === 'ready' && poster.url && (
          <Image
            className='md-poster-img'
            src={poster.url}
            mode='widthFix'
            onClick={handleViewPoster}
          />
        )}
        {poster.status === 'failed' && (
          <View className='md-poster-failed'>
            <Text className='md-poster-failed-icon'>🎱</Text>
            <Text className='md-poster-failed-text'>海报暂时拿不到，文字战报照看</Text>
          </View>
        )}
      </View>

      {/* 标题 */}
      <View className='md-headline-card'>
        <Text className='md-type-tag'>
          {isNineBall ? '九球追分' : '中式八球'}
          {detail.code ? ` · ${detail.code}` : ''}
        </Text>
        <Text className='md-headline'>{narrative.headline}</Text>
        <Text className='md-subline'>{narrative.subline}</Text>
        {detail.endedAt && (
          <Text className='md-endedat'>{formatDate(detail.endedAt)}</Text>
        )}
      </View>

      {/* 玩家比分大字 */}
      <View className='md-players-card'>
        {players.map((p) => {
          const isChampion = p.slot === narrative.championSlot
          const score = isNineBall ? scores[p.slot] ?? 0 : wins[p.slot] ?? 0
          return (
            <View
              key={p.slot}
              className={`md-player-row ${isChampion ? 'is-champion' : ''}`}
            >
              <View className='md-avatar-wrap'>
                <PlayerAvatar avatar={p.avatar} fallback='🧍' />
                {isChampion && <Text className='md-champion-badge'>🏆</Text>}
              </View>
              <View className='md-player-meta'>
                <Text className='md-player-name'>{p.displayName}</Text>
                {isNineBall && stats[p.slot] && (
                  <View className='md-player-stats'>
                    {stats[p.slot].golden9 ? (
                      <Text className='md-stat-chip'>👑×{stats[p.slot].golden9}</Text>
                    ) : null}
                    {stats[p.slot].bigJack ? (
                      <Text className='md-stat-chip'>💎×{stats[p.slot].bigJack}</Text>
                    ) : null}
                    {stats[p.slot].smallJack ? (
                      <Text className='md-stat-chip'>🏅×{stats[p.slot].smallJack}</Text>
                    ) : null}
                    {stats[p.slot].normalWin ? (
                      <Text className='md-stat-chip'>✅×{stats[p.slot].normalWin}</Text>
                    ) : null}
                  </View>
                )}
                {!isNineBall && (
                  <Text className='md-player-stats-label'>胜局</Text>
                )}
              </View>
              <Text className={`md-score ${isChampion ? 'is-champion' : ''}`}>
                {score}
              </Text>
            </View>
          )
        })}
      </View>

      {/* 比赛元信息 */}
      <View className='md-meta-card'>
        <View className='md-meta-row'>
          <Text className='md-meta-label'>时长</Text>
          <Text className='md-meta-value'>
            {formatElapsed(Number(detail.timer.accumulatedMs ?? 0))}
          </Text>
        </View>
        <View className='md-meta-row'>
          <Text className='md-meta-label'>击球次数</Text>
          <Text className='md-meta-value'>{events.filter((e) => !e.undone).length}</Text>
        </View>
        {events.some((e) => e.undone) && (
          <View className='md-meta-row'>
            <Text className='md-meta-label'>撤销</Text>
            <Text className='md-meta-value'>{events.filter((e) => e.undone).length} 次</Text>
          </View>
        )}
      </View>

      {/* 完整事件日志：默认折叠，点开查看 */}
      <View className='md-events-fold' onClick={() => setEventsOpen((s) => !s)}>
        <Text className='md-events-fold-text'>
          {eventsOpen ? '收起完整记录' : `查看完整记录（${events.length} 条）`}
        </Text>
        <Text className='md-events-fold-arrow'>{eventsOpen ? '▴' : '▾'}</Text>
      </View>
      {eventsOpen && (
        <View className='md-events'>
          {events.length === 0 ? (
            <Text className='md-empty'>暂无事件</Text>
          ) : (
            events.map((e) => (
              <View
                key={e.id}
                className={`md-event-row ${e.undone ? 'undone' : ''}`}
              >
                <Text className='md-event-seq'>#{e.serverSeq}</Text>
                <Text className='md-event-time'>{formatTime(e.createdAt)}</Text>
                <Text className='md-event-type'>
                  {EVENT_LABEL[e.type] ?? e.type}
                </Text>
                {e.undone && <Text className='md-event-undone'>(已撤销)</Text>}
              </View>
            ))
          )}
        </View>
      )}

      {/* floating 分享按钮 */}
      <View className='md-share-fab'>
        <Button
          className='md-share-btn'
          openType='share'
          hoverClass='md-share-btn--hover'
        >
          📤 分享战报
        </Button>
      </View>
    </View>
  )
}
