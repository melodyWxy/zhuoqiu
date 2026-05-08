# 桌球计分 · 服务端

二期批次 1 —— 共享比赛 + 管理端。

- 栈：**Node.js 20 + NestJS 10 + Prisma 5 + PostgreSQL 15**
- 对应设计稿：`../ux/v2/shared-match-backend.md`
- 对应管理端 UI 设计稿：`../ux/v2/admin-shared-match.md`

## 快速开始

```bash
# 1. 装依赖
cd server
npm install

# 2. 配置环境
cp .env.example .env
# 编辑 .env 里的 DATABASE_URL / JWT 密钥 等

# 3. 初始化数据库（本地 PG 要先起着）
createdb zhuoqiu_dev
npm run prisma:migrate
npm run seed

# 4. 起服务
npm run start:dev
# 或生产模式
npm run build && npm run start:prod
```

启动后：`http://localhost:3001/v1`

## 已实现的接口（批次 1 的 MVP）

| Method | Path | 说明 |
|--------|------|------|
| GET | `/v1/health` | 健康检查（数据库可达性） |
| POST | `/v1/admin/auth/login` | 管理端登录 |
| POST | `/v1/admin/auth/refresh` | 刷新 access token |
| POST | `/v1/admin/auth/logout` | 登出（MVP 客户端侧） |
| POST | `/v1/admin/auth/change-password` | 改密码 |
| GET | `/v1/admin/matches` | 房间列表（分页 + 筛选） |
| GET | `/v1/admin/matches/:id` | 房间详情 |
| GET | `/v1/admin/matches/:id/events` | 房间操作日志 |
| GET | `/v1/admin/users` | 用户列表 |
| GET | `/v1/admin/users/:id` | 用户详情（含微信/抖音绑定） |
| GET | `/v1/admin/settings` | 系统设置读 |
| PATCH | `/v1/admin/settings` | 更新系统设置（super_admin） |
| GET | `/v1/admin/analytics/overview` | Dashboard 概览指标 |

**待做（后续批次）：**

- C 端 API：登录（微信/抖音/手机号）、比赛创建/加入/事件/结束
- WebSocket 协议
- 管理端 API：房间强制结束/纠正、用户封禁/合并、审计日志查询、账号管理、数据看板
- Redis 引入 + Realtime Hub 独立

## 种子账号

默认种子：

- 用户名：`admin`
- 密码：`Admin@123456`
- 角色：`super_admin`

**生产前必改**：通过 `.env` 的 `SEED_SUPER_ADMIN_PASSWORD` 指定；或首次登录后手动改。

## 目录结构

```
server/
├── prisma/
│   ├── schema.prisma        # 数据库定义
│   ├── migrations/          # 迁移历史
│   └── seed.ts              # 种子脚本（super_admin + 系统默认配置）
├── src/
│   ├── main.ts              # Nest 启动
│   ├── app.module.ts        # 根模块
│   ├── config/              # 环境配置
│   ├── prisma/              # PrismaService + Module（全局）
│   ├── common/
│   │   ├── interceptors/    # 统一响应格式 ResponseInterceptor
│   │   ├── filters/         # 全局异常 AllExceptionsFilter
│   │   ├── dto/             # PaginationDto 等
│   │   └── exceptions/      # BusinessException + ErrorCode
│   ├── health/              # 健康检查
│   ├── auth/                # 鉴权：AdminAuthGuard / JWT / AuthService
│   └── admin/               # 管理端 API（matches / users / settings / analytics）
├── package.json
├── tsconfig.json
└── nest-cli.json
```

## 常用脚本

| 命令 | 作用 |
|------|------|
| `npm run start:dev` | 开发模式（watch） |
| `npm run build && npm run start:prod` | 生产模式 |
| `npm run prisma:migrate` | 创建/应用新迁移 |
| `npm run prisma:studio` | 打开 Prisma Studio 图形化查表 |
| `npm run seed` | 重跑种子（已存在的不覆盖） |
| `npm run db:setup` | 迁移 + 种子（部署用） |

## 响应格式

**成功：**

```json
{ "code": 0, "data": { ... }, "traceId": "abc123" }
```

**业务失败（HTTP 200）：**

```json
{ "code": 40001, "message": "房间不存在", "traceId": "abc123" }
```

完整错误码见 `src/common/exceptions/business.exception.ts`。
