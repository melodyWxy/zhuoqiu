import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import './index.scss'

export default function Index() {
  const startGame = (type: 'nine-ball' | 'eight-ball') => {
    Taro.navigateTo({ url: `/pages/config/index?type=${type}` })
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
      </View>
    </View>
  )
}
