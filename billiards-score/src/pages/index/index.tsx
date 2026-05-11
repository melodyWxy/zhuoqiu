import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useState } from 'react'
import { useAuthStore } from '../../core/auth/store'
import LoginSheet from '../../components/LoginSheet'
import './index.scss'

export default function Index() {
  const cloudUser = useAuthStore((s) => s.user)
  const [loginOpen, setLoginOpen] = useState(false)

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

      <View className='game-list'>
        <View className='game-card' onClick={() => startGame('nine-ball')}>
          <Text className='game-icon'>🎱</Text>
          <Text className='game-title'>九球追分</Text>
          <Text className='game-desc'>比谁得分多 · 大金·小金·普胜</Text>
        </View>

        <View className='game-card' onClick={() => startGame('eight-ball')}>
          <Text className='game-icon'>🎱</Text>
          <Text className='game-title'>中式八球</Text>
          <Text className='game-desc'>抢几局，记胜负</Text>
        </View>

        <View className='game-card join-card' onClick={goJoin}>
          <Text className='game-icon'>🔗</Text>
          <Text className='game-title'>加入联机房间</Text>
          <Text className='game-desc'>
            {cloudUser ? '输入 6 位房间码或扫码' : '登录后才能加入'}
          </Text>
        </View>
      </View>

      <LoginSheet visible={loginOpen} onClose={() => setLoginOpen(false)} />
    </View>
  )
}
