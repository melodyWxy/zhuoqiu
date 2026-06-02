import { View, Text, Button } from '@tarojs/components'
import Taro, { useDidShow, useRouter, useShareAppMessage } from '@tarojs/taro'
import { useState } from 'react'
import { useNineBallStore } from '../../core/game/store'
import { useMatchStore } from '../../core/match/store'
import { useAuthStore } from '../../core/auth/store'
import { useUserStore } from '../../core/user/store'
import { matchApi } from '../../core/api/match'
import { buildMatchInviteShare } from '../../utils/share'
import GameToolbar from '../../components/GameToolbar'
import InputModal from '../../components/InputModal'
import OnlineNineBall from './OnlineMode'

import './index.scss'

type WinKind = 'normal' | 'small' | 'big' | 'golden9'

export default function NineBallPage() {
  const router = useRouter()
  const matchId = router.params.matchId as string | undefined

  /**
   * 分享：仅联机模式下有 roomCode 才有意义。
   * 触发时同步取一次 detail 拿 code（detail 已经在 OnlineMode 里 fetch 过；
   * 这里是分享触发时的兜底，避免 OnlineMode 还没拿到时分享出去带空 roomCode）。
   */
  useShareAppMessage(async () => {
    if (!matchId) return { title: '九球记分 · 击球帮', path: '/pages/index/index' }
    try {
      const d = await matchApi.detail(matchId)
      if (d.code) return buildMatchInviteShare('nine_ball', d.code)
    } catch {
      // 拿不到 detail 也别让分享失败
    }
    return { title: '九球记分 · 击球帮', path: '/pages/index/index' }
  })

  if (matchId) {
    // 联机模式：完全走 cloud 数据
    return <OnlineNineBall matchId={matchId} />
  }
  return <LocalNineBall />
}

