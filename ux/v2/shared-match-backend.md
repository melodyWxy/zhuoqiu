# 共享比赛 · 服务端设计（架构 + 数据模型 + API + WS）

> **版本：** v2.0.0 草稿
> **更新时间：** 2026-05-08
> **状态：** 设计中（等用户确认）
> **配套：** 管理端 UI 见 `admin-shared-match.md`；PRD 见 `prd/billiards-match-app-prd-v2.md`
> **范围：** 共享比赛的**完整后端**（含服务端架构、数据库、REST API、WebSocket 协议）。本文档同时服务于：**服务端开发**、**管理端前端**、**未来 C 端前端**。

---

## 1. 范围

本文覆盖：

- 服务端整体架构与组件划分
- 数据库表结构（PostgreSQL）
- 所有 REST API（含 C 端 / 管理端 / 通用）
- WebSocket 协议
- 鉴权、权限、限流方案
- 关键流程时序图

**不覆盖**（留给后续文档）：

- C 端 UI 细节（批次 2 再出独立设计稿）
- 球房 / 赛事（批次 3+）
- 部署运维的具体 CI/CD 配置

---

## 2. 架构概览

```text
┌─────────────────────────────────────────────────────────────────────┐
│  客户端层                                                             │
│  ┌──────────────────┐   ┌──────────────────┐   ┌──────────────────┐│
│  │ 微信小程序 (Taro)│   │ 抖音小程序 (Taro)│   │ 管理端 (React)   ││
│  │  共享比赛         │   │  共享比赛         │   │  AntD Pro        ││
│  └────────┬─────────┘   └────────┬─────────┘   └────────┬─────────┘│
└───────────┼──────────────────────┼────────────────────────┼─────────┘
            │                      │                        │
       HTTPS/WSS               HTTPS/WSS                HTTPS/WSS
            │                      │                        │
┌───────────▼──────────────────────▼────────────────────────▼─────────┐
│                         API Gateway                                  │
│    · HTTPS 卸载 · 路由 · 限流 · IP 黑白名单 · 请求日志             │
└───────────┬──────────────────────────────────────────────┬──────────┘
            │                                              │
       REST API                                      WebSocket
            │                                              │
┌───────────▼──────────────────────────────────────────────▼──────────┐
│                     应用层（无状态，水平扩展）                        │
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐            │
│  │ Auth 服务     │  │ Match 服务   │  │ Realtime Hub    │            │
│  │ ·登录         │  │ ·房间 CRUD    │  │ · WS 连接管理    │            │
│  │ ·Token 刷新  │  │ ·事件写入     │  │ · 按房间广播     │            │
│  │ ·微信/抖音   │  │ ·状态机      │  │ · 管理员全量     │            │
│  └──────────────┘  └──────────────┘  └─────────────────┘            │
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐            │
│  │ User 服务    │  │ Admin 服务   │  │ Analytics 服务   │            │
│  │ ·profile     │  │ ·RBAC        │  │ · 指标计算       │            │
│  │ ·绑定合并    │  │ ·审计写入    │  │ · 聚合查询       │            │
│  └──────────────┘  └──────────────┘  └─────────────────┘            │
└──┬──────────────────┬──────────────────────┬───────────────┬────────┘
   │                  │                      │               │
 ┌─▼────────┐     ┌───▼──────┐         ┌─────▼──────┐    ┌───▼──────┐
 │ Postgres  │     │ Redis    │         │ OSS / S3   │    │ Message  │
 │ 主数据    │     │ 缓存     │         │ 图片/证件   │    │ Queue    │
 │ 索引/分区 │     │ 会话     │         │ （二期留）  │    │ (二期)   │
 │           │     │ 房间实时 │         │            │    │          │
 │           │     │ Pub/Sub  │         │            │    │          │
 └───────────┘     └──────────┘         └────────────┘    └──────────┘
```

**组件职责：**

| 组件 | 职责 | 是否有状态 |
|------|------|:----------:|
| API Gateway | TLS 卸载、限流、路由、基本鉴权校验 | 无 |
| Auth 服务 | 微信/抖音换 openId、签发 JWT、refresh | 无 |
| Match 服务 | 房间 CRUD、事件状态机、持久化 | 无 |
| User 服务 | 用户 profile / 三方绑定 / 合并 | 无 |
| Admin 服务 | 后台账号、权限校验、审计写入 | 无 |
| Realtime Hub | WS 长连接、按房间广播、心跳 | **有**（内存中的连接）|
| Analytics 服务 | Dashboard 指标、数据看板查询 | 无 |
| PostgreSQL | 持久化主库 | — |
| Redis | 会话缓存、房间热数据、pub/sub | — |

**水平扩展：** 所有无状态服务可复制多副本；Realtime Hub 多副本之间通过 Redis pub/sub 同步"某房间有新事件"广播。

---

## 3. 技术栈（建议）

| 层 | 推荐 | 备选 |
|----|------|------|
| 运行时 | Node.js 20 LTS | Go 1.22 |
| 框架 | NestJS | Express + 手写结构 |
| 数据库 | PostgreSQL 15 | MySQL 8 |
| ORM | Prisma | TypeORM |
| 缓存 / 消息 | Redis 7 | — |
| WS | `ws` 原生 + 自己做房间路由 | Socket.IO |
| 对象存储 | 腾讯云 COS / 阿里云 OSS | — |
| 日志 | pino + ELK | winston |
| 监控 | Prometheus + Grafana | 云厂商自带 |
| 鉴权 | JWT（HS256） | — |
| 部署 | 容器化（Docker） + 腾讯云 TKE / 阿里云 ACK | 纯 VM |

**为什么推荐 Node + NestJS：**

