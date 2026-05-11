import { View, Text, Input, Button } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useEffect, useState } from 'react'
import { useAuthStore } from '../../core/auth/store'
import { venueAuthApi } from '../../core/api/venue'
import PageHeader from '../../components/PageHeader'
import './index.scss'

export default function VenueLoginPage() {
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [cooldown, setCooldown] = useState(0)
  const [loading, setLoading] = useState(false)
  const [devHint, setDevHint] = useState<string | null>(null)
  const setVenueSession = useAuthStore((s) => s.setVenueSession)
  const setViewMode = useAuthStore((s) => s.setViewMode)

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  const sendSms = async () => {
    if (!/^\+?\d{8,15}$/.test(phone)) {
      Taro.showToast({ title: '手机号格式不对', icon: 'none' })
      return
    }
    try {
      const r = await venueAuthApi.sendSms(phone)
      setDevHint(r.devHint)
      Taro.showToast({
        title: r.devHint ?? '验证码已发送',
        icon: 'none',
        duration: 3000
      })
      setCooldown(60)
    } catch {
      // client toast
    }
  }

  const handleLogin = async () => {
    if (!/^\+?\d{8,15}$/.test(phone)) {
      Taro.showToast({ title: '手机号格式不对', icon: 'none' })
      return
    }
    if (!/^\d{6}$/.test(code)) {
      Taro.showToast({ title: '请输入 6 位验证码', icon: 'none' })
      return
    }
    setLoading(true)
    try {
      const r = await venueAuthApi.verify({ phoneNumber: phone, code })
      setVenueSession({
        accessToken: r.accessToken,
        refreshToken: r.refreshToken,
        account: r.account
      })
      setViewMode('venue')
      Taro.showToast({ title: '登录成功', icon: 'success' })
      setTimeout(() => {
        Taro.redirectTo({ url: '/pages/venue-apply/index' })
      }, 500)
    } finally {
      setLoading(false)
    }
  }

  const handleApply = () => {
    // 需要先注册/登录拿 token 才能提交申请
    Taro.showToast({
      title: '先用手机号+验证码登录，然后填申请表',
      icon: 'none',
      duration: 2500
    })
  }

  return (
    <View className='venue-login-page'>
      <PageHeader title='球房管理模式' />
      <View className='vl-header'>
        <Text className='vl-emoji'>🏢</Text>
        <Text className='vl-title'>球房管理模式</Text>
        <Text className='vl-sub'>
          管理球房资料 · 查看赛事 · 只读视角（创建请到管理后台）
        </Text>
      </View>

      <View className='vl-form'>
        <Text className='vl-label'>手机号</Text>
        <Input
          className='vl-field'
          type='number'
          value={phone}
          placeholder='138 1234 5678'
          onInput={(e) => setPhone(e.detail.value)}
        />

        <Text className='vl-label'>验证码</Text>
        <View className='vl-code-row'>
          <Input
            className='vl-field vl-field-flex'
            type='number'
            maxlength={6}
            value={code}
            placeholder='6 位数字'
            onInput={(e) => setCode(e.detail.value)}
          />
          <Button
            className='vl-send-btn'
            size='mini'
            disabled={cooldown > 0}
            onClick={sendSms}
          >
            {cooldown > 0 ? `${cooldown}s` : '获取验证码'}
          </Button>
        </View>
        {devHint && <Text className='vl-hint'>{devHint}</Text>}

        <Button
          className='vl-login-btn'
          loading={loading}
          onClick={handleLogin}
        >
          登录
        </Button>
      </View>

      <View className='vl-divider' />

      <View className='vl-apply-section'>
        <Text className='vl-apply-title'>还没有球房账号？</Text>
        <Text className='vl-apply-sub'>
          用上方手机号登录后，即可进入申请入驻流程
        </Text>
        <Button className='vl-apply-btn' onClick={handleApply}>
          🎱 申请球房入驻
        </Button>
      </View>

      <View className='vl-footer'>
        <Text className='vl-footer-text'>
          完整管理功能（发赛事 / 现场控台）请到管理后台
        </Text>
        <Text className='vl-footer-url'>admin.zhuoqiu.xxx</Text>
      </View>
    </View>
  )
}
