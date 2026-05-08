import { View, Text } from '@tarojs/components'
import './index.scss'

interface Props {
  visible: boolean
  options: string[]
  current: string
  onPick: (value: string) => void
  onCancel: () => void
}

export default function AvatarPickerModal({
  visible,
  options,
  current,
  onPick,
  onCancel
}: Props) {
  if (!visible) return null

  return (
    <View className='avatar-picker-mask' onClick={onCancel}>
      <View className='avatar-picker-box' onClick={(e) => e.stopPropagation()}>
        <Text className='avatar-picker-title'>选择头像</Text>
        <View className='avatar-grid'>
          {options.map((emoji) => (
            <View
              key={emoji}
              className={`avatar-cell ${current === emoji ? 'active' : ''}`}
              onClick={() => onPick(emoji)}
            >
              <Text className='avatar-cell-emoji'>{emoji}</Text>
            </View>
          ))}
        </View>
        <View className='avatar-picker-cancel' onClick={onCancel}>
          取消
        </View>
      </View>
    </View>
  )
}