- 与前端（Taro + AntD Pro）同语言，团队切换成本低
- NestJS 的模块化、DI、装饰器，对多服务组织清晰
- WS 生态好

**何时换 Go：** 如果 WebSocket 连接数预期超过 1 万同时在线，Node 的单进程连接数有限，需要多实例；这时 Go 在单节点承载会更有优势。MVP 阶段 Node 足够。

---

## 4. 数据模型

### 4.1 表约定

- 数据库：PostgreSQL 15，UTF8 编码
- 主键：`BIGINT UNSIGNED AUTO_INCREMENT`，业务 id 是独立的字符串字段（`id`，如 `u_xxxxxxxx`、`m_xxxxxxxx`）
- 时间：`created_at` / `updated_at`，`TIMESTAMP` 默认 `CURRENT_TIMESTAMP`
- 软删除：敏感实体加 `deleted_at NULL`，默认查询过滤
- 命名：snake_case
- 所有表默认有 `id (PK)`、`created_at`、`updated_at`

### 4.2 用户相关

#### 4.2.1 `users`

| 字段 | 类型 | 说明 |
|------|------|------|
| id | VARCHAR(32) | 业务 id，如 `u_xxxxxxxx`，唯一索引 |
| phone_number | VARCHAR(20) NULL | E.164 格式，唯一（部分唯一，null 允许多）|
| nickname | VARCHAR(32) | 昵称 |
| avatar | VARCHAR(32) | emoji 或图片 URL |
| primary_source | ENUM('wechat','douyin','phone') | 首次注册来源 |
| status | ENUM('active','banned','deleted') | 默认 `active` |
| ban_until | TIMESTAMP NULL | 封禁到期时间 |
| ban_reason | TEXT NULL | 封禁原因 |
| last_active_at | TIMESTAMP NULL | 最近活跃 |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |
| deleted_at | TIMESTAMP NULL | |

**索引：** `phone_number` 唯一，`status`，`created_at`

#### 4.2.2 `wechat_bindings`

| 字段 | 类型 | 说明 |
|------|------|------|
| id | VARCHAR(32) | |
| user_id | VARCHAR(32) | FK → users.id |
| open_id | VARCHAR(128) | 微信小程序 openId |
| union_id | VARCHAR(128) NULL | 开放平台 unionId |
| mp_app_id | VARCHAR(64) | 小程序 appId（多小程序支持） |
| bind_at | TIMESTAMP | |
| unbound_at | TIMESTAMP NULL | 解绑时间 |
| created_at, updated_at | | |

**索引：** `(mp_app_id, open_id)` 唯一（未解绑时），`union_id`，`user_id`

#### 4.2.3 `douyin_bindings`

结构同 `wechat_bindings`，字段 `mp_app_id` 存抖音小程序 appId，`open_id` / `union_id` 对应抖音开放平台。

#### 4.2.4 `phone_verify_codes`（短信验证码）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGINT | |
| phone_number | VARCHAR(20) | |
| code | VARCHAR(8) | 6 位数字 |
| purpose | ENUM('login','bind','merge') | |
| expires_at | TIMESTAMP | 5 分钟 |
| used_at | TIMESTAMP NULL | |
| attempts | TINYINT | 错误尝试次数，≥5 自动作废 |
| created_at | | |

**索引：** `(phone_number, purpose, expires_at)`

### 4.3 管理端账号

#### 4.3.1 `admin_accounts`

| 字段 | 类型 | 说明 |
|------|------|------|
| id | VARCHAR(32) | `a_xxxxxxxx` |
| username | VARCHAR(32) | 登录名，唯一 |
| name | VARCHAR(64) | 姓名 |
| password_hash | VARCHAR(255) | bcrypt |
| role | ENUM('super_admin','operator','readonly') | |
| status | ENUM('active','inactive') | |
| must_change_password | TINYINT | 首次登录强制改 |
| last_login_at | TIMESTAMP NULL | |
| last_login_ip | VARCHAR(45) NULL | IPv6 兼容长度 |
| failed_login_count | SMALLINT | 连续失败计数，用于锁定 |
| locked_until | TIMESTAMP NULL | |
| notes | TEXT NULL | |
| created_by | VARCHAR(32) NULL | 创建者 admin_account_id |
| created_at, updated_at | | |

**索引：** `username` 唯一，`role`

### 4.4 比赛相关

#### 4.4.1 `matches`

| 字段 | 类型 | 说明 |
|------|------|------|
| id | VARCHAR(32) | `m_xxxxxxxx` |
| code | CHAR(6) | 房间码，大写字母+数字 |
| owner_user_id | VARCHAR(32) | 房主 |
| type | ENUM('nine_ball','eight_ball') | |
| rules_json | JSON | 九球得分规则 / 中八抢几局 |
| state | ENUM('waiting','in_progress','paused','ended','dissolved') | |
| timer_started_at | TIMESTAMP NULL | 当前 run 起始（暂停后置空） |
| timer_accumulated_ms | BIGINT | 累计已跑毫秒（暂停前积累） |
| is_paused | TINYINT | |
| last_event_at | TIMESTAMP NULL | 最近一次事件时间 |
| ended_at | TIMESTAMP NULL | |
| ended_by | VARCHAR(32) NULL | 结束操作人 user_id 或 admin_id |
| ended_reason | VARCHAR(255) NULL | |
| event_id | VARCHAR(32) NULL | 关联赛事（批次 3 预留） |
| bracket_node_id | VARCHAR(64) NULL | 赛事赛程节点（批次 3 预留） |
| created_at, updated_at | | |

**索引：** `code` 唯一（只对未结束的行；或直接唯一并依赖 code 复用后自然递增 ID 保证），`state`，`owner_user_id`，`created_at`

**房间码过期策略：** 比赛结束 24h 后，后台 job 将 code 清空为 NULL（避免长期占用）

