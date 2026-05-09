import { View, Text, Input } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useState } from 'react'
import { authApi, meApi } from '../../core/api/auth'
import { useAuthStore } from '../../core/auth/store'
import '../LoginSheet/index.scss'

interface Props {
  visible: boolean
  onClose: () => void
  onSuccess?: () => void
}

type Step = 'input_phone' | 'input_code' | 'conflict_confirm' | 'merge_sms' | 'merge_confirm'

/**
 * 绑定手机号 —— 含冲突处理：
 * 1. 用户输入手机号 → 发 bind SMS
 * 2. 输入验证码 → 调 /me/bind-phone
 * 3. 若号被占 → 询问是否合并账号 → 另发 merge SMS → 输验证码 → 调 /me/merge-accounts
 */
export default function BindPhoneSheet({ visible, onClose, onSuccess }: Props) {
  const [step, setStep] = useState<Step>('input_phone')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [devHint, setDevHint] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const setUser = useAuthStore((s) => s.setUser)

  if (!visible) return null

  const reset = () => {
    setStep('input_phone')
    setPhone('')
    setCode('')
  }
  const handleClose = () => { reset(); onClose() }

  const handleSendBindSms = async () => {
    if (!/^\+?\d{8,15}$/.test(phone)) {
      Taro.showToast({ title: '手机号格式不对', icon: 'none' })
      return
    }
    setLoading(true)
    try {
      const r = await authApi.sendSms(phone, 'bind')
      setDevHint(r.devHint ?? null)
      Taro.showToast({
        title: r.devHint ?? '验证码已发（见服务端日志）',
        icon: 'none',
        duration: 3000
      })
      setStep('input_code')
      setCode('')
    } finally {
      setLoading(false)
    }
  }

  const handleBind = async () => {
    if (!/^\d{6}$/.test(code)) {
      Taro.showToast({ title: '请输入 6 位验证码', icon: 'none' })
      return
    }
    setLoading(true)
    try {
      const r = await meApi.bindPhone(phone, code)
      if (r.bound) {
        const me = await meApi.get()
        setUser(me)
        Taro.showToast({ title: '已绑定', icon: 'success' })
        reset(); onClose(); onSuccess?.()
      } else {
        // 冲突：进入合并确认
        setStep('conflict_confirm')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleConfirmMerge = async () => {
    setLoading(true)
    try {
      const r = await authApi.sendSms(phone, 'merge')
      setDevHint(r.devHint ?? null)
      Taro.showToast({
        title: r.devHint ?? '验证码已发',
        icon: 'none',
        duration: 3000
      })
      setStep('merge_confirm')
      setCode('')
    } finally {
      setLoading(false)
    }
  }

  const handleDoMerge = async () => {
    if (!/^\d{6}$/.test(code)) {
      Taro.showToast({ title: '请输入 6 位验证码', icon: 'none' })
      return
    }
    setLoading(true)
    try {
      const r = await meApi.mergeAccounts(phone, code, 'keep_current')
      if (r.merged) {
        const me = await meApi.get()
        setUser(me)
        Taro.showToast({ title: '账号已合并', icon: 'success' })
        reset(); onClose(); onSuccess?.()
      } else {
        Taro.showToast({ title: '无需合并', icon: 'none' })
        reset(); onClose()
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <View className='login-sheet-mask' onClick={handleClose}>
      <View className='login-sheet-box' onClick={(e) => e.stopPropagation()}>
        {step === 'input_phone' && (
          <>
            <Text className='login-sheet-title'>绑定手机号</Text>
            <Text className='login-sheet-hint'>绑定后可用手机号登录</Text>
            <Input
              className='login-sheet-field'
              type='number'
              value={phone}
              placeholder='如 13812345678'
              onInput={(e) => setPhone(e.detail.value)}
            />
            <View className='login-sheet-btn primary' onClick={handleSendBindSms}>
              {loading ? '发送中…' : '获取验证码'}
            </View>
            <View className='login-sheet-btn cancel' onClick={handleClose}>
              取消
            </View>
          </>
        )}
        {step === 'input_code' && (
          <>
            <Text className='login-sheet-title'>输入验证码</Text>
            <Text className='login-sheet-hint'>{devHint ?? `已发到 ${phone}`}</Text>
            <Input
              className='login-sheet-field'
              type='number'
              maxlength={6}
              value={code}
              placeholder='6 位数字'
              onInput={(e) => setCode(e.detail.value)}
            />
            <View className='login-sheet-btn primary' onClick={handleBind}>
              {loading ? '绑定中…' : '确认绑定'}
            </View>
            <View className='login-sheet-btn cancel' onClick={() => setStep('input_phone')}>
              改手机号
            </View>
          </>
        )}
        {step === 'conflict_confirm' && (
          <>
            <Text className='login-sheet-title'>手机号已被占用</Text>
            <Text className='login-sheet-hint'>
              {phone} 已属另一个账号。合并后该账号的战绩和微信/抖音绑定会并入当前账号。
            </Text>
            <View className='login-sheet-btn primary' onClick={handleConfirmMerge}>
              确认合并
            </View>
            <View className='login-sheet-btn cancel' onClick={handleClose}>
              不合并
            </View>
          </>
        )}
        {step === 'merge_confirm' && (
          <>
            <Text className='login-sheet-title'>验证后完成合并</Text>
            <Text className='login-sheet-hint'>
              {devHint ?? `输入验证码以确认对手机号 ${phone} 的所有权`}
            </Text>
            <Input
              className='login-sheet-field'
              type='number'
              maxlength={6}
              value={code}
              placeholder='6 位数字'
              onInput={(e) => setCode(e.detail.value)}
            />
            <View className='login-sheet-btn primary' onClick={handleDoMerge}>
              {loading ? '合并中…' : '确认合并'}
            </View>
            <View className='login-sheet-btn cancel' onClick={handleClose}>
              取消
            </View>
          </>
        )}
      </View>
    </View>
  )
}
