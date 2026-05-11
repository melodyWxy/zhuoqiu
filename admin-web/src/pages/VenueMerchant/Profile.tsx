import { useEffect, useState } from 'react'
import {
  App,
  Button,
  Card,
  Form,
  Image,
  Input,
  InputNumber,
  Space,
  Spin,
  Typography,
  Upload
} from 'antd'
import type { UploadFile, UploadProps } from 'antd'
import { UploadOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useVenueAuthStore } from '../../stores/venue-auth'
import {
  uploadApi,
  venueAuthApi,
  venueMyApi
} from '../../api/venue'
import { venueHttp } from '../../api/venue-client'

const { Title, Paragraph } = Typography

interface FormValues {
  name: string
  address: string
  phone: string
  tablesCount: number
  hours: string
  description?: string
}

interface VenueSnapshot {
  id: string
  name: string
  address: string
  phone: string
  coverImage: string | null
  tablesCount: number
  openHoursJson: Record<string, string> | null
  description: string | null
}

export default function Profile() {
  const navigate = useNavigate()
  const { message } = App.useApp()
  const [form] = Form.useForm<FormValues>()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [coverUrl, setCoverUrl] = useState<string | null>(null)
  const [coverFile, setCoverFile] = useState<UploadFile | null>(null)
  const [uploading, setUploading] = useState(false)
  const [venueId, setVenueId] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      const token = useVenueAuthStore.getState().accessToken
      if (!token) {
        navigate('/venue-login', { replace: true })
        return
      }
      try {
        const r = await venueAuthApi.me()
        if (!r.venue) {
          message.warning('你还没有绑定球房')
          navigate('/apply', { replace: true })
          return
        }
        // 拉完整 venue 信息（me 只返回摘要）
        const full = (await venueHttp
          .get<{ venue: VenueSnapshot }>(`/venues/${r.venue.id}`)
          .then((x) => x.data as unknown as { venue: VenueSnapshot })).venue
        setVenueId(full.id)
        setCoverUrl(full.coverImage)
        if (full.coverImage) {
          setCoverFile({
            uid: 'cover',
            name: 'cover',
            status: 'done',
            url: full.coverImage
          })
        }
        const hoursMon =
          full.openHoursJson?.mon ?? Object.values(full.openHoursJson ?? {})[0] ?? ''
        form.setFieldsValue({
          name: full.name,
          address: full.address,
          phone: full.phone,
          tablesCount: full.tablesCount,
          hours: hoursMon,
          description: full.description ?? undefined
        })
      } finally {
        setLoading(false)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const uploadProps: UploadProps = {
    accept: 'image/jpeg,image/png,image/webp',
    maxCount: 1,
    beforeUpload: async (file) => {
      if (file.size > 5 * 1024 * 1024) {
        message.error('图片不能超过 5 MB')
        return Upload.LIST_IGNORE
      }
      setUploading(true)
      try {
        const r = await uploadApi.upload(file, 'venue-cover')
        setCoverUrl(r.url)
        setCoverFile({
          uid: file.uid,
          name: file.name,
          status: 'done',
          url: r.url
        })
        message.success('上传成功')
      } catch {
        // intercepted
      } finally {
        setUploading(false)
      }
      return Upload.LIST_IGNORE
    },
    onRemove: () => {
      setCoverUrl(null)
      setCoverFile(null)
    },
    fileList: coverFile ? [coverFile] : []
  }

  const onFinish = async (v: FormValues) => {
    const openHours = [
      'mon',
      'tue',
      'wed',
      'thu',
      'fri',
      'sat',
      'sun'
    ].map((d) => ({ day: d, hours: v.hours }))
    setSaving(true)
    try {
      await venueMyApi.update({
        name: v.name,
        address: v.address,
        phone: v.phone,
        tablesCount: v.tablesCount,
        openHours,
        description: v.description,
        coverImage: coverUrl
      })
      message.success('已保存')
      navigate('/venue/overview')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div style={{ minHeight: '60vh', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <Spin size="large" />
      </div>
    )
  }

  return (
    <div>
      <Space align="center" style={{ marginBottom: 16 }}>
        <Button onClick={() => navigate('/venue/overview')}>← 返回</Button>
        <Title level={3} style={{ margin: 0 }}>
          编辑店铺资料
        </Title>
      </Space>

      <Card>
        <Paragraph type="secondary">
          修改店铺名称、地址等公开信息；改动立即对 C 端用户生效。
        </Paragraph>
        <Form<FormValues>
          form={form}
          layout="vertical"
          onFinish={onFinish}
          style={{ maxWidth: 680 }}
        >
          <Form.Item
            label="店铺名称"
            name="name"
            rules={[{ required: true, min: 2, max: 128 }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            label="详细地址"
            name="address"
            rules={[{ required: true, min: 2, max: 255 }]}
          >
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item
            label="联系电话"
            name="phone"
            rules={[
              { required: true },
              { pattern: /^\+?\d{8,15}$/, message: '手机号格式不对' }
            ]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            label="台桌总数"
            name="tablesCount"
            rules={[{ required: true, type: 'number', min: 1, max: 200 }]}
          >
            <InputNumber min={1} max={200} />
          </Form.Item>
          <Form.Item
            label="营业时间（每天）"
            name="hours"
            rules={[{ required: true }]}
            tooltip="MVP 统一每天一个时间段"
          >
            <Input placeholder="10:00-02:00" />
          </Form.Item>
          <Form.Item label="店铺简介" name="description">
            <Input.TextArea rows={4} maxLength={2000} showCount />
          </Form.Item>
          <Form.Item label="封面图">
            <Upload {...uploadProps}>
              <Button icon={<UploadOutlined />} loading={uploading}>
                {coverUrl ? '更换封面' : '上传封面'}
              </Button>
            </Upload>
            {coverUrl && (
              <div style={{ marginTop: 8 }}>
                <Image src={coverUrl} width={240} />
              </div>
            )}
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" loading={saving}>
                保存
              </Button>
              <Button onClick={() => navigate('/venue/overview')}>
                取消
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>
      {venueId && (
        <Paragraph type="secondary" style={{ fontSize: 12, marginTop: 16 }}>
          店铺 ID：<code>{venueId}</code>
        </Paragraph>
      )}
    </div>
  )
}
