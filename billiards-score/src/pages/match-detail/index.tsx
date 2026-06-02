import { View, Text } from '@tarojs/components'
import Taro, { useRouter, useShareAppMessage } from '@tarojs/taro'
import { useEffect, useState } from 'react'
import { matchApi, MatchDetail } from '../../core/api/match'
import { formatElapsed } from '../../core/game/timer'
import LoadingState from '../../components/LoadingState'
import EmptyState from '../../components/EmptyState'
import { buildMatchReplayShare } from '../../utils/share'
import './index.scss'

const EVENT_LABEL: Record<string, string> = {
  score_normal_win: '✅ 普胜',
  score_small_jack: '🏅 小金',
  score_big_jack: '💎 大金',
  score_golden9: '👑 黄金9',
  score_eight_ball_win: '🏆 本局胜',
  foul: '⚠️ 犯规',
  pause: '⏸ 暂停',
  resume: '▶ 继续',
  undo: '↩️ 撤销',
  seat_occupy: '🪑 占位',
  seat_leave: '🚶 离位',
  seat_kick: '👮 踢出',
  rename: '✏️ 改名',
  end: '🏁 结束',
  force_end: '🛑 强制结束'
}

function formatDateTime(s: string): string {
  const d = new Date(s)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export default function MatchDetailPage() {
  const router = useRouter()
  const matchId = router.params.id as string | undefined
  const [detail, setDetail] = useState<MatchDetail | null>(null)
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

  /** 分享战报 —— 不接朋友圈（朋友圈 query 透传后落地路径不可控） */
  useShareAppMessage(() => {
    if (detail) return buildMatchReplayShare(detail)
    return {
      title: '击球帮战报',
      path: matchId ? `/pages/match-detail/index?id=${matchId}` : '/pages/index/index'
    }
  })

  useEffect(() => {
    if (!matchId) return
    Promise.all([matchApi.detail(matchId), matchApi.events(matchId)])
      .then(([d, e]) => {
        setDetail(d)
        setEvents(e.items)
      })
      .finally(() => setLoading(false))
  }, [matchId])

  if (!matchId) {
    return <EmptyState icon='⚠️' title='参数错误' description='缺少 match id，请从历史记录里重新进入' />
  }
  if (loading || !detail) {
    return <LoadingState text='正在加载比赛' />
  }

  const players = detail.players.filter((p) => p.isCurrent).sort((a, b) => a.slot - b.slot)
  const isNineBall = detail.type === 'nine_ball'
  const scores = detail.computed.scores ?? {}
  const wins = detail.computed.wins ?? {}
  const stats = detail.computed.stats ?? {}

  // 冠军（最高分 / 最多胜局）
  const champion = players.reduce((a, b) =>
    isNineBall
      ? (scores[a.slot] ?? 0) >= (scores[b.slot] ?? 0) ? a : b
      : (wins[a.slot] ?? 0) >= (wins[b.slot] ?? 0) ? a : b
  , players[0])

  return (
    <View className='md-page'>
      <View className='md-header'>
        <Text className='md-back' onClick={() => Taro.navigateBack()}>← 返回</Text>
        <Text className='md-title'>
          {isNineBall ? '九球追分' : '中式八球'}
          {detail.code ? ` · ${detail.code}` : ''}
        </Text>
        <Text className='md-sub'>
          {detail.state === 'ended' ? '✅ 已结束' : detail.state === 'in_progress' ? '🟢 进行中' : detail.state}
          {detail.endedAt && ` · ${formatDateTime(detail.endedAt)}`}
        </Text>
      </View>

      <View className='md-summary'>
        <View className='md-summary-row'>
          <Text className='md-summary-label'>时长</Text>
          <Text className='md-summary-value'>
            {formatElapsed(Number(detail.timer.accumulatedMs ?? 0))}
          </Text>
        </View>
        <View className='md-summary-row'>
          <Text className='md-summary-label'>冠军</Text>
          <Text className='md-summary-value champion'>
            🏆 {champion?.displayName ?? '—'}
          </Text>
        </View>
        <View className='md-summary-row'>
          <Text className='md-summary-label'>事件数</Text>
          <Text className='md-summary-value'>{events.length}</Text>
        </View>
      </View>

      <View className='md-players'>
        <Text className='md-section-title'>玩家与比分</Text>
        {players.map((p) => (
          <View key={p.slot} className='md-player-row'>
            <Text className='md-slot'>{p.slot}号位</Text>
            <Text className='md-player-name'>{p.displayName}</Text>
            {isNineBall ? (
              <View className='md-score-block'>
                <Text className='md-score'>{scores[p.slot] ?? 0}</Text>
                <View className='md-stats'>
                  <Text>💎×{stats[p.slot]?.bigJack ?? 0}</Text>
                  <Text>🏅×{stats[p.slot]?.smallJack ?? 0}</Text>
                  <Text>👑×{stats[p.slot]?.golden9 ?? 0}</Text>
                  <Text>✅×{stats[p.slot]?.normalWin ?? 0}</Text>
                </View>
              </View>
            ) : (
              <View className='md-score-block'>
                <Text className='md-score'>{wins[p.slot] ?? 0}</Text>
                <Text className='md-stats'>胜局</Text>
              </View>
            )}
          </View>
        ))}
      </View>

      <View className='md-events'>
        <Text className='md-section-title'>操作日志（{events.length} 条）</Text>
        {events.length === 0 ? (
          <Text className='md-empty'>暂无事件</Text>
        ) : (
          events.map((e) => (
            <View
              key={e.id}
              className={`md-event-row ${e.undone ? 'undone' : ''}`}
            >
              <Text className='md-event-seq'>#{e.serverSeq}</Text>
              <Text className='md-event-time'>
                {new Date(e.createdAt).toLocaleTimeString()}
              </Text>
              <Text className='md-event-type'>
                {EVENT_LABEL[e.type] ?? e.type}
              </Text>
              <Text className='md-event-payload'>
                {JSON.stringify(e.payloadJson)}
              </Text>
              {e.undone && <Text className='md-event-undone'>(已撤销)</Text>}
            </View>
          ))
        )}
      </View>
    </View>
  )
}
