---
date: 2026-05-27
version: v2.20.x
title: 帮助与反馈：用户提交 + 管理员后台
---

# 帮助与反馈：用户提交 + 管理员后台

## 动机
用户原话：
> 在我的页面的关于的版本下面，加一个帮助与反馈的文字按钮，点击后，可弹窗让用户选择反馈类型 => bug 反馈 / 优化建议 / 合作留言，然后输入内容，提交。管理员后台应该多一个用户反馈的菜单，在里面能看到用户的反馈信息，以及用户的信息、联系方式（如果用户登录后进行反馈的话，没有就不展示）。

外加（同一会话内）：
> LEGAL_CONTACT_EMAIL 的值目前是示例邮箱，请改为 18210711176@163.com

## PRD / 设计变化
- `prd/billiards-match-app-prd-v2.md` §5.9：在「我的页」UI 变化条目里追加「帮助与反馈」段，明确：类型三选一（bug / 建议 / 合作）、内容 ≤500 字、匿名/已登录均可、不额外收联系方式（合作留言场景靠登录手机号回联，匿名留言不可回联）。
- 后台菜单增量未单独写入 PRD（PRD 高层文档不枚举管理后台菜单）。

## 设计决策（已与用户确认）
- 表单字段：仅 `type` + `content`，**不收任何联系方式**。
- 内容上限：**500 字**。
- 后台状态机：`pending`（未处理）→ `resolved`（已处理）。仅一个动作「标记已处理」，不做反向。
- 后台必备：列表 + 详情、按类型/状态筛选、标记已处理 action。

## 代码变化

### 数据库
- `server/prisma/schema.prisma`：新增 enum `FeedbackType` (`bug | suggestion | cooperation`) / `FeedbackStatus` (`pending | resolved`) + model `Feedback`（id 走 `genId('fb')` 字符串主键、`userId` 可空 FK 到 User、`content` `VARCHAR(500)`、status 默认 pending、`resolvedAt` / `resolvedBy` 可空、三索引 status/type/createdAt）；User 加反向关系 `feedbacks Feedback[]`。
- 迁移：`server/prisma/migrations/20260527120000_add_feedback/migration.sql`，创建两个 enum、`feedbacks` 表、三索引、user FK（onDelete SetNull）。

### 服务端（NestJS）
- 新模块 `server/src/feedback/`：
  - `feedback.module.ts`（imports AuthModule，挂两个 controller + service）。
  - `feedback.service.ts`：`create` / `adminList` / `adminGet` / `adminResolve`。`adminResolve` 已是 resolved 时幂等返回当前状态。
  - `feedback.controller.ts`（`@Controller('feedback')`，`@UseGuards(OptionalUserAuthGuard)`）：`POST /v1/feedback` body 校验 → 若 `req.user` 存在带上 userId，否则 null。
  - `feedback-admin.controller.ts`（`@Controller('admin/feedback')`，`@UseGuards(AdminAuthGuard)`）：`GET /` 列表（type / status 筛选 + 分页）、`GET /:id`、`PATCH /:id/resolve` 标记已处理 + 写 audit log（action `feedback.resolve`）。
  - `dto/submit.dto.ts` + `dto/admin-list.dto.ts`。
- 新 guard `server/src/auth/optional-user-auth.guard.ts`：复制 `UserAuthGuard` 思路但缺/坏 token 不抛错；`auth.module.ts` providers + exports 加上。
- `server/src/app.module.ts` imports 加 `FeedbackModule`。

### 小程序（Taro）
- 新组件 `billiards-score/src/components/FeedbackModal/{index.tsx, index.scss}`：
  - 类型 3 个 chip（点选切换，金色高亮）；
  - 多行 `Textarea`（高 130px）+ 右下字数计数 `n/500`；
  - 取消 / 提交按钮（`flex: 1` 平分），提交期间禁用。
- 新 API 客户端 `billiards-score/src/core/api/feedback.ts`：`feedbackApi.submit({ type, content })`，走 `auth: true`（有 token 就带，没有就匿名）。
- `billiards-score/src/pages/me/index.tsx`：「关于」section 在版本行下方加 `.about-row.about-row-link`「帮助与反馈 →」入口；末尾渲染 `<FeedbackModal>`。
- `billiards-score/src/pages/me/index.scss`：加 `.about-row-link`（金色 + 可点态）。
- 顺手修：`billiards-score/src/pages/legal/content.ts` 的 `LEGAL_CONTACT_EMAIL` 从占位 `support@jiqiubang.example` 改为 `18210711176@163.com`（用户口述要求，算单点 chore，搭车在本次 changelog 记一笔）。

### 管理后台（admin-web）
- 新 API `admin-web/src/api/feedback.ts`：`list` / `get` / `resolve`，类型定义 `FeedbackItem` / `FeedbackType` / `FeedbackStatus` / `FeedbackUser`。
- 新页面 `admin-web/src/pages/Feedback/List.tsx`：
  - 顶部 Form：类型 / 状态两个 Select（allowClear，全部即不传）+ 搜索 / 重置。
  - Table 列：时间、类型 Tag（红/蓝/金）、内容（`Paragraph` ellipsis rows=2 可展开）、用户（`<Link>` 跳 `/users/:id` + 手机号；无用户为「匿名」）、状态 Tag（橙/绿）、操作（pending → 「标记已处理」`Popconfirm` → PATCH 后刷新；resolved → 显示处理时间 + 处理人）。
  - 分页同 audit 页。
- 路由 `admin-web/src/routes.tsx`：`/feedback` 挂 `FeedbackList`，放在 `venue-applications` 与 `audit` 之间。
- 菜单 `admin-web/src/components/AppLayout.tsx`：加「用户反馈」`MessageOutlined`，位置同上。

## 验证步骤
- [x] `cd server && npx prisma generate && npx tsc --noEmit` 全过
- [x] `cd billiards-score && npm run build:weapp:prod` Compiled successfully
- [x] `cd admin-web && npx tsc --noEmit && npm run build` 全过
- [ ] 服务端：本地数据库执行 `npx prisma migrate dev --name add_feedback`（或部署时 `npx prisma migrate deploy`）应用迁移
- [ ] 小程序：登录态 → 「我」→「关于」段看到「帮助与反馈 →」→ 点开 → 选 bug / 建议 / 合作 → 输入 200 字 → 提交 → toast「反馈已提交，感谢」
- [ ] 小程序：登出 → 重新提交 → 后台显示「匿名」
- [ ] 小程序：尝试提交 600 字内容 → maxlength 应拦在 500 字（Textarea 自身），后端 class-validator 兜底 400
- [ ] 后台：左侧菜单「用户反馈」可见 → 列表加载、按类型/状态筛选、点「标记已处理」→ Popconfirm → 状态从橙变绿，处理时间出现
- [ ] 后台：点击用户昵称跳转到 `/users/:id`
- [ ] 后台：「标记已处理」action 写 audit log（`/audit` 列表能看到 `feedback.resolve` 记录）

## 上线必做
- 服务端：部署前跑 `npx prisma migrate deploy` 应用 `20260527120000_add_feedback` 迁移
- 小程序：`npm run build:weapp:prod` 重打包并上传新版
- 管理后台：`npm run build` 后部署 dist

## 遗留问题 / 已知限制
- 不做反向操作（已处理 → 未处理），后续如需再加。
- 不发邮件 / 微信通知运营，仅后台主动拉。
- 不导出 CSV（用户未要求）。
- `LEGAL_CONTACT_EMAIL` 是个人邮箱占位，正式上线前法务/运营若有专用对外邮箱再换。
