import { View, Text, Button } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useCallback, useEffect, useRef, useState } from 'react'
import { matchApi, MatchDetail } from '../../core/api/match'
import { getMatchSocket, WsMessage } from '../../core/ws/socket'
import { useAuthStore } from '../../core/auth/store'

interface Props {
  matchId: string
}

export default function OnlineEightBall({ matchId }: Props) {
  const [detail, setDetail] = useState<MatchDetail | null>(null)
  const [busy, setBusy] = useState(false)
  const lastSeq = useRef(0)
  const currentUserId = useAuthStore((s) => s.user?.id ?? null)

  const refresh = useCallback(async () => {
    try {
      const d = await matchApi.detail(matchId)
      setDetail(d)
      lastSeq.current = d.lastEventSeq
    } catch {}
  }, [matchId])

  useEffect(() => {
    refresh()
    const sock = getMatchSocket()
    sock.connect()
      .then(() => sock.subscribeMatch(matchId, lastSeq.current))
      .catch(() => Taro.showToast({ title: 'WS 连接失败', icon: 'none' }))

    const off = sock.on((msg: WsMessage) => {
      if (msg.op === 'match_event' && msg.data?.matchId === matchId) refresh()
    })

    return () => {
      off()
      getMatchSocket().unsubscribeMatch(matchId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId, refresh])

  if (!detail) return <View style={{ padding: 40, textAlign: 'center' }}>加载中…</View>

  const players = detail.players.filter((p) => p.isCurrent).sort((a, b) => a.slot - b.slot)
  const wins = detail.computed.wins ?? {}
  const targetWins = (detail.rules.targetWins as number) ?? 5
  const isLive = detail.state === 'in_progress' || detail.state === 'paused'
  const iAmParticipant =
    !!currentUserId &&
    (currentUserId === detail.ownerUserId ||
      players.some((p) => p.userId === currentUserId))

  const handleCardClick = async (slot: number) => {
    if (!iAmParticipant) {
      Taro.showToast({ title: '只有参赛者能记分', icon: 'none' })
      return
    }
    if (!isLive) return
    const player = players.find((p) => p.slot === slot)
    const res = await Taro.showModal({
      title: '确认本局胜',
      content: `${player?.displayName ?? ''} 赢下本局吗？`,
      confirmText: '确认',
      cancelText: '取消'
    }).catch(() => null)
    if (!res?.confirm) return
    setBusy(true)
    try {
      await matchApi.event(matchId, 'score_eight_ball_win', { winnerSlot: slot })
      refresh()
      const newWins = (wins[slot] ?? 0) + 1
      if (newWins >= targetWins) {
        Taro.showToast({ title: `${player?.displayName} 夺得比赛！`, icon: 'success' })
      }
    } finally {
      setBusy(false)
    }
  }

  const handleEnd = async () => {
    if (detail.ownerUserId !== currentUserId) return
    const res = await Taro.showModal({
      title: '结束比赛',
      content: '确认结束？',
      confirmText: '结束',
      cancelText: '取消'
    }).catch(() => null)
    if (!res?.confirm) return
    await matchApi.end(matchId)
    refresh()
  }

  const handleShare = () => {
    if (!detail.code) return
    Taro.setClipboardData({ data: detail.code }).then(() => {
      Taro.showToast({ title: `房间码：${detail.code}`, icon: 'none' })
    })
  }

  const leaderIdx = players.reduce(
    (a, b) => ((wins[a.slot] ?? 0) >= (wins[b.slot] ?? 0) ? a : b),
    players[0]
  )

  return (
    <View className='eight-ball-page'>
      <View className='header' style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 12 }}>
        <Text className='header-title'>中式八球 · 联机</Text>
        <View style={{ display: 'flex', gap: 8 }}>
          <View
            style={{ padding: '4px 10px', background: 'rgba(212,175,55,0.2)', borderRadius: 6, color: '#d4af37', fontSize: 12 }}
            onClick={handleShare}
          >
            🔗 {detail.code ?? '—'}
          </View>
          <View
            style={{ padding: '4px 10px', background: 'rgba(239,68,68,0.15)', borderRadius: 6, color: '#ef4444', fontSize: 12 }}
            onClick={handleEnd}
          >
            ✕
          </View>
        </View>
      </View>

      <View className='players-section'>
        {players.map((p) => (
          <View key={p.slot} className='player-card' onClick={() => handleCardClick(p.slot)}>
            <View className='avatar'>🧍</View>
            <Text className='name'>{p.displayName}</Text>
            <Text className='wins'>{wins[p.slot] ?? 0}</Text>
            <Text className='label'>胜</Text>
          </View>
        ))}
      </View>

      <View className='goal-banner'>
        <Text className='goal-text'>
          抢 <Text className='goal-value'>{targetWins}</Text> 局
        </Text>
        {leaderIdx && (
          <Text className='leader-text'>
            <Text className='leader-name'>{leaderIdx.displayName}</Text> 领先
          </Text>
        )}
      </View>

      <View className='actions-section'>
        <View className='actions-hint'>
          {iAmParticipant ? '点击玩家卡片 → 该玩家赢下本局' : '观战中，不能记分'}
        </View>
      </View>
    </View>
  )
}
