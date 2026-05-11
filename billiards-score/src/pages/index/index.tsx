import { View, Text } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useEffect, useState } from 'react'
import { useAuthStore } from '../../core/auth/store'
import LoginSheet from '../../components/LoginSheet'
import { matchApi, MatchDetail } from '../../core/api/match'
import {
  tournamentsPublicApi,
  type TournamentItem
} from '../../core/api/venue'
import './index.scss'

function formatMd(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function Index() {
  const cloudUser = useAuthStore((s) => s.user)
  const [loginOpen, setLoginOpen] = useState(false)
  const [activeMatch, setActiveMatch] = useState<MatchDetail | null>(null)
  const [hotTournaments, setHotTournaments] = useState<TournamentItem[]>([])

  const refreshActive = async () => {
    if (!cloudUser) {
      setActiveMatch(null)
      return
    }
    try {
      const r = await matchApi.myActiveMatch()
      setActiveMatch(r.match)
    } catch {
      setActiveMatch(null)
    }
  }

  const refreshHot = async () => {
    try {
      const r = await tournamentsPublicApi.list({ pageSize: 10 })
      const hot = r.items
        .filter(
          (t) => t.status === 'registering' || t.status === 'in_progress'
        )
        .slice(0, 5)
      setHotTournaments(hot)
    } catch {
      setHotTournaments([])
    }
  }

  useEffect(() => {
    refreshActive()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloudUser?.id])

  useEffect(() => {
    refreshHot()
  }, [])

  useDidShow(() => {
    refreshActive()
    refreshHot()
  })

  const resumeActive = () => {
    if (!activeMatch) return
    const url =
      activeMatch.type === 'nine_ball'
        ? '/pages/nine-ball/index'
        : '/pages/eight-ball/index'
    Taro.navigateTo({ url: `${url}?matchId=${activeMatch.id}&role=player` })
  }

  const startGame = (type: 'nine-ball' | 'eight-ball') => {
    Taro.navigateTo({ url: `/pages/config/index?type=${type}` })
  }

  const goJoin = () => {
    if (!cloudUser) {
      Taro.showToast({ title: '请先登录才能加入联机', icon: 'none' })
      setLoginOpen(true)
      return
    }
    Taro.navigateTo({ url: '/pages/join/index' })
  }

  return (
    <View className='home-page'>
      <View className='home-header'>
        <Text className='home-title'>🎱 桌球计分</Text>
        <Text className='home-subtitle'>简单到拿起手机就会用</Text>
      </View>

      {activeMatch && (
        <View className='active-match-banner' onClick={resumeActive}>
          <Text className='amb-icon'>🎮</Text>
          <View className='amb-body'>
            <Text className='amb-title'>你有进行中的比赛</Text>
            <Text className='amb-sub'>
              {activeMatch.type === 'nine_ball' ? '九球追分' : '中式八球'}
              {activeMatch.code ? ` · ${activeMatch.code}` : ''} · 点击继续
            </Text>
          </View>
          <Text className='amb-arrow'>→</Text>
        </View>
      )}

      <View className='home-grid'>
        {/* 第一行：九球 + 中八 */}
        <View className='grid-row'>
          <View
            className='mini-card primary-card'
            onClick={() => startGame('nine-ball')}
          >
            <Text className='mini-icon'>🎱</Text>
            <Text className='mini-title'>九球追分</Text>
            <Text className='mini-desc'>大金·小金·普胜</Text>
          </View>
          <View
            className='mini-card primary-card'
            onClick={() => startGame('eight-ball')}
          >
            <Text className='mini-icon'>🎱</Text>
            <Text className='mini-title'>中式八球</Text>
            <Text className='mini-desc'>抢几局</Text>
          </View>
        </View>

        {/* 第二行：联机（独占） */}
        <View className='grid-row'>
          <View
            className='mini-card mini-card-wide join-card'
            onClick={goJoin}
          >
            <Text className='mini-icon'>🔗</Text>
            <View className='mini-body'>
              <Text className='mini-title'>加入联机房间</Text>
              <Text className='mini-desc'>
                {cloudUser ? '输入 6 位房间码或扫码' : '登录后才能加入'}
              </Text>
            </View>
            <Text className='mini-arrow'>→</Text>
          </View>
        </View>

        {/* 第三行：发现球房 + 赛事 */}
        <View className='grid-row'>
          <View
            className='mini-card venues-card'
            onClick={() => Taro.navigateTo({ url: '/pages/venues/index' })}
          >
            <Text className='mini-icon'>🏢</Text>
            <Text className='mini-title'>发现球房</Text>
            <Text className='mini-desc'>附近球房</Text>
          </View>
          <View
            className='mini-card tournaments-card'
            onClick={() => Taro.navigateTo({ url: '/pages/tournaments/index' })}
          >
            <Text className='mini-icon'>🏆</Text>
            <Text className='mini-title'>赛事</Text>
            <Text className='mini-desc'>报名 · 赢奖</Text>
          </View>
        </View>
      </View>

      {/* 热门比赛 */}
      {hotTournaments.length > 0 && (
        <View className='hot-section'>
          <View className='hot-header'>
            <Text className='hot-title'>🔥 热门比赛</Text>
            <Text
              className='hot-more'
              onClick={() =>
                Taro.navigateTo({ url: '/pages/tournaments/index' })
              }
            >
              全部 →
            </Text>
          </View>
          <View className='hot-list'>
            {hotTournaments.map((t) => (
              <View
                key={t.id}
                className='hot-item'
                onClick={() =>
                  Taro.navigateTo({
                    url: `/pages/tournament-detail/index?id=${t.id}`
                  })
                }
              >
                <View className='hot-item-main'>
                  <Text className='hot-item-title'>🏆 {t.title}</Text>
                  <Text className='hot-item-meta'>
                    {t.gameType === 'nine_ball' ? '九球' : '中八'} ·{' '}
                    {t.registeredCount}/{t.maxPlayers} 人 ·{' '}
                    {formatMd(t.matchStartsAt)}
                  </Text>
                </View>
                <Text className={`hot-tag hot-tag-${t.status}`}>
                  {t.status === 'registering' ? '报名中' : '进行中'}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}

      <LoginSheet
        visible={loginOpen}
        onClose={() => setLoginOpen(false)}
        redirectToActiveOnSuccess
      />
    </View>
  )
}
