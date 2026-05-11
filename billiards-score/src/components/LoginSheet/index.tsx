import { View, Text, Input } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useState } from 'react'
import { authApi } from '../../core/api/auth'
import { useAuthStore } from '../../core/auth/store'
import { tryResumeActiveMatch } from '../../core/match/resume'
import './index.scss'

interface Props {
  visible: boolean
  onClose: () => void
  onSuccess?: () => void
  /** 登录成功后若存在未结束的比赛，自动跳转到对战页。首页/配置页默认用 */
  redirectToActiveOnSuccess?: boolean
}

type Step = 'menu' | 'phone_input' | 'phone_verify'

export default function LoginSheet({ visible, onClose, onSuccess, redirectToActiveOnSuccess }: Props) {
  const [step, setStep] = useState<Step>('menu')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [devHint, setDevHint] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const setSession = useAuthStore((s) => s.setSession)

  if (!visible) return null

  const reset = () => {
    setStep('menu')
    setPhone('')
    setCode('')
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const handleWechat = async () => {
    setLoading(true)
    try {
      let wxCode = 'h5-mock-' + Date.now() // H5 下用 mock
      try {
        const r = await Taro.login()
        if (r.code) wxCode = r.code
      } catch {
        // Taro.login 在 H5 下会 fallback
      }
      const r = await authApi.wechatLogin(wxCode)
      setSession({
        accessToken: r.accessToken,
        refreshToken: r.refreshToken,
        user: r.user
      })
      Taro.showToast({ title: '登录成功', icon: 'success' })
      reset()
      onClose()
      onSuccess?.()
      if (redirectToActiveOnSuccess) await tryResumeActiveMatch()
    } finally {
      setLoading(false)
    }
  }

  const handleSendSms = async () => {
    if (!/^\+?\d{8,15}$/.test(phone)) {
      Taro.showToast({ title: '手机号格式不对', icon: 'none' })
      return
    }
    setLoading(true)
    try {
      const r = await authApi.sendSms(phone, 'login')
      setDevHint(r.devHint ?? null)
      Taro.showToast({
        title: r.devHint ?? '验证码已发（见服务端日志）',
        icon: 'none',
        duration: 3000
      })
      setStep('phone_verify')
    } finally {
      setLoading(false)
    }
  }

  const handleVerify = async () => {
    if (!/^\d{6}$/.test(code)) {
      Taro.showToast({ title: '请输入 6 位验证码', icon: 'none' })
      return
    }
    setLoading(true)
    try {
      const r = await authApi.verifyPhone(phone, code, 'login')
      setSession({
        accessToken: r.accessToken,
        refreshToken: r.refreshToken,
        user: r.user
      })
      Taro.showToast({ title: '登录成功', icon: 'success' })
      reset()
      onClose()
      onSuccess?.()
      if (redirectToActiveOnSuccess) await tryResumeActiveMatch()
    } finally {
      setLoading(false)
    }
  }

  return (
    <View className='login-sheet-mask' onClick={handleClose}>
      <View className='login-sheet-box' onClick={(e) => e.stopPropagation()}>
        {step === 'menu' && (
          <>
            <Text className='login-sheet-title'>登录以同步云端战绩</Text>
            <View className='login-sheet-btn primary' onClick={handleWechat}>
              🟢 微信一键登录
            </View>
            <View className='login-sheet-btn' onClick={() => setStep('phone_input')}>
              📱 手机号登录
            </View>
            <View className='login-sheet-btn cancel' onClick={handleClose}>
              暂不登录
            </View>
          </>
        )}
        {step === 'phone_input' && (
          <>
            <Text className='login-sheet-title'>输入手机号</Text>
            <Input
              className='login-sheet-field'
              type='number'
              value={phone}
              placeholder='如 13812345678'
              onInput={(e) => setPhone(e.detail.value)}
            />
            <View className='login-sheet-btn primary' onClick={handleSendSms}>
              {loading ? '发送中…' : '获取验证码'}
            </View>
            <View className='login-sheet-btn cancel' onClick={() => setStep('menu')}>
              返回
            </View>
          </>
        )}
        {step === 'phone_verify' && (
          <>
            <Text className='login-sheet-title'>输入验证码</Text>
            <Text className='login-sheet-hint'>
              {devHint ?? `已发送到 ${phone}（MVP 阶段查看服务端日志）`}
            </Text>
            <Input
              className='login-sheet-field'
              type='number'
              maxlength={6}
              value={code}
              placeholder='6 位数字'
              onInput={(e) => setCode(e.detail.value)}
            />
            <View className='login-sheet-btn primary' onClick={handleVerify}>
              {loading ? '登录中…' : '登录'}
            </View>
            <View className='login-sheet-btn cancel' onClick={() => setStep('phone_input')}>
              改手机号
            </View>
          </>
        )}
      </View>
    </View>
  )
}
