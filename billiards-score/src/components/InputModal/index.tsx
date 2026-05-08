import { View, Text, Input } from '@tarojs/components'
import { useEffect, useState } from 'react'
import './index.scss'

interface Props {
  visible: boolean
  title: string
  placeholder?: string
  initialValue?: string
  maxLength?: number
  onConfirm: (value: string) => void
  onCancel: () => void
}

export default function InputModal({
  visible,
  title,
  placeholder,
  initialValue = '',
  maxLength = 20,
  onConfirm,
  onCancel
}: Props) {
  const [value, setValue] = useState(initialValue)

  useEffect(() => {
    if (visible) setValue(initialValue)
  }, [visible, initialValue])

  if (!visible) return null

  const handleConfirm = () => {
    const trimmed = value.trim()
    if (trimmed) onConfirm(trimmed)
  }

  return (
    <View className='input-modal-mask' onClick={onCancel}>
      <View className='input-modal-box' onClick={(e) => e.stopPropagation()}>
        <Text className='input-modal-title'>{title}</Text>
        <Input
          className='input-modal-field'
          value={value}
          placeholder={placeholder}
          maxlength={maxLength}
          focus
          onInput={(e) => setValue(e.detail.value)}
          onConfirm={handleConfirm}
        />
        <View className='input-modal-actions'>
          <View className='input-modal-btn cancel' onClick={onCancel}>
            取消
          </View>
          <View className='input-modal-btn confirm' onClick={handleConfirm}>
            确定
          </View>
        </View>
      </View>
    </View>
  )
}