#### 4.4.2 `match_players`

| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGINT | |
| match_id | VARCHAR(32) | |
| slot | TINYINT | 1 / 2 / 3 |
| display_name | VARCHAR(32) | 当前显示名 |
| user_id | VARCHAR(32) NULL | 占位用户 |
| joined_at | TIMESTAMP | 占位时间 |
| left_at | TIMESTAMP NULL | 离位时间（空=仍占位） |
| is_current | TINYINT | 当前是否占位（冗余，便于查询） |
| created_at, updated_at | | |

**索引：** `(match_id, slot)` + 部分唯一（当前 `is_current=1`），`user_id`

#### 4.4.3 `match_events`（事件日志 / 审计）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGINT | 自增主键 |
| match_id | VARCHAR(32) | |
| server_seq | BIGINT | 服务端在该 match 内递增的序号，权威顺序 |
| client_seq | BIGINT NULL | 客户端提交时带的序号（用于重复检测） |
| actor_user_id | VARCHAR(32) NULL | 操作者（admin 介入时为空） |
| actor_admin_id | VARCHAR(32) NULL | 管理员操作时填 |
| type | VARCHAR(32) | 事件类型（见 §4.4.4） |
| payload_json | JSON | 具体参数 |
| undone | TINYINT | 是否被撤销 |
| undone_by_event_id | BIGINT NULL | 撤销此事件的 event.id |
| created_at | TIMESTAMP(3) | 毫秒级 |

**索引：** `(match_id, server_seq)` 唯一，`(match_id, created_at)`，`actor_user_id`

#### 4.4.4 事件类型枚举

| type | 含义 | payload 关键字段 |
|------|------|------------------|
| `score_normal_win` | 普胜 | `winnerSlot`, `targetSlot`, `points` |
| `score_small_jack` | 小金 | 同上 |
| `score_big_jack` | 大金 | `winnerSlot`, `points` |
| `score_golden9` | 黄金9 | 同上 |
| `score_eight_ball_win` | 中八本局胜 | `winnerSlot` |
| `foul` | 犯规 | `foulerSlot`, `compensateSlot`, `points` |
| `rename` | 改名 | `slot`, `oldName`, `newName` |
| `pause` | 暂停 | — |
| `resume` | 继续 | — |
| `undo` | 撤销 | `targetEventId` |
| `seat_occupy` | 占位 | `slot`, `userId` |
| `seat_leave` | 离位 | `slot`, `userId` |
| `seat_kick` | 被管理员踢出 | `slot`, `userId`, `adminId`, `reason` |
| `end` | 结束 | `endedBy`, `reason` |
| `force_end` | 管理员强制结束 | `adminId`, `reason` |
| `score_correct` | 管理员纠正 | `adminId`, `before`, `after`, `reason` |

### 4.5 审计日志（后台操作）

#### `admin_audit_logs`

| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGINT | |
| actor_admin_id | VARCHAR(32) | 操作人 |
| action | VARCHAR(64) | 如 `login`, `match.force_end`, `user.ban` 等 |
| target_type | VARCHAR(32) NULL | `match` / `user` / `admin_account` / ... |
| target_id | VARCHAR(64) NULL | 被操作实体 id |
| detail_json | JSON | 具体内容（before/after/reason） |
| ip | VARCHAR(45) | |
| user_agent | VARCHAR(255) NULL | |
| created_at | TIMESTAMP(3) | |

**索引：** `actor_admin_id`，`action`，`target_id`，`created_at`

**保留期：** 2 年（ttl job 每天清理过期）

### 4.6 系统设置

#### `system_settings`

key-value 配置表：

| 字段 | 类型 | 说明 |
|------|------|------|
| key | VARCHAR(64) | PK |
| value_json | JSON | |
| updated_by | VARCHAR(32) NULL | 最后更新的 admin_id |
| updated_at | TIMESTAMP | |

**预设 keys：**

- `match.code_expire_hours` = 24
- `match.reconnect_window_sec` = 60
- `match.zombie_pause_minutes` = 15
- `match.zombie_end_minutes` = 120
- `match.max_concurrent_per_user` = 3
- `auth.login_fail_threshold` = 5
- `auth.login_lock_minutes` = 15
- `auth.require_manual_review_on_signup` = false
- `notify.wechat_template_id` = ""
- `notify.alert_email` = ""

---

## 5. API 通用约定

### 5.1 基址

- 生产：`https://api.example.com/v1`
- 测试：`https://api-test.example.com/v1`

路径前缀区分：

- `GET /v1/me` — C 端 API，身份 = C 端 user token
- `GET /v1/admin/matches` — 管理端 API，身份 = admin token
- `GET /v1/public/...` — 公共（如短信发送、基本配置）

### 5.2 响应格式（统一）

**成功：**

```json
{
  "code": 0,
  "data": { ... },
  "traceId": "abc123"
}
```

**失败：**

```json
{
  "code": 40001,
  "message": "房间不存在",
  "traceId": "abc123",
  "details": { ... }
}
```

HTTP 状态码与 code 解耦：只要能通服务，HTTP 200；业务失败靠 `code` 字段区分。异常（5xx）给 HTTP 5xx。

### 5.3 错误码规范

| 前缀 | 含义 |
|------|------|
| `0` | 成功 |
| `1xxxx` | 通用（参数错误、鉴权失败） |
| `2xxxx` | 账号 / 登录 |
| `3xxxx` | 用户资料 |
| `4xxxx` | 比赛 |
| `5xxxx` | 管理端 |
| `9xxxx` | 服务端错误 |

**常用码：**

