import { useEffect, useState } from 'react'
import {
  App,
  Button,
  Card,
  Cascader,
  Form,
  Input,
  InputNumber,
  Space,
  Typography,
  Upload,
  message
} from 'antd'
import type { UploadFile, UploadProps } from 'antd'
import { UploadOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useVenueAuthStore } from '../../stores/venue-auth'
import {
  uploadApi,
  venueApplicationApi,
  venueAuthApi
} from '../../api/venue'
import { regionsApi } from '../../api/venues'
import type {
  VenueApplicationPayload,
  RegionNode
} from '../../api/venues'

const { Title, Paragraph } = Typography

const DAY_LABEL: Record<string, string> = {
  mon: '周一',
  tue: '周二',
  wed: '周三',
  thu: '周四',
  fri: '周五',
  sat: '周六',
  sun: '周日'
}
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

interface FormValues {
  name: string
  contactName: string
  contactPhone: string
  /** Cascader 值：[省 name, 市 name, 区 name] */
  region: [string, string, string]
  address: string
  tablesCount: number
  description?: string
  hoursMon: string
  applyAllDays: boolean
}

/** 把 RegionNode[] 转成 antd Cascader options（用 name 作 value，便于直接落库） */
function toCascaderOptions(tree: RegionNode[]) {
  return tree.map((p) => ({
    value: p.name,
    label: p.name,
    children:
      p.children?.map((c) => ({
        value: c.name,
        label: c.name,
        children:
          c.children?.map((d) => ({
            value: d.name,
            label: d.name
          })) ?? []
      })) ?? []
  }))
}

