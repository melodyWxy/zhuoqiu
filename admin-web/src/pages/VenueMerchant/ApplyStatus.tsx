import { useEffect, useState } from 'react'
import {
  App,
  Button,
  Card,
  Descriptions,
  Image,
  Result,
  Space,
  Spin,
  Typography
} from 'antd'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import { useVenueAuthStore } from '../../stores/venue-auth'
import { venueApplicationApi, venueAuthApi } from '../../api/venue'
import type { VenueApplicationItem } from '../../api/venues'

const { Title, Paragraph } = Typography

export default function ApplyStatus() {
  const navigate = useNavigate()
  const { message } = App.useApp()
  const [app, setApp] = useState<VenueApplicationItem | null>(null)
  const [loading, setLoading] = useState(true)
  const [venue, setVenue] = useState<{
    id: string
    name: string
    address: string
    tablesCount: number
  } | null>(null)
  const clear = useVenueAuthStore((s) => s.clear)

  useEffect(() => {
    ;(async () => {
      const token = useVenueAuthStore.getState().accessToken
      if (!token) {
        navigate('/venue-login', { replace: true })
        return
      }
      try {
        const me = await venueAuthApi.me()
        if (me.venue) setVenue(me.venue)
        const r = await venueApplicationApi.mine()
        setApp(r.application)
      } catch {
        // ignore
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
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <Spin size="large" />
      </div>
    )
  }

  // 已有 venue：展示入驻成功 + 店铺摘要（P2 会替换为真正的店铺主页）
  if (venue) {
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
            <Result
              status="success"
              title="入驻完成"
              subTitle={`欢迎，${venue.name} · 你已成功开通商家账号`}
              extra={
                <Space direction="vertical" align="center">
                  <Descriptions column={1} bordered size="small">
                    <Descriptions.Item label="球房 ID">
                      <code>{venue.id}</code>
                    </Descriptions.Item>
                    <Descriptions.Item label="地址">
                      {venue.address}
                    </Descriptions.Item>
                    <Descriptions.Item label="台桌数">
                      {venue.tablesCount}
                    </Descriptions.Item>
                  </Descriptions>
                  <Paragraph type="secondary" style={{ marginTop: 16 }}>
                    赛事管理 / 店铺资料 / 现场控台 将于 P2-P5 阶段上线
                  </Paragraph>
                  <Button onClick={handleLogout}>退出登录</Button>
                </Space>
              }
            />
          </Card>
        </div>
      </div>
    )
  }

  // 没 venue 也没申请 → 引导去 /apply
  if (!app) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24
        }}
      >
        <Card style={{ maxWidth: 480, width: '100%' }}>
          <Result
            icon={<span style={{ fontSize: 64 }}>🎱</span>}
            title="还没有提交入驻申请"
            extra={
              <Space>
                <Button type="primary" onClick={() => navigate('/apply')}>
                  立即申请
                </Button>
                <Button onClick={handleLogout}>退出</Button>
              </Space>
            }
          />
        </Card>
      </div>
    )
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
          {app.status === 'pending' && (
            <Result
              status="info"
              icon={<span style={{ fontSize: 64 }}>🕐</span>}
              title="审核中…"
              subTitle="我们已收到你的入驻申请，正在核验资质。通常 1-3 个工作日回复。"
              extra={<Button onClick={handleLogout}>退出</Button>}
            />
          )}
          {app.status === 'rejected' && (
            <Result
              status="error"
              title="审核未通过"
              subTitle={app.rejectReason ?? ''}
              extra={
                <Space>
                  <Button
                    type="primary"
                    onClick={() => navigate('/apply')}
                  >
                    修改后重新提交
                  </Button>
                  <Button onClick={handleLogout}>退出</Button>
                </Space>
              }
            />
          )}
          {app.status === 'approved' && (
            <Result
              status="success"
              title="审核通过"
              subTitle="球房已创建，请重新登录或刷新页面查看店铺主页"
              extra={<Button onClick={handleLogout}>重新登录</Button>}
            />
          )}

          <Card type="inner" title="你提交的内容" style={{ marginTop: 16 }}>
            <Descriptions column={2} size="small">
              <Descriptions.Item label="店名">
                {app.payloadJson.name}
              </Descriptions.Item>
              <Descriptions.Item label="台桌数">
                {app.payloadJson.tablesCount}
              </Descriptions.Item>
              <Descriptions.Item label="联系人">
                {app.payloadJson.contactName}
              </Descriptions.Item>
              <Descriptions.Item label="联系电话">
                {app.payloadJson.contactPhone}
              </Descriptions.Item>
              <Descriptions.Item label="地址" span={2}>
                {app.payloadJson.address}
              </Descriptions.Item>
              <Descriptions.Item label="提交时间" span={2}>
                {dayjs(app.createdAt).format('YYYY-MM-DD HH:mm:ss')}
              </Descriptions.Item>
            </Descriptions>
            {app.licenseImage && (
              <div style={{ marginTop: 12 }}>
                <div style={{ marginBottom: 8 }}>营业执照：</div>
                <Image src={app.licenseImage} width={240} />
              </div>
            )}
          </Card>
        </Card>
      </div>
    </div>
  )
}
