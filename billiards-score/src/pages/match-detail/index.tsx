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
  const matchId = router.params.id as string | undefined
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

  if (!matchId) {
    return (
      <EmptyState
        icon='⚠️'
        title='参数错误'
        description='缺少 match id，请从历史记录里重新进入'
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

  return (
    <View className='md-page'>
      <View className='md-back' onClick={() => Taro.navigateBack()}>
        ← 返回
      </View>

      {/* 海报区：Phase A 始终展示占位 */}
      <View className='md-poster-card'>
        {poster.status === 'pending' && (
          <View className='md-poster-pending'>
            <LoadingState text='正在生成战报海报' variant='inline' />
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