function LocalNineBall() {
  const {
    players,
    scores,
    stats,
    rules,
    initGame,
    normalWin,
    smallJack,
    bigJack,
    golden9,
    foul,
    renamePlayer,
    clearGame
  } = useNineBallStore()
  const cloudNickname = useAuthStore((s) => s.user?.nickname)
  const localNickname = useUserStore((s) => s.nickname)

  const winItems: { label: string; kind: WinKind }[] = [
    { label: `✅ 普胜 (+${rules.normalWin})`, kind: 'normal' },
    { label: `🏅 小金 (+${rules.smallJack})`, kind: 'small' },
    { label: `💎 大金 (+${rules.bigJack})`, kind: 'big' },
    { label: `👑 黄金9 (+${rules.golden9})`, kind: 'golden9' }
  ]

  useDidShow(() => {
    if (players.length === 0) {
      // 已登录用云端昵称，未登录用本地；长按改名只在本场比赛 state 内生效
      const myName = cloudNickname || localNickname || '我'
      initGame(3, [myName, '玩家2', '玩家3'])
    }
  })

  const getLeader = () => {
    if (players.length === 0) return null
    let maxScore = -Infinity
    let leader = players[0].id
    for (const p of players) {
      const s = scores[p.id] ?? 0
      if (s > maxScore) {
        maxScore = s
        leader = p.id
      }
    }
    return leader
  }

  const leaderId = getLeader()
  const leaderPlayer = players.find((p) => p.id === leaderId)

  // 选"掏谁的分"。2 人局直接返回另一方；3 人局弹窗选
  const pickTarget = async (winnerId: number): Promise<number | null> => {
    const others = players.filter((p) => p.id !== winnerId)
    if (others.length === 1) return others[0].id
    const res = await Taro.showActionSheet({
      itemList: others.map((p) => `掏 ${p.name} 的分`)
    }).catch(() => null)
    if (!res || res.tapIndex < 0) return null
    return others[res.tapIndex].id
  }

  const handleCardClick = async (playerId: number) => {
    const res = await Taro.showActionSheet({
      itemList: winItems.map((w) => w.label)
    }).catch(() => null)
    if (!res || res.tapIndex < 0) return
    const w = winItems[res.tapIndex]

    if (w.kind === 'big') {
      bigJack(playerId)
      return
    }
    if (w.kind === 'golden9') {
      golden9(playerId)
      return
    }
    const target = await pickTarget(playerId)
    if (target === null) return
    if (w.kind === 'normal') normalWin(playerId, target)
    else smallJack(playerId, target)
  }

  const [renameTarget, setRenameTarget] = useState<{ id: number; name: string } | null>(null)

  const handleCardLongPress = (playerId: number, current: string) => {
    setRenameTarget({ id: playerId, name: current })
  }

  const handleFoul = async () => {
    const foulerRes = await Taro.showActionSheet({
      itemList: players.map((p) => `${p.name} 犯规`)
    }).catch(() => null)
    if (!foulerRes || foulerRes.tapIndex < 0) return
    const fouler = players[foulerRes.tapIndex]

    const scoreToRes = await Taro.showActionSheet({
      itemList: players.map((p) => `给 ${p.name} +1 分`)
    }).catch(() => null)
    if (!scoreToRes || scoreToRes.tapIndex < 0) return
    const scoreTo = players[scoreToRes.tapIndex]

    foul(fouler.id, scoreTo.id)
  }

  const handleEnd = (elapsedMs: number) => {
    if (players.length === 0) {
      clearGame()
      return
    }
    const playerSummaries = players.map((p) => ({
      name: p.name,
      position: p.position,
      score: scores[p.id] ?? 0,
      stats: {
        bigJack: stats[p.id]?.bigJack ?? 0,
        smallJack: stats[p.id]?.smallJack ?? 0,
        normalWin: stats[p.id]?.normalWin ?? 0,
        golden9: stats[p.id]?.golden9 ?? 0
      }
    }))
    const top = playerSummaries.reduce((a, b) =>
      (a.score ?? 0) >= (b.score ?? 0) ? a : b
    )
    useMatchStore.getState().saveMatch({
      type: 'nine-ball',
      endedAt: Date.now(),
      durationMs: elapsedMs,
      players: playerSummaries,
      winnerName: top.name
    })
    clearGame()
  }

  return (
    <View className='nine-ball-page'>
      <GameToolbar title='九球追分' onEnd={handleEnd} />

      <View className='players-section'>
        {players.map((player) => (
          <View
            key={player.id}
            className='player-card'
            onClick={() => handleCardClick(player.id)}
            onLongPress={() => handleCardLongPress(player.id, player.name)}
          >
            <View className='avatar'>🧍</View>
            <Text className='name'>{player.name}</Text>
            <Text className='position'>{player.position}号位</Text>
            <Text className='score'>{scores[player.id] || 0}</Text>
            <View className='stats'>
              <Text>💎×{stats[player.id]?.bigJack || 0}</Text>
              <Text>🏅×{stats[player.id]?.smallJack || 0}</Text>
              <Text>👑×{stats[player.id]?.golden9 || 0}</Text>
              <Text>✅×{stats[player.id]?.normalWin || 0}</Text>
            </View>
          </View>
        ))}
      </View>

      {leaderPlayer && (
        <View className='goal-banner'>
          <Text className='leader-text'>
            <Text className='leader-name'>{leaderPlayer.name}</Text> 领先
          </Text>
        </View>
      )}

      <View className='actions-section'>
        <View className='actions-hint'>
          点击玩家卡片 → 记录该玩家得分
          {'\n'}
          长按玩家卡片 → 修改名字
        </View>

        <View className='actions-grid'>
          <Button className='action-btn btn-foul' onClick={handleFoul}>
            <Text className='icon'>⚠️</Text>
            <Text>犯规</Text>
          </Button>
        </View>
      </View>

      <InputModal
        visible={!!renameTarget}
        title='修改玩家名字'
        placeholder='请输入昵称'
        initialValue={renameTarget?.name || ''}
        onCancel={() => setRenameTarget(null)}
        onConfirm={(v) => {
          if (renameTarget) renamePlayer(renameTarget.id, v)
          setRenameTarget(null)
        }}
      />
    </View>
  )
}
