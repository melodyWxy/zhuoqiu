import { View, Text, Textarea } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useEffect, useState } from 'react'
import { feedbackApi, type FeedbackType } from '../../core/api/feedback'
import './index.scss'

interface Props {
  visible: boolean
  onClose: () => void
}

const TYPE_OPTIONS: { value: FeedbackType; label: string }[] = [
  { value: 'bug', label: 'bug 反馈' },
  { value: 'suggestion', label: '优化建议' },
  { value: 'cooperation', label: '合作留言' }
]

const MAX_LEN = 500

export default function FeedbackModal({ visible, onClose }: Props) {
  const [type, setType] = useState<FeedbackType>('bug')
  const [content, setContent] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (visible) {
      setType('bug')
      setContent('')
      setSubmitting(false)
    }
  }, [visible])

  if (!visible) return null

  const handleSubmit = async () => {
    const trimmed = content.trim()
    if (!trimmed) {
      Taro.showToast({ title: '请填写反馈内容', icon: 'none' })
      return
    }
    setSubmitting(true)
    try {
      await feedbackApi.submit({ type, content: trimmed })
      Taro.showToast({ title: '反馈已提交，感谢', icon: 'success' })
      onClose()
    } catch {
      // callApi 已 toast 错误
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <View className='feedback-modal-mask' onClick={onClose}>
      <View
        className='feedback-modal-box'
        onClick={(e) => e.stopPropagation()}
      >
        <Text className='feedback-modal-title'>帮助与反馈</Text>

        <Text className='feedback-modal-label'>反馈类型</Text>
        <View className='feedback-modal-types'>
          {TYPE_OPTIONS.map((opt) => (
            <View
              key={opt.value}
              className={`feedback-modal-type-chip ${
                type === opt.value ? 'active' : ''
              }`}
              onClick={() => setType(opt.value)}
            >
              {opt.label}
            </View>
          ))}
        </View>

        <Text className='feedback-modal-label'>反馈内容</Text>
        <Textarea
          className='feedback-modal-textarea'
          value={content}
          maxlength={MAX_LEN}
          placeholder='请描述你遇到的问题、改进建议或合作意向（最多 500 字）'
          onInput={(e) => setContent(e.detail.value)}
        />
        <Text className='feedback-modal-counter'>
          {content.length}/{MAX_LEN}
        </Text>

        <View className='feedback-modal-actions'>
          <View
            className='feedback-modal-btn cancel'
            onClick={() => !submitting && onClose()}
          >
            取消
          </View>
          <View
            className={`feedback-modal-btn confirm ${
              submitting ? 'is-loading' : ''
            }`}
            onClick={() => !submitting && handleSubmit()}
          >
            {submitting ? '提交中…' : '提交'}
          </View>
        </View>
      </View>
    </View>
  )
}
