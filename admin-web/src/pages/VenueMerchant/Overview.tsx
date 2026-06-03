import { useEffect, useState } from 'react'
import {
  App,
  Button,
  Card,
  Descriptions,
  Image,
  Space,
  Spin,
  Tag,
  Typography
} from 'antd'
import { useNavigate } from 'react-router-dom'
import { useVenueAuthStore } from '../../stores/venue-auth'
import { venueAuthApi } from '../../api/venue'

const { Title, Paragraph } = Typography

interface VenueMeState {
  account: {
    id: string
    phoneNumber: string
    nickname: string
    role: string
    venueId: string | null
  } | null
  venue: {
    id: string
    name: string
    province: string | null
    city: string | null
    district: string | null
    address: string
    status: string
    tablesCount: number
  } | null
}

export default function Overview() {
  const navigate = useNavigate()
  const { message } = App.useApp()
  const [me, setMe] = useState<VenueMeState | null>(null)
  const [loading, setLoading] = useState(true)
  const clear = useVenueAuthStore((s) => s.clear)

  useEffect(() => {
    ;(async () => {
      const token = useVenueAuthStore.getState().accessToken
      if (!token) {
        navigate('/venue-login', { replace: true })
        return
      }
      try {
        const r = await venueAuthApi.me()
        setMe(r as VenueMeState)
      } finally {
        setLoading(false)
      }
    })()
  }, [navigate])

  const handleLogout = async () => {
    try {
      await venueAuthApi.logout()
    } catch {
      // ignore
    }
    clear()
    message.success('已退出')
    navigate('/venue-login', { replace: true })
  }

  if (loading) {
    return (
      <div style={{ minHeight: '60vh', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <Spin size="large" />
      </div>
    )
  }

  if (!me?.venue) {
    return (
      <Card>
        <Paragraph>你还没有绑定球房。</Paragraph>
        <Button type="primary" onClick={() => navigate('/apply')}>
          去提交入驻申请
        </Button>
      </Card>
    )
  }

  const v = me.venue

  return (
    <div>
      <Space align="center" style={{ marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>
          🏢 {v.name}
        </Title>
        <Tag color="success">已认证</Tag>
      </Space>

      <Card
        title="店铺概览"
        extra={
          <Space>
            <Button type="primary" onClick={() => navigate('/venue/profile')}>
              编辑店铺资料
            </Button>
            <Button onClick={handleLogout}>退出登录</Button>
          </Space>
        }
        style={{ marginBottom: 16 }}
      >
        <Descriptions column={2}>
          <Descriptions.Item label="店铺 ID">
            <code>{v.id}</code>
          </Descriptions.Item>
          <Descriptions.Item label="状态">
            <Tag color={v.status === 'active' ? 'success' : 'warning'}>
              {v.status === 'active' ? '营业中' : '已停用'}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label="地址" span={2}>
            {`${v.province ?? ''}${v.city ?? ''}${v.district ?? ''}${v.address}`}
          </Descriptions.Item>
          <Descriptions.Item label="台桌总数">{v.tablesCount}</Descriptions.Item>
        </Descriptions>
      </Card>

      <Card title="快捷操作">
        <Space wrap>
          <Button type="primary" onClick={() => navigate('/venue/profile')}>
            🎨 店铺资料
          </Button>
          <Button onClick={() => navigate('/venue/tournaments')}>
            🏆 赛事管理
          </Button>
          <Button
            onClick={() => navigate('/venue/tournaments/new')}
          >
            ➕ 新建赛事
          </Button>
          <Button disabled>🎮 现场控台（P5 上线）</Button>
        </Space>
      </Card>
    </div>
  )
}