| code | HTTP | 含义 |
|------|:----:|------|
| 0 | 200 | OK |
| 10001 | 400 | 参数错误 |
| 10002 | 401 | 未登录 / token 无效 |
| 10003 | 403 | 无权限 |
| 10004 | 429 | 限流 |
| 20001 | 200 | 登录失败：账号或密码错 |
| 20002 | 200 | 账号被封禁 |
| 20003 | 200 | 账号被锁定（失败次数过多） |
| 20004 | 200 | 短信验证码错误或过期 |
| 40001 | 200 | 房间不存在 |
| 40002 | 200 | 房间码已过期 |
| 40003 | 200 | 房间已满 |
| 40004 | 200 | 房间状态不允许此操作 |
| 40005 | 200 | 事件冲突（serverSeq 不匹配） |
| 50001 | 200 | 管理员权限不足 |
| 90001 | 500 | 服务端内部错误 |

### 5.4 分页

列表接口统一：

- 请求：`?page=1&pageSize=20&sort=created_at:desc`
- 响应 `data`：`{ items: [...], total: 1234, page: 1, pageSize: 20 }`

### 5.5 时间

所有时间字段用 ISO 8601 UTC 字符串：`"2026-05-08T14:32:15.123Z"`。客户端负责转本地时区。

### 5.6 鉴权头

- **C 端**：`Authorization: Bearer <user_access_token>`
- **管理端**：`Authorization: Bearer <admin_access_token>`
- 两种 token 在 claim 中有 `type` 字段区分，服务端按路径前缀校验类型

### 5.7 限流

| 端点类型 | 限流策略 |
|----------|----------|
| 发短信 | 同一手机号 1 分钟 1 条，1 天 5 条 |
| 登录接口 | 同一 IP 10 次/分钟 |
| 创建房间 | 同一用户 10 次/小时 |
| 加入房间（房间码） | 同一 IP 30 次/分钟（防扫码爆破） |
| WS 发事件 | 同一用户 20 条/秒（余量足够，超过丢） |
| 其他读接口 | 全局 100 QPS/用户，超限 429 |

---

## 6. C 端 API

### 6.1 登录与账号

#### POST /v1/auth/wechat

微信小程序登录。

```json
// Request
{
  "code": "wx_code_from_wx.login",
  "appId": "wxabcdef123"
}

// Response
{
  "code": 0,
  "data": {
    "accessToken": "eyJ...",
    "refreshToken": "eyJ...",
    "expiresIn": 900,
    "user": {
      "id": "u_xxx",
      "nickname": "张三",
      "avatar": "🎱",
      "phoneNumber": null,
      "hasWechat": true,
      "hasDouyin": false
    },
    "isNewUser": true
  }
}
```

服务端逻辑：code2session → 拿 openId/unionId → 查 `wechat_bindings` → 有则返回对应 user，没则新建 user + binding。

#### POST /v1/auth/douyin

抖音小程序登录，同构微信。

#### POST /v1/auth/phone/send-sms

```json
// Request
{ "phoneNumber": "+8613812345678", "purpose": "login" }

// Response
{ "code": 0, "data": { "sentAt": "...", "expiresInSec": 300 } }
```

`purpose` 之一：`login`（直接登录）、`bind`（绑到当前登录账号）、`merge`（合并两个账号）。

#### POST /v1/auth/phone/verify

```json
// Request
{ "phoneNumber": "+8613812345678", "code": "123456", "purpose": "login" }

// Response: 同 /v1/auth/wechat 的 Response 结构
```

#### POST /v1/auth/refresh

```json
// Request
{ "refreshToken": "eyJ..." }

// Response
{ "code": 0, "data": { "accessToken": "eyJ...", "expiresIn": 900 } }
```

#### POST /v1/auth/logout

吊销 refreshToken。Response `{ code: 0 }`。

### 6.2 用户资料

#### GET /v1/me

```json
{
  "code": 0,
  "data": {
    "id": "u_xxx",
    "nickname": "张三",
    "avatar": "🎱",
    "phoneNumber": "138****5678",
    "wechatBinding": { "openId": "...", "unionId": "...", "bindAt": "..." },
    "douyinBinding": null,
    "primarySource": "wechat",
    "createdAt": "..."
  }
}
```

#### PATCH /v1/me

```json
// Request (部分更新)
{ "nickname": "新名字", "avatar": "🦊" }
```

#### POST /v1/me/bind-phone

绑定手机号（需先调 `/v1/auth/phone/send-sms` purpose=bind 拿 code）：

```json
// Request
{ "phoneNumber": "+8613812345678", "code": "123456" }
```

若该手机号已属于另一个账号：返回 `code: 30001`，`data.conflictUserId`，引导用户走合并流程。

#### POST /v1/me/unbind-phone

解绑手机号（需验证码）。

#### POST /v1/me/merge-accounts

把当前登录账号和另一个账号（同手机号的另一个三方来源）合并：

```json
// Request
{ "phoneNumber": "+8613812345678", "code": "123456", "strategy": "keep_current" }
```

`strategy`: `keep_current`（保留当前为主）或 `keep_other`。

### 6.3 共享比赛

#### POST /v1/matches

创建比赛。

```json
// Request
{
  "type": "nine_ball",
  "rules": { "bigJack": 10, "smallJack": 7, "golden9": 4, "normalWin": 4 },
  "playerSlots": [
    { "slot": 1, "name": "张三", "claim": true },
    { "slot": 2, "name": "" },
    { "slot": 3, "name": "" }
  ]
}

// Response
{
  "code": 0,
  "data": {
    "match": { /* 同 GET /v1/matches/:id */ },
    "code": "K7P2XM"
  }
}
```

`claim: true` 的 slot 由当前用户占位。

#### GET /v1/matches/:id

获取比赛详情（房间码也可作为 id，服务端兼容处理）。

