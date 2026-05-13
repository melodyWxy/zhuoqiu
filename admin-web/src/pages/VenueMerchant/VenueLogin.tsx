import { useEffect, useState } from 'react'
import {
  App,
  Button,
  Card,
  Form,
  Input,
  Space,
  Typography
} from 'antd'
import { PhoneOutlined, SafetyCertificateOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { venueAuthApi } from '../../api/venue'
import { useVenueAuthStore } from '../../stores/venue-auth'

const { Title, Paragraph } = Typography

export default function VenueLogin() {
  const navigate = useNavigate()
  const { message } = App.useApp()
  const [form] = Form.useForm<{ phoneNumber: string; code: string }>()
  const [cooldown, setCooldown] = useState(0)
  const [loading, setLoading] = useState(false)
  const setSession = useVenueAuthStore((s) => s.setSession)

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  const sendSms = async () => {
    try {
      const phoneNumber = form.getFieldValue('phoneNumber')
      if (!/^\+?\d{8,15}$/.test(phoneNumber || '')) {
        message.warning('请输入正确的手机号')
        return
      }
      const r = await venueAuthApi.sendSms(phoneNumber)
      message.success(r.devHint ?? '验证码已发送')
      setCooldown(60)
    } catch {
      // 拦截器已显示
    }
  }

  const onFinish = async (v: { phoneNumber: string; code: string }) => {
    setLoading(true)
    try {
      const r = await venueAuthApi.verify({
        phoneNumber: v.phoneNumber,
        code: v.code
      })
      setSession({
        accessToken: r.accessToken,
        refreshToken: r.refreshToken,
        account: r.account
      })
      message.success('登录成功')
      if (r.account.venueId) {
        navigate('/venue/overview', { replace: true })
      } else {
        navigate('/apply', { replace: true })
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #1a1e24 0%, #13161a 100%)',
        padding: 24
      }}
    >
      <Card
        style={{ width: 420, maxWidth: '100%' }}
        styles={{ body: { padding: 32 } }}
      >
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 40 }}>🏢</div>
          <Title level={3} style={{ margin: '8px 0' }}>
            球房商家登录
          </Title>
          <Paragraph type="secondary" style={{ margin: 0 }}>
            管理球房资料 · 发布赛事 · 现场计分
          </Paragraph>
        </div>

        <Form form={form} layout="vertical" onFinish={onFinish}>
          <Form.Item
            label="手机号"
            name="phoneNumber"
            rules={[
              { required: true, message: '请输入手机号' },
              {
                pattern: /^\+?\d{8,15}$/,
                message: '手机号格式不对'
              }
            ]}
          >
            <Input prefix={<PhoneOutlined />} placeholder="138 1234 5678" />
          </Form.Item>

          <Form.Item
            label="验证码"
            name="code"
            rules={[
              { required: true, message: '请输入验证码' },
              { len: 6, message: '验证码 6 位数字' }
            ]}
          >
            <Input
              prefix={<SafetyCertificateOutlined />}
              placeholder="6 位数字"
              maxLength={6}
              suffix={
                <Button
                  size="small"
                  type="link"
                  disabled={cooldown > 0}
                  onClick={sendSms}
                >
                  {cooldown > 0 ? `${cooldown}s` : '获取验证码'}
                </Button>
              }
            />
          </Form.Item>

          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              block
              loading={loading}
              size="large"
            >
              登录
            </Button>
          </Form.Item>
        </Form>

        <div
          style={{
            marginTop: 16,
            paddingTop: 16,
            borderTop: '1px solid #2a2e35',
            textAlign: 'center'
          }}
        >
          <Paragraph type="secondary" style={{ marginBottom: 8 }}>
            还没有球房账号？
          </Paragraph>
          <Space direction="vertical" style={{ width: '100%' }}>
            <Button
              block
              onClick={() =>
                message.info(
                  '请在上方输入手机号 + 验证码登录，登录后会自动进入申请入驻流程'
                )
              }
            >
              🎱 申请球房入驻
            </Button>
            <Button type="link" size="small" onClick={() => navigate('/login')}>
              平台管理员入口 →
            </Button>
          </Space>
        </div>
      </Card>
    </div>
  )
}
