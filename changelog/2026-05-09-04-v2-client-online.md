---
date: 2026-05-09
version: v2.0.0-alpha.5
title: C 端 Taro 联机模式全链路打通
---

# C 端 Taro 联机模式全链路打通

## 动机

服务端（WS + 合并）已就绪，管理端已联调；把 C 端一期本地 app 改造成能**和朋友联机记分**。阶段 A（服务端能力）+ 阶段 B（C 端改造）这轮一并落地。

## PRD / 设计变化

服务端 PRD 无新增；客户端按现有 `shared-match-backend.md` 的 API/WS 协议实现。

## 代码变化

### 服务端（增量）

- `server/src/auth/sms.service.ts`：新增 **`DEV_FIXED_SMS_CODE` 环境开关**
  - 设了就跳过限流 + 不写数据库 + `verifyCode` 只接受固定值
  - `/v1/auth/phone/send-sms` 响应带 `devHint` 字段，前端直接显示"本地开发模式：验证码固定为 123456"
- `server/.env` / `.env.example`：加 `DEV_FIXED_SMS_CODE=123456`

### 客户端（新增 / 改造）

**核心库（`src/core/`）：**

- `api/config.ts`：API + WS base URL 常量
- `api/client.ts`：基于 `Taro.request` 的统一调用，自动注入 Bearer token；401 触发 refresh 一次 + 重试；业务错误自动 toast
- `api/auth.ts`：`authApi`（wechat/douyin/phone）+ `meApi`（get/update/bindPhone/unbindPhone/mergeAccounts）
- `api/match.ts`：`matchApi`（create/join/detail/seat/event/undo/end/myHistory）
- `auth/store.ts`：`useAuthStore` zustand persist + Taro 存储适配
- `ws/socket.ts`：`MatchSocket` 单例封装
  - Taro.connectSocket + 自动重连（指数退避）
  - 断线保留订阅列表，onOpen 自动重发
  - 心跳 30s
  - **协议修正**：client→server 用 `{event, data}` 匹配 `@SubscribeMessage`；server→client 保留 `{op, data}`
  - `hasOpened` 防 race condition（send 前验证）

**通用组件：**

- `components/LoginSheet/`：三步式底部 Sheet —— 菜单 → 手机号 → 验证码
- `components/BindPhoneSheet/`：四步 —— 输入号 → 验证码 → 冲突确认 → 合并验证码
  - 自动把服务端 `devHint` 显示在提示区

**页面改造：**

- `pages/me/`：顶部加**云账号卡片**
  - 未登录：打开 LoginSheet
  - 登录后：头像 + 昵称 + 脱敏手机号 + "绑定手机号"/"退出"入口
- `pages/index/`：首页加第三张卡片"🔗 加入联机房间"
- `pages/config/`：加**联机 toggle**（登录后可开），开启则调 `matchApi.create` 生成房间码跳游戏页
- `pages/join/`（**新页**）：
  - 输入 6 位房间码 → 预览房间（类型/状态/玩家） → 选空位参赛或以观众进入
  - 支持 URL 带 `?code=XXXXXX` 自动预览
- `pages/nine-ball/` + `pages/eight-ball/`：Router 层分发
  - 带 `?matchId=xxx` 参数 → `OnlineMode.tsx`（联机，WS 驱动）
  - 不带 → 原本地 `LocalNineBall` / `LocalEightBall`（一期逻辑完全不改）
- `pages/nine-ball/OnlineMode.tsx`：
  - 进页 → `matchApi.detail` 初始化 + WS connect + subscribeMatch
  - 收到 `match_event` → `refresh()` 拉最新 detail
  - 点卡片 → ActionSheet 选 普胜/小金/大金/黄金9 → （普胜/小金）再选掏分目标 → POST `/events`
  - 犯规按钮 → 两步 ActionSheet
  - 撤销按钮 → POST `/events/undo`
  - 结束比赛（仅房主） → POST `/end`
  - 房间码点击复制
  - 观众身份：禁用记分按钮
- `pages/eight-ball/OnlineMode.tsx`：精简版（只有"点卡片=本局胜"）
- `app.config.ts`：注册 `pages/join/index`

## 验证步骤（全部通过）

