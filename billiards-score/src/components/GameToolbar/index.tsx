import { View, Text } from '@tarojs/components'
import { useEffect, useState } from 'react'
import Taro from '@tarojs/taro'
import { useGameTimer, formatElapsed } from '../../core/game/timer'
import './index.scss'

interface Props {
  title: string
  onEnd: (elapsedMs: number) => void
}

export default function GameToolbar({ title, onEnd }: Props) {
  const { isPaused, isRunning, pause, resume, stop } = useGameTimer()
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!isRunning || isPaused) return
    const id = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [isRunning, isPaused])

  const elapsed = useGameTimer.getState().getElapsed()

  const handleEnd = async () => {
    const res = await Taro.showModal({
      title: '结束比赛',
      content: '确认结束本场比赛？',
      confirmText: '结束',
      cancelText: '取消'
    }).catch(() => null)
    if (res && res.confirm) {
      const finalElapsed = useGameTimer.getState().getElapsed()
      onEnd(finalElapsed)
      stop()
      Taro.switchTab({ url: '/pages/index/index' })
    }
  }

  const handleTogglePause = () => {
    if (isPaused) resume()
    else pause()
  }

  return (
    <View className='game-toolbar'>
      <View className='toolbar-left'>
        <Text className='toolbar-title'>{title}</Text>
      </View>
      <View className='toolbar-center'>
        <Text className={`timer ${isPaused ? 'paused' : ''}`}>
          ⏱ {formatElapsed(elapsed)}
          {/* tick 参与 render，避免 lint 警告 */}
          <Text className='tick' style={{ display: 'none' }}>{tick}</Text>
        </Text>
      </View>
      <View className='toolbar-right'>
        <View className='toolbar-btn' onClick={handleTogglePause}>
          {isPaused ? '▶' : '⏸'}
        </View>
        <View className='toolbar-btn btn-end' onClick={handleEnd}>
          ✕
        </View>
      </View>
    </View>
  )
}
