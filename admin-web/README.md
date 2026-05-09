# 桌球计分 · 管理后台 (admin-web)

二期批次 2：服务端 + 管理后台 UI。

- 栈：**React 18 + Vite + TypeScript + Ant Design 5 + @ant-design/pro-components + React Router 6 + Zustand**
- 对应设计稿：`../ux/v2/admin-shared-match.md`
- 依赖的后端服务：`../server/`（默认 `http://localhost:3001`）

## 启动

```bash
# 1. 装依赖
cd admin-web
npm install

# 2. 启动后端（另一个终端）
cd ../server && npm run start:dev

# 3. 启动前端 dev 服务器
cd admin-web
npm run dev
# → http://localhost:5173
```

Vite 已配置代理：前端请求 `/v1/*` → 转发到 `http://localhost:3001`。

## 登录账号

使用后端 seed 的超管账号：

- 账号：`admin`
- 密码：`Admin@123456`

## 已实装页面

| 路由 | 页面 | 状态 |
|------|------|------|
| `/login` | 登录 | ✅ |
| `/` | Dashboard（4 个核心指标 + 趋势占位） | ✅ |
| `/matches` | 共享比赛列表（筛选 + 分页） | ✅ |
| `/matches/:id` | 房间详情（玩家比分 + 事件日志 + 强制暂停/结束） | ✅ |
| `/users` | 用户列表 | ✅ |
| `/users/:id` | 用户详情（封禁/解封 + 微信/抖音绑定展示） | ✅ |
| `/audit` | 审计日志（筛选） | ✅ |
| `/settings` | 系统设置（super_admin 可改） | ✅ |

## 架构

```
src/
├── main.tsx                # ConfigProvider + App + Router
├── routes.tsx              # 路由定义 + 登录守卫（AppLayout 做）
├── api/
│   ├── client.ts           # axios 实例 + 拦截器（token、refresh、401/403/5xx）
│   ├── auth.ts
│   ├── matches.ts
│   ├── users.ts
│   └── misc.ts             # analytics / audit / settings
├── stores/
│   └── auth.ts             # Zustand + localStorage 持久化
├── components/
│   └── AppLayout.tsx       # ProLayout，菜单 + 用户菜单 + 角色 Tag
├── pages/
│   ├── Login.tsx
│   ├── Dashboard.tsx
│   ├── Matches/{List,Detail}.tsx
│   ├── Users/{List,Detail}.tsx
│   ├── Audit.tsx
│   └── Settings.tsx
└── types/index.ts          # 和后端对齐的类型
```

## 未做

- 账号管理页（`/accounts`，super_admin 创建后台账号）
- 数据看板的详细图表（目前 Dashboard 只有 4 个数字）
- 登录验证码（MVP 不需要）
- 被踢提示的 WebSocket 监听（WS 未实装）