**单用户流程（/browse 模拟）：**

- [x] 未登录时 `/me` 显示"登录/注册"
- [x] 点登录 → 选"手机号登录" → 填 13900000099
- [x] 点"获取验证码" → 提示显示"本地开发模式：验证码固定为 123456"
- [x] 填 123456 → 登录成功，UI 变"🎱 球友_0099 · 手机号 139****0099"
- [x] 回首页 → 点九球 → 进 config → 开联机 toggle → 点"开始比赛"
- [x] 跳到 `/pages/nine-ball?matchId=m_xxx`，显示房间码 `YLKCMV`
- [x] 点 1 号位卡片 → ActionSheet → 选普胜 → 选掏 2 号位 → 分数 [4, -4, 0]

**跨用户实时同步：**

- [x] 用 curl 让 B 用户加入 slot 2
- [x] B 发大金 → 服务端算出 `{1:-10, 2:20, 3:-10}`
- [x] A 的浏览器 UI **1.5 秒内自动刷新**到相同值
- [x] B 再发黄金9 → A UI 再次自动刷新到 `[-18, 32, -14]` ✅

## 关键坑（已解）

### 1. NestJS WebSocket 协议不匹配

服务端 `@SubscribeMessage('subscribe_match')` 读客户端消息的 **`event`** 字段，而我原本 C 端 send 的是 `{op, data}`。服务端静默忽略 → 订阅从未生效 → 收不到广播。

修复：C 端 `sendEvent(event, data)` 发 `{event, data}`；服务端主动 push 保留 `{op, data}`。

### 2. WS 连接 open 前发送失败

`SocketTask.send:fail SocketTask.readState is not OPEN`。修复：加 `hasOpened` 标志，send 前检查；`onOpen` 回调基于 `subscribedMatches` 重发。

### 3. JWT Access TTL 15 分钟导致测试中断

调试过程拖太久 token 会过期。C 端 HTTP client 里已经有 refresh 机制；WS 层面也应在 token 过期前主动续期（本轮未做，后续补）。

### 4. Taro 存储 key 外层包 `{data: ...}`

不影响 zustand persist 恢复（因为它用 getItem 得到的就是 data 内容），但如果外部脚本直接读 `localStorage.getItem`，要先 `JSON.parse(...).data` 再 parse。

## 已完成能力一览

| 场景 | 状态 |
|------|:----:|
| 游客本地计分（一期 v1） | ✅ 保留 |
| C 端手机号登录（固定码 123456） | ✅ |
| C 端微信 mock 登录 | ✅ |
| 绑定手机号 + 冲突 → 合并 | ✅（代码完备，UI 没实测） |
| 创建联机房间（可选人数 2/3、规则配置） | ✅ |
| 通过房间码加入 + 选空位 / 观众 | ✅ |
| 联机记分（九球全套事件） | ✅ |
| 联机记分（中八点卡片=本局胜） | ✅ |
| 撤销（参赛者任意人） | ✅ |
| 结束比赛（房主） | ✅ |
| WS 实时广播（跨用户） | ✅ |
| WS 自动重连 + 订阅恢复 | ✅ |
| 一期本地模式共存（config 页 toggle） | ✅ |

## 遗留 / 已知限制

- **WS token 过期后的自动续期**：WS 连接断后 refresh token 获取新 access 再重连
- **比赛中断恢复**：刷新页面后重新拉 detail 已 OK，但计时器会跳秒（服务端是权威）
- **踢人通知**：服务端已发 `kicked` 事件，客户端 OnlineMode 里有监听并跳转，但没实测
- **加入房间页的"扫码"**：仅支持输码，扫码能力需小程序 API（Taro.scanCode），H5 下无法测
- **历史记录页云端同步**：一期本地记录未与云端合并展示
- **中八联机不含犯规**（中八本身规则就简单，MVP 可接受）

## 下一步

批次 2 + 批次 3 的目标达成。剩余选项：

1. **账号管理页（admin-web）**：super_admin 创建 operator（服务端 API 也要补）
2. **C 端微信真实登录**：接入微信小程序 appId + 后端 wx.login code 换 openid
3. **批次 4：球房 + 赛事**（独立大块）
