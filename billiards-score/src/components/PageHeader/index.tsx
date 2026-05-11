import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import './index.scss'

interface Props {
  title: string
  /** 自定义返回行为；默认 navigateBack(1)，失败 fallback 到首页 */
  onBack?: () => void
  /** 右侧自定义内容 */
  right?: React.ReactNode
}

export default function PageHeader({ title, onBack, right }: Props) {
  const handleBack = () => {
    if (onBack) {
      onBack()
      return
    }
    try {
      const pages = Taro.getCurrentPages()
      if (pages.length > 1) {
        Taro.navigateBack()
      } else {
        Taro.switchTab({ url: '/pages/index/index' }).catch(() =>
          Taro.redirectTo({ url: '/pages/index/index' })
        )
      }
    } catch {
      Taro.switchTab({ url: '/pages/index/index' })
    }
  }

  return (
    <View className='page-header'>
      <View className='ph-back' onClick={handleBack}>
        <Text className='ph-back-text'>←</Text>
      </View>
      <Text className='ph-title'>{title}</Text>
      <View className='ph-right'>{right}</View>
    </View>
  )
}