```json
{
  "code": 0,
  "data": {
    "id": "m_xxx",
    "code": "K7P2XM",
    "type": "nine_ball",
    "rules": { ... },
    "state": "in_progress",
    "players": [
      { "slot": 1, "displayName": "张三", "userId": "u_xxx", "isCurrent": true },
      { "slot": 2, "displayName": "李四", "userId": "u_yyy", "isCurrent": true },
      { "slot": 3, "displayName": "", "userId": null, "isCurrent": false }
    ],
    "scores": { "1": 32, "2": 28, "3": 15 },
    "stats": {
      "1": { "bigJack": 1, "smallJack": 0, "golden9": 0, "normalWin": 5 },
      "2": { "bigJack": 0, "smallJack": 1, "golden9": 1, "normalWin": 2 },
      "3": { "bigJack": 0, "smallJack": 1, "golden9": 0, "normalWin": 1 }
    },
    "timer": {
      "startedAt": "2026-05-08T06:35:00Z",
      "accumulatedMs": 7200000,
      "isPaused": false
    },
    "lastEventSeq": 45,
    "onlineUserIds": ["u_xxx", "u_yyy"],
    "ownerUserId": "u_xxx"
  }
}
```

#### POST /v1/matches/join

通过房间码加入（或认领参赛者位置）。

```json
// Request
{ "code": "K7P2XM", "slot": 2 }
```

- 如果 `slot` 为空且未被占，占位成功
- 如果 `slot` 未填，默认观众
- 已占位 → 返回错误 `40003`

```json
// Response
{
  "code": 0,
  "data": { "match": { ... }, "role": "player" /* or "spectator" */ }
}
```

#### POST /v1/matches/:id/seat

占位 / 离位 / 让座。

```json
// Request 占位
{ "action": "occupy", "slot": 3 }

// Request 离位
{ "action": "leave" }

// Request 让座给某观众
{ "action": "offer", "slot": 1, "toUserId": "u_zzz" }
```

#### POST /v1/matches/:id/events

发送一条比赛事件（核心记分接口）。

```json
// Request
{
  "clientSeq": 101,
  "type": "score_normal_win",
  "payload": { "winnerSlot": 2, "targetSlot": 1 }
}

// Response (同步)
{
  "code": 0,
  "data": {
    "serverSeq": 46,
    "matchState": { /* 应用该事件后的最新 match 简要快照 */ }
  }
}
```

服务端会同时通过 WS 广播。**但**同步响应仍然返回结果，客户端乐观 UI 据此对齐。

#### POST /v1/matches/:id/events/undo

撤销最近一条未撤销的普通事件。

```json
// Response
{ "code": 0, "data": { "serverSeq": 47, "undoneEventId": 46 } }
```

#### GET /v1/matches/:id/events?afterSeq=40

拉取增量事件（断线重连时用）：

```json
{
  "code": 0,
  "data": {
    "events": [
      { "serverSeq": 41, "type": "score_big_jack", ... },
      { "serverSeq": 42, ... },
      ...
    ],
    "hasMore": false
  }
}
```

#### POST /v1/matches/:id/end

结束比赛（房主，或所有参赛者达成一致 —— MVP 先只允许房主）。

```json
// Request
{ "reason": "normal" /* 可选 */ }

// Response
{ "code": 0, "data": { "match": { ...state=ended } } }
```

#### GET /v1/me/matches

我的历史比赛列表。

```json
// Request
?page=1&pageSize=20

// Response
{
  "code": 0,
  "data": {
    "items": [
      {
        "id": "m_xxx",
        "type": "nine_ball",
        "endedAt": "...",
        "durationMs": 7200000,
        "role": "participant",
        "myScore": 32,
        "winnerName": "张三",
        "players": [{ "name": "张三", "score": 32 }, ...]
      }
    ],
    "total": 58,
    "page": 1,
    "pageSize": 20
  }
}
```

---

## 7. 管理端 API

所有路径 `/v1/admin/*`。鉴权 = admin token。权限 = RBAC。

### 7.1 登录

#### POST /v1/admin/auth/login

```json
// Request
{ "username": "admin", "password": "***", "captcha": "abc1" /* 可选 */ }

// Response
{
  "code": 0,
  "data": {
    "accessToken": "eyJ...",
    "refreshToken": "eyJ...",
    "expiresIn": 900,
    "account": {
      "id": "a_xxx",
      "username": "admin",
      "name": "张三",
      "role": "super_admin",
      "mustChangePassword": false
    }
  }
}
```

#### POST /v1/admin/auth/refresh / logout

同 C 端结构。

#### POST /v1/admin/auth/change-password

```json
// Request
{ "oldPassword": "...", "newPassword": "..." }
```

### 7.2 Dashboard / 数据

#### GET /v1/admin/analytics/overview

```json
{
  "code": 0,
  "data": {
    "onlineMatches": 23,
    "todayCreatedMatches": 156,
    "onlineUsers": 84,
    "todayNewUsers": 18,
    "todayEndedMatches": 142,
    "abnormalMatches": 2,
    "compareToYesterday": {
      "onlineMatches": 3,
      "todayCreatedMatches": 12
    }
  }
}
```

#### GET /v1/admin/analytics/matches?range=7d

```json
{
  "code": 0,
  "data": {
    "series": [
      { "date": "2026-05-02", "created": 120, "ended": 118, "avgDurationMs": 3600000 },
      ...
    ],
    "typeDistribution": { "nine_ball": 0.42, "eight_ball": 0.58 },
    "playerCountDistribution": { "2": 0.65, "3": 0.35 }
  }
}
```

#### GET /v1/admin/analytics/users?range=7d

```json
{
  "code": 0,
  "data": {
    "newUserSeries": [{ "date": "...", "count": 15 }, ...],
    "dauSeries": [{ "date": "...", "dau": 210 }, ...],
    "matchesPerUser": 1.8
  }
}
```

