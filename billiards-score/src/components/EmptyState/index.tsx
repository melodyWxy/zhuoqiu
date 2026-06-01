import { View, Text } from '@tarojs/components'
import './index.scss'

interface Props {
  /** 顶部 emoji，默认 🎱 */
  icon?: string
  /** 主标题，必填 */
  title: string
  /** 副描述，可选 */
  description?: string
  /** 底部 CTA 按钮，可选 */
  ctaText?: string
  onCta?: () => void
}

/**
 * 列表 / 搜索 / 详情页的空态兜底。
 * 用 emoji 而非图片资源，避免拖大 weapp 包体；与项目「emoji 即 icon」风格一致。
 */
export default function EmptyState({ icon = '🎱', title, description, ctaText, onCta }: Props) {
  return (
    <View className='empty-state'>
      <Text className='empty-state-icon'>{icon}</Text>
      <Text className='empty-state-title'>{title}</Text>
      {description ? <Text className='empty-state-desc'>{description}</Text> : null}
      {ctaText && onCta ? (
        <View className='empty-state-cta' onClick={onCta}>
          {ctaText}
        </View>
      ) : null}
    </View>
  )
}
