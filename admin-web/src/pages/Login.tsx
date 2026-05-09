import { useState } from 'react'
import { Button, Card, Form, Input, Typography, message } from 'antd'
import { UserOutlined, LockOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { authApi } from '../api/auth'
import { useAuthStore } from '../stores/auth'

const { Title, Text } = Typography

export default function Login() {
  const navigate = useNavigate()
  const setSession = useAuthStore((s) => s.setSession)
  const [loading, setLoading] = useState(false)

  const onSubmit = async (v: { username: string; password: string }) => {
    setLoading(true)
    try {
      const r = await authApi.login(v.username, v.password)
      setSession({
        accessToken: r.accessToken,
        refreshToken: r.refreshToken,
        account: r.account
      })
      message.success(`欢迎，${r.account.name}`)
      navigate('/', { replace: true })
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
        background: 'linear-gradient(135deg, #0f1f17 0%, #1a2f23 100%)'
      }}
    >
      <Card style={{ width: 380, boxShadow: '0 8px 40px rgba(0,0,0,0.3)' }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <Title level={3} style={{ marginBottom: 4 }}>
            🎱 桌球计分
          </Title>
          <Text type="secondary">管理后台</Text>
        </div>

        <Form layout="vertical" onFinish={onSubmit} autoComplete="off" size="large">
          <Form.Item
            name="username"
            rules={[{ required: true, message: '请输入账号' }]}
          >
            <Input prefix={<UserOutlined />} placeholder="账号" />
          </Form.Item>
          <Form.Item
            name="password"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="密码" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" block loading={loading}>
              登 录
            </Button>
          </Form.Item>
          <Text type="secondary" style={{ fontSize: 12 }}>
            忘记密码？联系超级管理员重置
          </Text>
        </Form>
      </Card>
    </div>
  )
}