#### GET /v1/admin/analytics/recent-anomalies

```json
{
  "code": 0,
  "data": { "items": [ { "type": "auto_pause", "matchId": "...", "at": "...", "desc": "..." }, ... ] }
}
```

### 7.3 房间

#### GET /v1/admin/matches

```
?page=1&pageSize=20
&state=in_progress,paused
&type=nine_ball
&createdFrom=2026-05-01T00:00:00Z
&createdTo=2026-05-08T23:59:59Z
&keyword=138xxxx5678  (房主手机号/昵称/房间码 模糊匹配)
```

Response 列表字段参考 admin UI §4.3。

#### GET /v1/admin/matches/:id

同 C 端 `GET /v1/matches/:id`，多几个字段：

```json
{
  "code": 0,
  "data": {
    "match": { /* 同 C 端，多以下 */ },
    "owner": { "id": "u_xxx", "nickname": "张三", "phoneNumber": "138****5678" },
    "spectators": [ { "id": "u_zzz", "nickname": "老六" } ],
    "onlineUserDetails": [ { "id": "...", "nickname": "...", "lastHeartbeat": "..." } ],
    "adminNotes": []
  }
}
```

#### GET /v1/admin/matches/:id/events?page=1&pageSize=50

完整操作日志（对运营可见，含已被撤销的条目）：

```json
{
  "code": 0,
  "data": {
    "items": [
      {
        "serverSeq": 45,
        "actorType": "user" /* or "admin" */,
        "actor": { "id": "u_xxx", "nickname": "张三" },
        "type": "score_normal_win",
        "payload": { ... },
        "undone": false,
        "undoneByEventId": null,
        "createdAt": "..."
      }
    ],
    "total": 45
  }
}
```

#### 房间管理写操作

| Method | Path | 角色 | Body |
|--------|------|------|------|
| POST | `/v1/admin/matches/:id/force-pause` | operator+ | `{ reason }` |
| POST | `/v1/admin/matches/:id/force-end` | operator+ | `{ reason }` |
| POST | `/v1/admin/matches/:id/dissolve` | super_admin | `{ reason }` |
| POST | `/v1/admin/matches/:id/kick` | operator+ | `{ userId, reason }` |
| POST | `/v1/admin/matches/:id/correct-score` | super_admin | `{ scores, reason, confirm: true }` |

每个都写 `admin_audit_logs` + 通过 WS 广播给房间内所有 C 端。

#### GET /v1/admin/matches/export.csv

导出筛选后的列表（最多 10000 条）。

### 7.4 用户

#### GET /v1/admin/users

```
?page=1&pageSize=20&keyword=138xxx&status=active
```

#### GET /v1/admin/users/:id

返回完整 user + 所有三方绑定 + 封禁历史 + 登录记录（最近 20 条）。

#### POST /v1/admin/users/:id/ban

```json
// Request
{
  "durationDays": 7,    // 0 = 永久
  "reason": "昵称不当"
}
```

#### POST /v1/admin/users/:id/unban

```json
{ "reason": "申诉通过" }
```

#### POST /v1/admin/users/:id/reset-nickname

```json
{ "newNickname": "球友_u12345" }
```

#### POST /v1/admin/users/:id/unbind-wechat | unbind-douyin

```json
{ "reason": "..." }
```

#### POST /v1/admin/users/merge

```json
// Request (仅 super_admin)
{
  "primaryUserId": "u_xxx",
  "secondaryUserId": "u_yyy",
  "reason": "..."
}
```

### 7.5 审计日志

#### GET /v1/admin/audit-logs

```
?page=1&pageSize=50
&actorAdminId=a_xxx
&action=user.ban
&from=...&to=...
```

### 7.6 系统设置

#### GET /v1/admin/settings

返回完整配置 map。

#### PATCH /v1/admin/settings

```json
{
  "match.zombie_pause_minutes": 20,
  "match.max_concurrent_per_user": 5
}
```

只允许 super_admin，写审计日志。

### 7.7 账号管理

#### GET /v1/admin/accounts

#### POST /v1/admin/accounts

```json
// Request (super_admin only)
{
  "username": "operator2",
  "name": "李运营",
  "role": "operator",
  "notes": "2026 新入职"
}

// Response
{
  "code": 0,
  "data": {
    "account": { ... },
    "initialPassword": "Ab3!xK9m@pQ2"  // 一次性返回，之后再也查不到
  }
}
```

#### PATCH /v1/admin/accounts/:id

改姓名/角色/备注/状态。

#### POST /v1/admin/accounts/:id/reset-password

生成新一次性密码返回。

---

## 8. WebSocket 协议

### 8.1 连接

**URL：**

- C 端：`wss://api.example.com/ws?token=<user_access_token>`
- 管理端：`wss://api.example.com/ws/admin?token=<admin_access_token>`

握手时带 token 在 query；server 校验有效 + type 正确。token 失效连接立即关闭（close code 4001）。

### 8.2 消息格式

所有消息 JSON：

```json
// Client → Server
{ "op": "subscribe", "data": { ... }, "reqId": "optional-client-id" }

// Server → Client
{ "op": "event", "data": { ... } }

// Server → Client (ack)
{ "op": "ack", "reqId": "...", "ok": true, "data": { ... } }
```

### 8.3 C 端操作（op）

| op | 方向 | data | 说明 |
|----|------|------|------|
| `subscribe_match` | C→S | `{ matchId }` | 订阅某房间的事件 |
| `unsubscribe_match` | C→S | `{ matchId }` | 退订 |
| `heartbeat` | C→S | `{}` | 30s 一次 |
| `match_event` | S→C | `{ matchId, event: {...} }` | 房间发生事件（同 REST `POST /events` 的产物） |
| `match_state` | S→C | `{ matchId, state }` | 状态变更（paused / ended 等） |
| `presence` | S→C | `{ matchId, onlineUserIds }` | 在线变化 |
| `kicked` | S→C | `{ matchId, reason }` | 被管理员踢出 |
| `ack` | S→C | `{ reqId, ok }` | 对 C→S 操作的确认 |
| `error` | S→C | `{ code, message, reqId? }` | 错误 |

