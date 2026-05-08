import { View, Text } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useState } from 'react'
import { useEightBallStore } from '../../core/game/eightBallStore'
import { useMatchStore } from '../../core/match/store'
import GameToolbar from '../../components/GameToolbar'
import InputModal from '../../components/InputModal'
import './index.scss'

export default function EightBallPage() {
  const { players, targetWins, initGame, addWin, renamePlayer, clearGame } = useEightBallStore()

  useDidShow(() => {
    if (players.length === 0) {
      initGame(['我', '对手'], 5)
    }
  })

  const leaderIdx = (() => {
    if (players.length < 2) return -1
    if (players[0].wins > players[1].wins) return 0
    if (players[1].wins > players[0].wins) return 1
    return -1
  })()

  const handleCardClick = async (idx: number) => {
    const player = players[idx]
    const res = await Taro.showModal({
      title: '确认本局胜',
      content: `${player.name} 赢下本局吗？`,
      confirmText: '确认',
      cancelText: '取消'
    }).catch(() => null)
    if (res && res.confirm) {
      addWin(idx)
      const newWins = player.wins + 1
      if (newWins >= targetWins) {
        Taro.showToast({
          title: `${player.name} 夺得比赛！`,
          icon: 'success',
          duration: 2000
        })
      }
    }
  }

  const [renameTarget, setRenameTarget] = useState<{ idx: number; name: string } | null>(null)

  const handleCardLongPress = (idx: number) => {
    setRenameTarget({ idx, name: players[idx].name })
  }

  const handleEnd = (elapsedMs: number) => {
    if (players.length === 0) {
      clearGame()
      return
    }
    const summaries = players.map((p) => ({ name: p.name, wins: p.wins }))
    const top = summaries.reduce((a, b) =>
      (a.wins ?? 0) >= (b.wins ?? 0) ? a : b
    )
    useMatchStore.getState().saveMatch({
      type: 'eight-ball',
      endedAt: Date.now(),
      durationMs: elapsedMs,
      players: summaries,
      winnerName: top.name
    })
    clearGame()
  }

  return (
    <View className='eight-ball-page'>
      <GameToolbar title='中式八球' onEnd={handleEnd} />

      <View className='players-section'>
        {players.map((player, idx) => (
          <View
            key={idx}
            className='player-card'
            onClick={() => handleCardClick(idx)}
            onLongPress={() => handleCardLongPress(idx)}
          >
            <View className='avatar'>🧍</View>
            <Text className='name'>{player.name}</Text>
            <Text className='wins'>{player.wins}</Text>
            <Text className='label'>胜</Text>
          </View>
        ))}
      </View>

      <View className='goal-banner'>
        <Text className='goal-text'>
          抢 <Text className='goal-value'>{targetWins}</Text> 局
        </Text>
        {leaderIdx >= 0 && (
          <Text className='leader-text'>
            <Text className='leader-name'>{players[leaderIdx].name}</Text> 领先
          </Text>
        )}
      </View>

      <View className='actions-section'>
        <View className='actions-hint'>
          点击玩家卡片 → 该玩家赢下本局
          {'\n'}
          长按玩家卡片 → 修改名字
        </View>

      </View>

      <InputModal
        visible={!!renameTarget}
        title='修改玩家名字'
        placeholder='请输入昵称'
        initialValue={renameTarget?.name || ''}
        onCancel={() => setRenameTarget(null)}
        onConfirm={(v) => {
          if (renameTarget) renamePlayer(renameTarget.idx, v)
          setRenameTarget(null)
        }}
      />
    </View>
  )
}
