import { View, Text, Input, Textarea, Button, Image } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useEffect, useState } from 'react'
import { useAuthStore } from '../../core/auth/store'
import {
  uploadVenueFile,
  venueApplicationApi,
  venueAuthApi,
  type VenueApplicationItem,
  type VenueMe
} from '../../core/api/venue'
import PageHeader from '../../components/PageHeader'
import './index.scss'

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

interface FormState {
  name: string
  contactName: string
  contactPhone: string
  address: string
  tablesCount: string
  hours: string
  description: string
}

export default function VenueApplyPage() {
  const venueSession = useAuthStore((s) => s.venueSession)
  const setVenueAccount = useAuthStore((s) => s.setVenueAccount)
  const clearVenueSession = useAuthStore((s) => s.clearVenueSession)

  const [me, setMe] = useState<VenueMe | null>(null)
  const [app, setApp] = useState<VenueApplicationItem | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [licenseUrl, setLicenseUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [form, setForm] = useState<FormState>({
    name: '',
    contactName: '',
    contactPhone: venueSession?.account.phoneNumber ?? '',
    address: '',
    tablesCount: '8',
    hours: '10:00-02:00',
    description: ''
  })

  useEffect(() => {
    if (!venueSession) {
      Taro.redirectTo({ url: '/pages/venue-login/index' })
      return
    }
    ;(async () => {
      try {
        const meR = await venueAuthApi.me()
        setMe(meR)
        if (meR.account) {
          setVenueAccount({
            id: meR.account.id,
            phoneNumber: meR.account.phoneNumber,
            nickname: meR.account.nickname,
            role: meR.account.role,
            venueId: meR.account.venueId
          })
        }
        const r = await venueApplicationApi.mine()
        setApp(r.application)
        if (r.application) {
          const p = r.application.payloadJson
          setForm({
            name: p.name,
            contactName: p.contactName,
            contactPhone: p.contactPhone,
            address: p.address,
            tablesCount: String(p.tablesCount),
            hours: p.openHours?.[0]?.hours ?? '10:00-02:00',
            description: p.description ?? ''
          })
          setLicenseUrl(r.application.licenseImage)
        }
      } finally {
        setLoading(false)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const upd = (k: keyof FormState) => (e: { detail: { value: string } }) =>
    setForm((s) => ({ ...s, [k]: e.detail.value }))

  const handleUpload = async () => {
    if (!venueSession) return
    try {
      const res = await Taro.chooseImage({ count: 1, sizeType: ['compressed'] })
      if (!res.tempFilePaths.length) return
      setUploading(true)
      const r = await uploadVenueFile(
        res.tempFilePaths[0],
        'license',
        venueSession.accessToken
      )
      setLicenseUrl(r.url)
      Taro.showToast({ title: '上传成功', icon: 'success' })
    } catch (e) {
      Taro.showToast({ title: (e as Error).message ?? '上传失败', icon: 'none' })
    } finally {
      setUploading(false)
    }
  }

  const handleSubmit = async () => {
    if (!form.name.trim()) return Taro.showToast({ title: '请填店名', icon: 'none' })
    if (!form.contactName.trim())
      return Taro.showToast({ title: '请填联系人', icon: 'none' })
    if (!/^\+?\d{8,15}$/.test(form.contactPhone))
      return Taro.showToast({ title: '联系电话格式不对', icon: 'none' })
    if (!form.address.trim())
      return Taro.showToast({ title: '请填地址', icon: 'none' })
    const tables = parseInt(form.tablesCount, 10)
    if (!tables || tables < 1)
      return Taro.showToast({ title: '台桌数不对', icon: 'none' })
    if (!licenseUrl)
      return Taro.showToast({ title: '请上传营业执照', icon: 'none' })

    setSubmitting(true)
    try {
      const r = await venueApplicationApi.submit({
        payload: {
          name: form.name,
          contactName: form.contactName,
          contactPhone: form.contactPhone,
          address: form.address,
          tablesCount: tables,
          openHours: DAYS.map((d) => ({ day: d, hours: form.hours })),
          description: form.description
        },
        licenseImage: licenseUrl
      })
      setApp(r.application)
      Taro.showToast({ title: '已提交，等待审核', icon: 'success' })
    } finally {
      setSubmitting(false)
    }
  }

  const handleLogout = async () => {
    try {
      await venueAuthApi.logout()
    } catch {
      // ignore
    }
    clearVenueSession()
    Taro.switchTab({ url: '/pages/me/index' })
  }

  if (loading) {
    return <View className='va-loading'>加载中…</View>
  }

  // 已绑定 venue → 入驻成功页
  if (me?.venue) {
    return (
      <View className='venue-apply-page'>
        <PageHeader title='球房入驻' />
        <View className='va-success-card'>
          <Text className='va-success-icon'>✅</Text>
          <Text className='va-success-title'>{me.venue.name}</Text>
          <Text className='va-success-sub'>已通过审核 · 入驻成功</Text>
          <View className='va-info'>
            <View className='va-info-row'>
              <Text className='va-info-label'>球房 ID</Text>
              <Text className='va-info-value'>{me.venue.id}</Text>
            </View>
            <View className='va-info-row'>
              <Text className='va-info-label'>地址</Text>
              <Text className='va-info-value'>{me.venue.address}</Text>
            </View>
            <View className='va-info-row'>
              <Text className='va-info-label'>台桌数</Text>
              <Text className='va-info-value'>{me.venue.tablesCount}</Text>
            </View>
          </View>
          <Text className='va-tip'>
            管理功能（发赛事 / 现场控台）请到管理后台操作
          </Text>
          <Button className='va-btn-secondary' onClick={handleLogout}>
            退出商家登录
          </Button>
        </View>
      </View>
    )
  }

  // 已有进行中的申请 → 状态页
  if (app && app.status === 'pending') {
    const p = app.payloadJson
    return (
      <View className='venue-apply-page'>
        <PageHeader title='球房入驻' />
        <View className='va-status-card'>
          <Text className='va-status-icon'>🕐</Text>
          <Text className='va-status-title'>审核中…</Text>
          <Text className='va-status-sub'>
            通常 1-3 个工作日，请耐心等待
          </Text>
        </View>
        <View className='va-summary'>
          <Text className='va-summary-title'>你提交的内容</Text>
          <View className='va-info-row'>
            <Text className='va-info-label'>店名</Text>
            <Text className='va-info-value'>{p.name}</Text>
          </View>
          <View className='va-info-row'>
            <Text className='va-info-label'>地址</Text>
            <Text className='va-info-value'>{p.address}</Text>
          </View>
          <View className='va-info-row'>
            <Text className='va-info-label'>台桌数</Text>
            <Text className='va-info-value'>{p.tablesCount}</Text>
          </View>
          {app.licenseImage && (
            <Image
              className='va-license-thumb'
              src={app.licenseImage}
              mode='widthFix'
            />
          )}
        </View>
        <Button className='va-btn-secondary' onClick={handleLogout}>
          退出商家登录
        </Button>
      </View>
    )
  }

  // 没申请、或被驳回 → 表单
  return (
    <View className='venue-apply-page'>
      {app?.status === 'rejected' && (
        <View className='va-rejected-card'>
          <Text className='va-rejected-icon'>❌</Text>
          <Text className='va-rejected-title'>上次申请被驳回</Text>
          <Text className='va-rejected-reason'>
            {app.rejectReason ?? '原因未填'}
          </Text>
          <Text className='va-rejected-sub'>请修改后重新提交</Text>
        </View>
      )}

      <View className='va-form'>
        <Text className='va-section-title'>基础信息</Text>

        <Text className='va-label'>店铺名称 *</Text>
        <Input
          className='va-field'
          value={form.name}
          placeholder='如：张三台球俱乐部'
          onInput={upd('name')}
        />

        <Text className='va-label'>联系人 *</Text>
        <Input
          className='va-field'
          value={form.contactName}
          placeholder='张三'
          onInput={upd('contactName')}
        />

        <Text className='va-label'>联系电话 *</Text>
        <Input
          className='va-field'
          type='number'
          value={form.contactPhone}
          placeholder='138 1234 5678'
          onInput={upd('contactPhone')}
        />

        <Text className='va-label'>详细地址 *</Text>
        <Textarea
          className='va-field va-textarea'
          value={form.address}
          placeholder='北京朝阳区 xx 路 88 号 3 层'
          onInput={upd('address')}
        />

        <Text className='va-section-title'>场地信息</Text>

        <Text className='va-label'>台桌总数 *</Text>
        <Input
          className='va-field'
          type='number'
          value={form.tablesCount}
          onInput={upd('tablesCount')}
        />

        <Text className='va-label'>营业时间（每天）*</Text>
        <Input
          className='va-field'
          value={form.hours}
          placeholder='10:00-02:00'
          onInput={upd('hours')}
        />

        <Text className='va-label'>店铺简介（选填）</Text>
        <Textarea
          className='va-field va-textarea'
          value={form.description}
          placeholder='营业理念、特色项目'
          onInput={upd('description')}
        />

        <Text className='va-section-title'>资质</Text>
        <Text className='va-label'>营业执照 *</Text>
        {licenseUrl ? (
          <View className='va-license-preview'>
            <Image
              className='va-license-thumb'
              src={licenseUrl}
              mode='widthFix'
            />
            <Button
              className='va-btn-text'
              size='mini'
              onClick={() => setLicenseUrl(null)}
            >
              重新上传
            </Button>
          </View>
        ) : (
          <Button
            className='va-btn-upload'
            loading={uploading}
            onClick={handleUpload}
          >
            📎 选择图片上传
          </Button>
        )}

        <Button
          className='va-btn-primary'
          loading={submitting}
          onClick={handleSubmit}
        >
          提交审核
        </Button>

        <Button
          className='va-btn-secondary'
          onClick={() => Taro.switchTab({ url: '/pages/me/index' })}
        >
          稍后再说
        </Button>
      </View>
    </View>
  )
}