**注意**：MVP 里**事件发送走 REST**（POST /events），不走 WS。WS 只用于订阅推送。这样避免在 WS 上做幂等 / ack 复杂度。

### 8.4 管理端操作（op）

| op | 方向 | data | 说明 |
|----|------|------|------|
| `subscribe_match` | C→S | `{ matchId }` | 同 C 端 |
| `subscribe_all` | C→S | `{ filter?: { state?, type? } }` | 订阅全量房间事件（super/operator 权限） |
| `match_event` / `match_state` / `presence` | S→C | 同 C 端 | |

### 8.5 重连与增量同步

1. 客户端维护 `lastServerSeq[matchId]`
2. 断线 → 本地提示"重连中"
3. 重连成功 → `subscribe_match`，data 附带 `{ matchId, afterSeq: lastServerSeq }`
4. 服务端在订阅成功后立即回推所有 `serverSeq > afterSeq` 的事件
5. 客户端应用这些事件 → 对齐状态

### 8.6 心跳

- 客户端每 30s 发 `{ op: "heartbeat" }`
- 服务端每 60s 无心跳 → 断开
- WS idle 超过 2 分钟 → 断开（兜底）

### 8.7 错误 close code

| code | 含义 |
|------|------|
| 4001 | 未鉴权 / token 无效 |
| 4002 | 鉴权过期 |
| 4003 | 权限不足（如 C 端 token 连管理端路径） |
| 4004 | 被管理员强制断开 |
| 4005 | 心跳超时 |
| 4006 | 协议错误 |

---

## 9. 鉴权与权限

### 9.1 JWT 结构

**Access token payload:**

```json
{
  "type": "user" /* or "admin" */,
  "sub": "u_xxx" /* 或 "a_xxx" */,
  "role": "super_admin",      // 仅 admin token 有
  "iat": 1717850000,
  "exp": 1717850900,
  "jti": "random-token-id"
}
```

**Refresh token payload：**

```json
{
  "type": "user_refresh" /* or "admin_refresh" */,
  "sub": "u_xxx",
  "iat": ...,
  "exp": ...,  // 7 天
  "jti": "..."
}
```

### 9.2 Token 生命周期

- Access：**15 分钟**
- Refresh：**7 天**
- Refresh 用过一次即作废（rotation），生成新的 refresh；服务端维护 `revoked_refresh_tokens` 集合（Redis + 定期清）

### 9.3 RBAC

服务端 API 层面通过装饰器/中间件校验：

```typescript
@Roles('super_admin')
async mergeUsers(...) { ... }

@Roles('operator', 'super_admin')
async banUser(...) { ... }
```

**权限检查优先级：**

1. JWT 是否有效（通用）
2. token type 是否匹配路由（`/admin/*` 要 admin token）
3. 角色是否满足（admin 内部）
4. 资源级检查（如用户只能查自己比赛历史，否则 403）

### 9.4 防刷 / 限流

| 场景 | 实现 |
|------|------|
| 短信发送 | Redis 按手机号 + 全局 IP 滑动窗口 |
| 登录失败 | 账号级 lock（failed_login_count） + IP 级限流 |
| 房间码爆破 | 同 IP 30/min 加入尝试 |
| WS 事件 | 同用户 20/sec，超限丢弃 + 记录告警 |

---

## 10. 关键流程时序图

### 10.1 创建并进入房间

```text
C端(房主)          Auth      Match        DB         Redis       WS
    │               │          │           │           │          │
    │ POST /match   │          │           │           │          │
    ├───────────────┤          │           │           │          │
    │ verify token  │          │           │           │          │
    │               ├──OK──────┤           │           │          │
    │               │          │ INSERT    │           │          │
    │               │          ├───────────┤           │          │
    │               │          │ GenCode   │           │          │
    │               │          ├───────────┤           │          │
    │               │          │ CacheHot  │           │          │
    │               │          ├───────────────────────┤          │
    │ 200 {match, code}        │           │           │          │
    ├◀─────────────────────────┤           │           │          │
    │                                                             │
    │ WS subscribe_match                                          │
    ├─────────────────────────────────────────────────────────────┤
    │ ack + 初始 state                                            │
    ├◀────────────────────────────────────────────────────────────┤
```

### 10.2 扫码加入 + 占座

```text
C端(李四)         Match
   │               │
   │ POST /matches/join  {code, slot:2}
   ├───────────────┤
   │ find by code
   │ check slot available
   │ INSERT match_players
   │ record match_event type=seat_occupy, serverSeq++
   │ Redis publish → WS hub
   │               │
   │ 200 {match, role:player}
   ├◀──────────────┤
   │ WS subscribe_match
   ├───────────────▶

其他端收到: {op: match_event, data: {type: seat_occupy, slot: 2, userId: u_li}}
```

### 10.3 记分 + 广播

```text
C端(李四)         Match         WS Hub           C端(张三, 王五)
   │                │               │                  │
   │ POST /events                   │                  │
   │  {type: score_normal_win,      │                  │
   │   payload: {winnerSlot:2,      │                  │
   │            targetSlot:1},      │                  │
   │   clientSeq: 101}              │                  │
   ├────────────────┤               │                  │
   │ acquire match lock (Redis)    │                  │
   │ apply event → scores 变化      │                  │
   │ INSERT match_events, serverSeq=46                │
   │ publish ws:match:m_xxx: {event:46}               │
   │                ├───────────────▶                  │
   │                │               │ broadcast        │
   │                │               ├──────────────────▶
   │ release lock   │               │                  │
   │ 200 {serverSeq:46, state}     │                  │
   ├◀───────────────┤               │                  │
```

