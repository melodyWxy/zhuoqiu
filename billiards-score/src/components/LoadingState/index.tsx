import { View, Text } from '@tarojs/components'
import './index.scss'

interface Props {
  /** 提示文字，默认「加载中」 */
  text?: string
  /** 「block」(独占一块、居中、padding 60) 还是「inline」(随父布局，small) */
  variant?: 'block' | 'inline'
}

/**
 * 异步内容兜底。三个金色圆点轮流跳动 + 文案。
 * weapp / H5 通用，无图片资源。
 */
export default function LoadingState({ text = '加载中', variant = 'block' }: Props) {
  return (
    <View className={`loading-state loading-state--${variant}`}>
      <View className='loading-state-dots'>
        <View className='loading-state-dot' />
        <View className='loading-state-dot' />
        <View className='loading-state-dot' />
      </View>
      <Text className='loading-state-text'>{text}</Text>
    </View>
  )
}
