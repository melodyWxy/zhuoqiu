import { View, Text, Input, Button, Image } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useEffect, useState } from 'react'
import { authApi, meApi } from '../../core/api/auth'
import { useAuthStore, type CloudUser } from '../../core/auth/store'
import { tryResumeActiveMatch } from '../../core/match/resume'
import { useLegalConsent } from '../../hooks/useLegalConsent'
import { ensureWxPrivacyAuthorized, isWeapp } from '../../utils/wxPrivacy'
import './index.scss'

const DEFAULT_WECHAT_NICKNAME = '微信用户'

function needsProfileFill(user: CloudUser | undefined | null): boolean {
  if (!user) return false
  return !user.nickname || user.nickname === DEFAULT_WECHAT_NICKNAME
}

interface Props {
  visible: boolean
  onClose: () => void
  onSuccess?: () => void
  /** 登录成功后若存在未结束的比赛，自动跳转到对战页。首页/配置页默认用 */
  redirectToActiveOnSuccess?: boolean
}

type Step =
  | 'privacy'
  | 'menu'
  | 'phone_input'
  | 'phone_verify'
  | 'wechat_loading'
  | 'wechat_phone'
  | 'wechat_profile'

export default function LoginSheet({ visible, onClose, onSuccess, redirectToActiveOnSuccess }: Props) {
  const { agreed, accept } = useLegalConsent()
  const [step, setStep] = useState<Step>(() => initialStep(agreed))
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [devHint, setDevHint] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [profileNickname, setProfileNickname] = useState('')
  const [profileAvatarLocal, setProfileAvatarLocal] = useState<string | null>(null)
  const setSession = useAuthStore((s) => s.setSession)
  const setUser = useAuthStore((s) => s.setUser)

  const reset = () => {
    setStep(initialStep(agreed))
    setPhone('')
    setCode('')
    setProfileNickname('')
    setProfileAvatarLocal(null)
  }

  // wechat_phone / wechat_profile 都跑完再 finish；只在 weapp 才走资料补全（H5 没有 chooseAvatar）
  const proceedAfterPhoneCollected = async (currentUser: CloudUser) => {
    if (isWeapp() && needsProfileFill(currentUser)) {
      setProfileNickname('') // 让用户从 type=nickname 输入
      setProfileAvatarLocal(null)
      setStep('wechat_profile')
      return
    }
    await closeSheetWithToast('登录成功')
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const closeSheetWithToast = async (toastTitle: string) => {
    Taro.showToast({ title: toastTitle, icon: 'success' })
    reset()
    onClose()
    onSuccess?.()
    if (redirectToActiveOnSuccess) await tryResumeActiveMatch()
  }

  const finishLogin = async (
    accessToken: string,
    refreshToken: string,
    user: CloudUser
  ) => {
    setSession({ accessToken, refreshToken, user })
    await closeSheetWithToast('登录成功')
  }

  /**
   * 微信登录主流程：
   *  - 成功且 user.phoneNumber 已绑定 → 直接 finishLogin（关闭 sheet）
   *  - 成功但无手机号 → 保持登录态（已 setSession），切到 wechat_phone 步骤让用户授权手机号
   *  - 失败 → 退回 privacy / menu
   */
  const handleWechat = async () => {
    setLoading(true)
    setStep('wechat_loading')
    try {
      let wxCode = 'h5-mock-' + Date.now()
      try {
        const r = await Taro.login()
        console.log('[LoginSheet] Taro.login 返回:', r)
        if (r.code) wxCode = r.code
      } catch (e) {
        console.warn('[LoginSheet] Taro.login 失败，降级 mock:', e)
      }
      console.log('[LoginSheet] 提交 wechatLogin code:', wxCode)
      const r = await authApi.wechatLogin(wxCode)
      console.log('[LoginSheet] wechatLogin 返回:', {
        user: r.user,
        accessTokenLen: r.accessToken?.length,
        refreshTokenLen: r.refreshToken?.length
      })
      // 先建立会话，否则 wechat/phone 接口拿不到鉴权 header
      setSession({ accessToken: r.accessToken, refreshToken: r.refreshToken, user: r.user })
      if (!r.user.phoneNumber) {
        setStep('wechat_phone')
      } else {
        await proceedAfterPhoneCollected(r.user)
      }
    } catch (e) {
      setStep(isWeapp() ? 'privacy' : 'menu')
      throw e
    } finally {
      setLoading(false)
    }
  }

  const handleGetPhoneNumber = async (e: any) => {
    const detail = e?.detail ?? {}
    console.log('[LoginSheet] getPhoneNumber 回调:', detail)
    const code: string | undefined = detail.code
    if (!code) {
      // 用户拒绝授权 / errMsg 非 ok
      Taro.showToast({ title: '已取消手机号授权', icon: 'none' })
      return
    }
    setLoading(true)
    try {
      const r = await authApi.wechatBindPhone(code)
      console.log('[LoginSheet] wechatBindPhone 返回:', r.user)
      setUser(r.user)
      await proceedAfterPhoneCollected(r.user)
    } catch (err) {
      console.warn('[LoginSheet] wechatBindPhone 失败:', err)
      Taro.showToast({ title: (err as Error)?.message || '获取手机号失败', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  const handleSkipPhone = async () => {
    // 用户已登录但未绑手机号；之后可在「我」页面通过 BindPhoneSheet 补绑。
    // 仍然检查是否要补资料（昵称 / 头像）：把当前 store 里的 user 喂给 proceed
    const current = useAuthStore.getState().user
    if (current) {
      await proceedAfterPhoneCollected(current)
    } else {
      await closeSheetWithToast('登录成功')
    }
  }

  const handleChooseAvatar = (e: any) => {
    const url: string | undefined = e?.detail?.avatarUrl
    console.log('[LoginSheet] chooseAvatar 回调:', e?.detail)
    if (!url) {
      Taro.showToast({ title: '未选择头像', icon: 'none' })
      return
    }
    setProfileAvatarLocal(url)
  }

  const handleSaveProfile = async () => {
    const trimmedNick = profileNickname.trim()
    if (!trimmedNick && !profileAvatarLocal) {
      // 啥也没改 → 等同跳过
      await closeSheetWithToast('登录成功')
      return
    }
    setLoading(true)
    try {
      const patch: { nickname?: string; avatar?: string } = {}
      if (trimmedNick) patch.nickname = trimmedNick

      if (profileAvatarLocal) {
        const up = await meApi.uploadAvatar(profileAvatarLocal)
        console.log('[LoginSheet] uploadAvatar 返回:', up.url)
        patch.avatar = up.url
      }

      if (Object.keys(patch).length > 0) {
        const r = await meApi.update(patch)
        console.log('[LoginSheet] meApi.update 返回:', r)
        // 合并到 store user（保留 phoneNumber 等其他字段）
        const current = useAuthStore.getState().user
        if (current) {
          setUser({
            ...current,
            nickname: r.nickname,
            avatar: r.avatar
          })
        }
      }
      await closeSheetWithToast('登录成功')
    } catch (err) {
      console.warn('[LoginSheet] saveProfile 失败:', err)
      Taro.showToast({ title: (err as Error)?.message || '保存失败', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  const handleSkipProfile = async () => {
    // 保留 server 默认昵称（'微信用户'），用户可在「我」页面再改
    await closeSheetWithToast('登录成功')
  }

  // visible 由 false 翻 true 时，根据当前 agreed 状态决定起手 step
  // weapp 已同意 → 直接走微信登录，不展示菜单；H5 已同意 → 直接进 menu
  useEffect(() => {
    if (!visible) return
    if (!agreed) {
      setStep('privacy')
      return
    }
    if (isWeapp()) {
      setStep('wechat_loading')
      handleWechat().catch(() => {
        // 错误已在 handleWechat 内 toast 不到的话这里兜底
        Taro.showToast({ title: '登录失败，请重试', icon: 'none' })
      })
    } else {
      setStep('menu')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible])

  if (!visible) return null

  const handleAgree = async () => {
    accept()
    if (isWeapp()) {
      setLoading(true)
      try {
        const ok = await ensureWxPrivacyAuthorized()
        if (!ok) {
          Taro.showToast({ title: '需同意隐私政策才能继续登录', icon: 'none' })
          setLoading(false)
          return
        }
        // 直登
        await handleWechat()
      } catch {
        Taro.showToast({ title: '登录失败，请重试', icon: 'none' })
      } finally {
        setLoading(false)
      }
    } else {
      setStep('menu')
    }
  }

  const openLegal = (type: 'privacy' | 'terms') => {
    Taro.navigateTo({ url: `/pages/legal/index?type=${type}` }).catch(() => {})
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
      await finishLogin(r.accessToken, r.refreshToken, r.user)
    } finally {
      setLoading(false)
    }
  }

  return (
    <View className='login-sheet-mask' onClick={handleClose}>
      <View className='login-sheet-box' onClick={(e) => e.stopPropagation()}>
        {step === 'privacy' && (
          <>
            <Text className='login-sheet-title'>用户服务协议与隐私政策</Text>
            <Text className='login-sheet-hint'>
              为了向你提供登录、联机比赛、赛事报名等服务，我们需要在你授权后收集手机号或账号信息。请阅读并同意下列协议后继续：
            </Text>
            <View className='legal-links'>
              <Text className='legal-link' onClick={() => openLegal('terms')}>《用户服务协议》</Text>
              <Text className='legal-link-sep'>·</Text>
              <Text className='legal-link' onClick={() => openLegal('privacy')}>《隐私政策》</Text>
            </View>
            <View
              className={`login-sheet-btn primary ${loading ? 'is-loading' : ''}`}
              onClick={loading ? undefined : handleAgree}
            >
              {loading ? '处理中…' : '同意并继续'}
            </View>
            <View className='login-sheet-btn cancel' onClick={handleClose}>
              不同意
            </View>
          </>
        )}

        {step === 'wechat_loading' && (
          <>
            <Text className='login-sheet-title'>正在登录…</Text>
            <Text className='login-sheet-hint'>请在系统弹窗中确认授权</Text>
          </>
        )}

        {step === 'wechat_phone' && (
          <>
            <Text className='login-sheet-title'>授权手机号以完成登录</Text>
            <Text className='login-sheet-hint'>
              我们仅在你授权后获取你的手机号，用于赛事报名识别与客服对账。
            </Text>
            <Button
              className={`login-sheet-btn primary ${loading ? 'is-loading' : ''}`}
              openType='getPhoneNumber'
              onGetPhoneNumber={handleGetPhoneNumber}
              disabled={loading}
            >
              {loading ? '正在绑定…' : '📱 手机号快捷登录'}
            </Button>
            <View className='login-sheet-btn cancel' onClick={handleSkipPhone}>
              稍后绑定
            </View>
          </>
        )}

        {step === 'wechat_profile' && (
          <>
            <Text className='login-sheet-title'>设置头像和昵称</Text>
            <Text className='login-sheet-hint'>
              为了在比赛中区分参赛玩家，请设置头像和昵称。
            </Text>
            <View className='profile-row'>
              <Button
                className='profile-avatar-btn'
                openType='chooseAvatar'
                onChooseAvatar={handleChooseAvatar}
              >
                {profileAvatarLocal ? (
                  <Image className='profile-avatar-img' src={profileAvatarLocal} mode='aspectFill' />
                ) : (
                  <Text className='profile-avatar-placeholder'>👤</Text>
                )}
              </Button>
              <Text className='profile-avatar-hint'>点击选择头像</Text>
            </View>
            <Input
              className='login-sheet-field'
              type='nickname'
              value={profileNickname}
              placeholder='点击输入昵称'
              maxlength={32}
              onInput={(e) => setProfileNickname(e.detail.value)}
            />
            <View
              className={`login-sheet-btn primary ${loading ? 'is-loading' : ''}`}
              onClick={loading ? undefined : handleSaveProfile}
            >
              {loading ? '保存中…' : '保存'}
            </View>
            <View className='login-sheet-btn cancel' onClick={handleSkipProfile}>
              跳过
            </View>
          </>
        )}

        {step === 'menu' && (
          <>
            <Text className='login-sheet-title'>登录以同步云端战绩</Text>
            <View className='login-sheet-btn primary' onClick={() => setStep('phone_input')}>
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

function initialStep(agreed: boolean): Step {
  if (!agreed) return 'privacy'
  if (isWeapp()) return 'wechat_loading'
  return 'menu'
}
