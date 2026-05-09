import { ProLayout } from '@ant-design/pro-components'
import { Dropdown, Tag, message } from 'antd'
import {
  DashboardOutlined,
  AppstoreOutlined,
  UserOutlined,
  AuditOutlined,
  SettingOutlined,
  LogoutOutlined
} from '@ant-design/icons'
import { Outlet, useLocation, useNavigate, Navigate } from 'react-router-dom'
import { useAuthStore } from '../stores/auth'
import { authApi } from '../api/auth'

const ROLE_LABEL: Record<string, string> = {
  super_admin: '超管',
  operator: '运营',
  readonly: '只读'
}
const ROLE_COLOR: Record<string, string> = {
  super_admin: 'gold',
  operator: 'blue',
  readonly: 'default'
}

export default function AppLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const { account, accessToken, clear } = useAuthStore()

  if (!accessToken || !account) {
    return <Navigate to="/login" replace />
  }

  const handleLogout = async () => {
    try {
      await authApi.logout()
    } catch {
      // ignore
    }
    clear()
    message.success('已退出')
    navigate('/login', { replace: true })
  }

  return (
    <ProLayout
      title="桌球计分 · 管理后台"
      logo={null}
      layout="mix"
      fixedHeader
      fixSiderbar
      location={{ pathname: location.pathname }}
      route={{
        path: '/',
        routes: [
          {
            path: '/',
            name: 'Dashboard',
            icon: <DashboardOutlined />
          },
          {
            path: '/matches',
            name: '共享比赛',
            icon: <AppstoreOutlined />
          },
          {
            path: '/users',
            name: '用户管理',
            icon: <UserOutlined />
          },
          {
            path: '/audit',
            name: '审计日志',
            icon: <AuditOutlined />
          },
          {
            path: '/settings',
            name: '系统设置',
            icon: <SettingOutlined />
          }
        ]
      }}
      menuItemRender={(item, dom) => (
        <a
          onClick={(e) => {
            e.preventDefault()
            navigate(item.path ?? '/')
          }}
        >
          {dom}
        </a>
      )}
      avatarProps={{
        title: account.name,
        size: 'small',
        render: (_, dom) => (
          <Dropdown
            menu={{
              items: [
                {
                  key: 'logout',
                  icon: <LogoutOutlined />,
                  label: '退出登录',
                  onClick: handleLogout
                }
              ]
            }}
          >
            {dom}
          </Dropdown>
        )
      }}
      actionsRender={() => [
        <Tag key="role" color={ROLE_COLOR[account.role]}>
          {ROLE_LABEL[account.role]}
        </Tag>
      ]}
    >
      <Outlet />
    </ProLayout>
  )
}