export default function Apply() {
  const navigate = useNavigate()
  const { message: msg } = App.useApp()
  const [form] = Form.useForm<FormValues>()
  const [licenseFile, setLicenseFile] = useState<UploadFile | null>(null)
  const [licenseUrl, setLicenseUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [regionTree, setRegionTree] = useState<RegionNode[]>([])
  const setAccount = useVenueAuthStore((s) => s.setAccount)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const r = await regionsApi.list()
        if (!cancelled) setRegionTree(r.tree)
      } catch {
        // 拦截器已提示，留空 cascader 让用户重试
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // 如果已登录且已经有 venue，直接跳走
  useEffect(() => {
    ;(async () => {
      const { account, accessToken } = useVenueAuthStore.getState()
      if (!accessToken) {
        navigate('/venue-login', { replace: true })
        return
      }
      // 刷新 me
      try {
        const r = await venueAuthApi.me()
        if (r.account?.venueId) {
          navigate('/venue/overview', { replace: true })
          return
        }
        if (r.account) {
          setAccount({
            id: r.account.id,
            phoneNumber: r.account.phoneNumber,
            nickname: r.account.nickname,
            role: r.account.role,
            venueId: r.account.venueId
          })
        }
      } catch {
        // 忽略
      }
      // 有进行中的申请也跳状态页
      try {
        const mine = await venueApplicationApi.mine()
        if (
          mine.application &&
          (mine.application.status === 'pending' ||
            mine.application.status === 'rejected')
        ) {
          navigate('/apply/status', { replace: true })
        }
      } catch {
        // ignore
      }
      void account
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const uploadProps: UploadProps = {
    accept: 'image/jpeg,image/png,image/webp',
    maxCount: 1,
    beforeUpload: async (file) => {
      if (file.size > 5 * 1024 * 1024) {
        msg.error('图片不能超过 5 MB')
        return Upload.LIST_IGNORE
      }
      setUploading(true)
      try {
        const r = await uploadApi.upload(file, 'license')
        setLicenseUrl(r.url)
        setLicenseFile({
          uid: file.uid,
          name: file.name,
          status: 'done',
          url: r.url
        })
        msg.success('上传成功')
      } catch {
        // 拦截器已提示
      } finally {
        setUploading(false)
      }
      return Upload.LIST_IGNORE
    },
    onRemove: () => {
      setLicenseFile(null)
      setLicenseUrl(null)
    },
    fileList: licenseFile ? [licenseFile] : []
  }

  const onFinish = async (v: FormValues) => {
    if (!licenseUrl) {
      msg.warning('请上传营业执照图片')
      return
    }
    const hours = v.hoursMon
    const openHours = DAYS.map((d) => ({ day: d, hours }))
    if (!v.region || v.region.length !== 3) {
      msg.warning('请选择完整的省 / 市 / 区')
      return
    }
    const [province, city, district] = v.region
    const payload: VenueApplicationPayload = {
      name: v.name,
      contactName: v.contactName,
      contactPhone: v.contactPhone,
      province,
      city,
      district,
      address: v.address,
      tablesCount: v.tablesCount,
      openHours,
      description: v.description
    }
    setSubmitting(true)
    try {
      await venueApplicationApi.submit({
        payload,
        licenseImage: licenseUrl
      })
      msg.success('已提交，等待审核')
      navigate('/apply/status', { replace: true })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #1a1e24 0%, #13161a 100%)',
        padding: 24
      }}
    >
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <Card>
          <Space
            style={{ width: '100%', justifyContent: 'space-between' }}
            align="center"
          >
            <Title level={3} style={{ margin: 0 }}>
              球房入驻申请
            </Title>
            <Button type="link" onClick={() => navigate('/venue-login')}>
              返回登录
            </Button>
          </Space>
          <Paragraph type="secondary">
            填完店铺资料并上传营业执照，平台将在 1-3 个工作日审核。通过后可发布赛事、管理店铺。
          </Paragraph>

          <Form
            form={form}
            layout="vertical"
            onFinish={onFinish}
            initialValues={{
              tablesCount: 8,
              hoursMon: '10:00-02:00'
            }}
          >
            <Title level={5}>基础信息</Title>
            <Form.Item
              label="店铺名称"
              name="name"
              rules={[{ required: true, min: 2, max: 128 }]}
            >
              <Input placeholder="如：张三台球俱乐部" />
            </Form.Item>
            <Space style={{ width: '100%' }} size="large">
              <Form.Item
                label="联系人"
                name="contactName"
                rules={[{ required: true, min: 2, max: 64 }]}
                style={{ flex: 1, minWidth: 200 }}
              >
                <Input placeholder="张三" />
              </Form.Item>
              <Form.Item
                label="联系电话"
                name="contactPhone"
                rules={[
                  { required: true },
                  { pattern: /^\+?\d{8,15}$/, message: '手机号格式不对' }
                ]}
                style={{ flex: 1, minWidth: 200 }}
              >
                <Input placeholder="138 1234 5678" />
              </Form.Item>
            </Space>
            <Form.Item
              label="所在地区"
              name="region"
              rules={[
                {
                  required: true,
                  message: '请选择省 / 市 / 区',
                  type: 'array',
                  len: 3
                }
              ]}
            >
              <Cascader
                options={toCascaderOptions(regionTree)}
                placeholder={
                  regionTree.length === 0
                    ? '加载行政区划中…'
                    : '选择省 / 市 / 区'
                }
                showSearch={{
                  filter: (input, path) =>
                    path.some((opt) =>
                      String(opt.label).toLowerCase().includes(input.toLowerCase())
                    )
                }}
                style={{ width: '100%' }}
              />
            </Form.Item>
            <Form.Item
              label="详细地址"
              name="address"
              rules={[{ required: true, min: 2, max: 255 }]}
              tooltip="不用重复省市区，只填街道及门牌号"
            >
              <Input.TextArea
                rows={2}
                placeholder="xx 路 88 号 3 层"
              />
            </Form.Item>

            <Title level={5}>场地信息</Title>
            <Space style={{ width: '100%' }} size="large">
              <Form.Item
                label="台桌总数"
                name="tablesCount"
                rules={[{ required: true, type: 'number', min: 1, max: 200 }]}
              >
                <InputNumber min={1} max={200} />
              </Form.Item>
              <Form.Item
                label="营业时间（每天）"
                name="hoursMon"
                rules={[{ required: true }]}
                tooltip="MVP 统一设同一个时间段；不同日期不同时间放 v2.11"
                style={{ flex: 1, minWidth: 240 }}
              >
                <Input placeholder="10:00-02:00" />
              </Form.Item>
            </Space>
            <Form.Item label="店铺简介" name="description">
              <Input.TextArea
                rows={3}
                placeholder="营业理念、特色项目等（选填）"
                maxLength={2000}
                showCount
              />
            </Form.Item>

            <Title level={5}>资质</Title>
            <Form.Item
              label="营业执照"
              required
              tooltip="清晰可辨，JPG/PNG/WEBP，最大 5 MB"
            >
              <Upload {...uploadProps}>
                <Button icon={<UploadOutlined />} loading={uploading}>
                  上传营业执照
                </Button>
              </Upload>
            </Form.Item>

            <Form.Item>
              <Button
                type="primary"
                htmlType="submit"
                size="large"
                loading={submitting}
              >
                提交审核
              </Button>
            </Form.Item>
          </Form>
        </Card>
      </div>
    </div>
  )
}
