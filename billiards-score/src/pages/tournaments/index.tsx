import { View, Text } from '@tarojs/components'
import Taro, { usePullDownRefresh } from '@tarojs/taro'
import { useEffect, useState } from 'react'
import {
  tournamentsPublicApi,
  type TournamentItem,
  type TournamentStatus
} from '../../core/api/venue'
import './index.scss'

const STATUS_LABEL: Record<TournamentStatus, { text: string; color: string }> = {
  draft: { text: '草稿', color: '#a0a8a4' },
  registering: { text: '报名中', color: '#60a5fa' },
  registration_closed: { text: '报名截止', color: '#f59e0b' },
  in_progress: { text: '进行中', color: '#4ade80' },
  completed: { text: '已结束', color: '#a0a8a4' },
  cancelled: { text: '已取消', color: '#ef4444' }
}

type Filter = 'all' | 'registering' | 'in_progress' | 'completed'

function formatDt(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function TournamentsPage() {
  const [filter, setFilter] = useState<Filter>('registering')
  const [items, setItems] = useState<TournamentItem[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)

  const fetchData = async () => {
    setLoading(true)
    try {
      const r = await tournamentsPublicApi.list({
        status: filter === 'all' ? undefined : filter,
        pageSize: 50
      })
      setItems(r.items)
      setTotal(r.total)
    } catch {
      setItems([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter])

  usePullDownRefresh(async () => {
    await fetchData()
    Taro.stopPullDownRefresh()
  })

  const goDetail = (id: string) => {
    Taro.navigateTo({ url: `/pages/tournament-detail/index?id=${id}` })
  }

  return (
    <View className='tournaments-page'>
      <View className='tp-tabs'>
        {(
          [
            ['registering', '报名中'],
            ['in_progress', '进行中'],
            ['completed', '已结束'],
            ['all', '全部']
          ] as [Filter, string][]
        ).map(([v, text]) => (
          <View
            key={v}
            className={`tp-tab ${filter === v ? 'active' : ''}`}
            onClick={() => setFilter(v)}
          >
            {text}
          </View>
        ))}
      </View>

      <View className='tp-meta'>共 {total} 场</View>

      {loading ? (
        <View className='tp-empty'>加载中…</View>
      ) : items.length === 0 ? (
        <View className='tp-empty'>暂无赛事</View>
      ) : (
        <View className='tp-list'>
          {items.map((t) => (
            <View key={t.id} className='tp-card' onClick={() => goDetail(t.id)}>
              <View className='tp-card-header'>
                <Text className='tp-title'>
                  🏆 {t.title}
                </Text>
                <Text
                  className='tp-status'
                  style={{ color: STATUS_LABEL[t.status].color }}
                >
                  {STATUS_LABEL[t.status].text}
                </Text>
              </View>
              <Text className='tp-sub'>
                {t.gameType === 'nine_ball' ? '九球追分' : '中式八球'} ·{' '}
                {t.format === 'single_elim' ? `单败 ${t.maxPlayers} 强` : t.format}
              </Text>
              <View className='tp-info-row'>
                <Text className='tp-info'>
                  👥 {t.registeredCount} / {t.maxPlayers}
                </Text>
                <Text className='tp-info'>🗓 {formatDt(t.matchStartsAt)}</Text>
              </View>
              {t.entryFeeCents > 0 && (
                <Text className='tp-fee'>
                  报名费 {(t.entryFeeCents / 100).toFixed(0)} 元 · 线下收
                </Text>
              )}
              {t.prizePoolText && (
                <Text className='tp-prize'>🏅 {t.prizePoolText}</Text>
              )}
            </View>
          ))}
        </View>
      )}
    </View>
  )
}