### 10.4 撤销

```text
C端(张三)         Match
   │                │
   │ POST /events/undo
   ├────────────────┤
   │ 找最近一条 undone=false 的普通事件（假设 serverSeq=46）
   │ INSERT match_event type=undo, targetEventId=46, serverSeq=47
   │ UPDATE match_events SET undone=1, undone_by_event_id=[47] WHERE server_seq=46
   │ recompute match state（跳过 undone=1 的事件）
   │ publish ws
   │ 200 {serverSeq:47, undoneEventId:46, newState}
   ├◀───────────────┤

所有端收到: {op: match_event, type: undo, targetEventId: 46} + 新 state
```

### 10.5 断网重连

```text
C端                   WS Hub           Match DB
  │      断网          │                   │
  ×─ ─ ─ ─             │                   │
  │                    │                   │
  │  重连                                    │
  │  wss?token=xxx     │                   │
  ├────────────────────▶                   │
  │  ack               │                   │
  ├◀───────────────────┤                   │
  │  subscribe_match {matchId, afterSeq:45}│
  ├────────────────────▶                   │
  │                    │ SELECT events where server_seq > 45
  │                    ├──────────────────▶│
  │                    │◀──────────────────┤
  │  match_event event 46                 │
  ├◀───────────────────┤                   │
  │  match_event event 47                 │
  ├◀───────────────────┤                   │
  │  match_event ... (全部重放完)          │
  │  subscribe_ack                         │
  ├◀───────────────────┤
```

---

## 11. 部署拓扑（概要）

```text
┌──────────────────────────────────────────────────────────┐
│  LB / CDN                                                │
│   · admin.example.com → 静态（AntD Pro 构建产物）        │
│   · api.example.com → 下游 API Gateway                  │
└─────────────────────────────┬────────────────────────────┘
                              │
                  ┌───────────▼────────────┐
                  │   API Gateway (k8s)    │
                  │   · nginx / kong        │
                  └───────────┬────────────┘
                              │
        ┌─────────────────────┼──────────────────────┐
        │                     │                      │
  ┌─────▼──────┐       ┌──────▼──────┐        ┌──────▼──────┐
  │  App Pods  │       │  App Pods   │        │ Realtime    │
  │ (REST)     │       │ (REST)      │        │  Hub (WS)   │
  │  副本×N    │       │  副本×N     │        │  副本×N     │
  └─────┬──────┘       └──────┬──────┘        └──────┬──────┘
        │                     │                      │
        └──────────┬──────────┴──────────┬───────────┘
                   │                     │
            ┌──────▼──────┐       ┌──────▼──────┐
            │ PostgreSQL  │       │   Redis     │
            │  主从 / 只读 │       │  Cluster    │
            └─────────────┘       └─────────────┘
```

**关键点：**

- REST 应用 pod 和 Realtime Hub 分开部署，生命周期不同（Hub 连接长久，REST 请求短）
- Realtime Hub 水平扩展时，各实例通过 Redis pub/sub 同步"房间 X 有新事件"
- PostgreSQL 主从读写分离（MVP 可不做）
- CDN 缓存管理端静态资源（JS/CSS）

---

## 12. 待确认问题

1. **服务端选型**：Node.js + NestJS（推荐） vs Go vs 微信云开发？
2. ✅ **数据库 = PostgreSQL 15**（已敲定）
3. **抖音小程序的 appId 与登录凭据**：公司名下有没有现成的？需要提前申请
4. **API Gateway 选型**：nginx / kong / cloud 提供的（腾讯云 API 网关、阿里云 API 网关）？
5. **WebSocket 的 LB**：普通 LB 要支持长连接 + sticky session；是否有基础设施限制？
6. **短信通道**：阿里云短信 / 腾讯云短信？需要签名和模板备案
7. **Token 存储方式**：C 端小程序用 `wx.setStorageSync`；管理端用 httpOnly cookie 还是 localStorage？（前者更安全）
8. **是否需要多地域部署**：MVP 单 region 够了吗？
9. **数据合规**：用户注销后 profile 留多久？比赛历史是否随之匿名化？

---

## 13. 里程碑（服务端）

| 阶段 | 内容 | 预估 |
|------|------|------|
| S1 | 项目脚手架（NestJS + Prisma + PostgreSQL 本地） | 2 天 |
| S2 | Auth 服务（微信 + 抖音 + 手机号登录 + JWT + refresh） | 5 天 |
| S3 | User 服务（profile + 三方绑定 + 合并） | 4 天 |
| S4 | Match 服务（REST）+ 状态机 + 事件日志 | 6 天 |
| S5 | Realtime Hub（WS + Redis pub/sub + 重连增量） | 5 天 |
| S6 | Admin 服务（RBAC + 审计 + 后台 API） | 5 天 |
| S7 | Analytics（Dashboard 指标） | 3 天 |
| S8 | 限流 / 监控 / 日志打点 | 3 天 |
| S9 | 集成测试 + 压测 + 上线准备 | 4 天 |

合计 ≈ **37 工作日（约 7.5 周）**。

管理端（§8 里 ≈ 26 工作日）可与服务端部分并行，整体批次 1 约 **8-10 周**。

---

## 14. 修订记录

| 版本 | 日期 | 修改内容 | 作者 |
|------|------|----------|------|
| v2.0.0 草稿 | 2026-05-08 | 初稿：架构 + 数据模型（全表） + C端/管理端 API + WS 协议 + 鉴权 + 流程 | Claude |
