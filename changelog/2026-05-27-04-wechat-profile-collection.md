---
date: 2026-05-27
version: v2.20.x
title: 微信登录后补全昵称与头像（chooseAvatar + type=nickname）
---

# 微信登录后补全昵称与头像

## 动机
真机调试反馈："授权后获取不了微信昵称"。

根因：微信 2022-10-25 起 `wx.getUserProfile` 不再返回真实昵称头像（固定返回"微信用户"+灰色默认头像），`code2session` 也不带这两个字段。我们 server 兜底是 `nickname: '微信用户' / avatar: '🎱'`。当多个新用户进入同一场赛事时，列表里都是同一个昵称同一个 emoji，**无法区分参赛者**。

官方做法：让用户在登录后**主动选**头像（`<Button open-type="chooseAvatar">`）+ 主动填昵称（`<Input type="nickname">`，聚焦时微信键盘上方会浮出"使用微信昵称"按钮）。

## PRD / 设计变化
- `prd/legal-mvp.md` v1.2：新增 §3.1.4 wechat_profile 步骤说明；变更日志加 v1.2 行。

## 代码变化

### 服务端
- `server/prisma/schema.prisma`：`User.avatar` `@db.VarChar(32)` → `VarChar(512)`，容纳完整 URL。
- `server/prisma/migrations/20260527070000_user_avatar_to_512/migration.sql`：`ALTER TABLE users ALTER COLUMN avatar TYPE VARCHAR(512);`
- `server/src/me/me.controller.ts`：
  - `UpdateMeDto.avatar` 校验从 `Length(1,32)` 放宽到 `MaxLength(512)`，注释解释 emoji/URL 双兼容
  - 新增 `POST /me/avatar`（UserAuthGuard）—— multer 多文件接收，落盘 `${UPLOAD_ROOT}/avatar/yyyymmdd/<rand>.png`，返回完整 URL；MIME 白名单 jpeg/png/webp，5MB 上限
- 复用 `main.ts` 已有的 `useStaticAssets(uploadRoot, { prefix: '/uploads/' })`，URL 直接可访问。

### 客户端
- `billiards-score/src/utils/avatar.ts`：`isAvatarUrl(value)` 判断 emoji vs URL（前缀 `http(s):` / `wxfile:` / `cloud:` / `file:` / `//`）
- `billiards-score/src/core/api/auth.ts`：
  - `meApi.uploadAvatar(filePath)` —— 走 `Taro.uploadFile`（独立通道，自己注 `Authorization: Bearer xxx`），解析后端 `{ code, data: { url } }` 包装
- `billiards-score/src/components/LoginSheet/index.tsx`：
  - Step 加 `'wechat_profile'`
  - `proceedAfterPhoneCollected(currentUser)`：phone 步骤完成后，**仅 weapp** 且 `user.nickname === '微信用户' || !user.nickname` 时切到 wechat_profile，否则直接 finishLogin
  - 新增 `handleChooseAvatar`（缓存 `e.detail.avatarUrl` 到本地 state，预览 `<Image>`）/ `handleSaveProfile`（上传头像 → PATCH /me → setUser merge）/ `handleSkipProfile`
- `billiards-score/src/components/LoginSheet/index.scss`：`.profile-row / .profile-avatar-btn / .profile-avatar-img / .profile-avatar-placeholder / .profile-avatar-hint`
- `billiards-score/src/pages/me/index.tsx` & `me/index.scss`：cloud account 卡按 `isAvatarUrl(cloudUser.avatar)` 分支渲染 `<Image className='cloud-avatar-img'>` 或老的 `<Text className='cloud-emoji'>`

### 未变
- 本地玩家头像（`useUserStore.avatar`，AvatarPickerModal）保留 emoji 选择，不接 chooseAvatar
- 九球/中八卡片上的 `🧍` emoji 是装饰性图标，不属于"用户头像"，不动
- BindPhoneSheet 里短信流程不弹 wechat_profile（这条路径过来的用户走"我"页面改即可）

## 验证步骤
- [x] `server: npx tsc --noEmit` 通过
- [x] `client: npx tsc --noEmit` 仅 v2.20 预存的 NineBall.ts 一条
- [ ] 服务端 deploy 后跑迁移：`docker compose exec server npx prisma migrate deploy`，否则 `users.avatar VARCHAR(32)` 依然限长
- [ ] **微信开发者工具新用户**：清缓存 → 登录 → 协议 → 微信授权 → 手机号授权 → wechat_profile step：
  - 点头像按钮 → 系统弹"使用微信头像"对话框 → 选完 → 按钮里出现头像预览
  - 点击昵称输入框 → 微信键盘上方"使用微信昵称"按钮 → 自动填入
  - 点保存 → toast "登录成功" → sheet 关闭
  - 进「我」页面 → 头部头像变成真实微信头像（圆形）+ 真实昵称
- [ ] 跳过路径：在 wechat_profile step 点"跳过" → 默认昵称"微信用户"+ 默认 emoji 头像，进「我」页面可再改
- [ ] 老用户回归：第二次登录（user.nickname 已不是"微信用户"）→ 不再弹 wechat_profile，直接 finishLogin
- [ ] H5：登录链路完全不进 wechat_profile 步骤
- [ ] 上传失败（大于 5MB / 非图片 MIME）→ toast 提示，停在 wechat_profile step 可重试
- [ ] curl smoke：`curl -X POST .../v1/me/avatar -H "Authorization: Bearer xxx" -F file=@x.png` → 返回 `{ url, path, size, mime }`

## 上线必做
1. **数据库迁移**：`docker compose exec server npx prisma migrate deploy`（schema 改了，不跑迁移会报字段长度错）
2. server 重 build（同前两次）
3. （可选）若 OSS_ENABLED=true 想让头像也走 OSS，需要后续单独把 `/me/avatar` 接到 STS 链路；当前先走本地磁盘 + nginx/caddy 静态反代

## 遗留问题 / 已知限制
- 头像目前只走本地磁盘，多实例部署需要切换到 OSS（后续 v2.30）
- 老账号已有的 emoji 头像 `🎱` / `🧍` 保持不变；用户登录"我"页面改时只能选 emoji（AvatarPickerModal 没变）。如果想让老用户也升级到微信头像，得在「我」页面也加一个 chooseAvatar 入口
- 赛事/对阵列表目前还是只显示昵称，不显示头像；后续如果要显示，需要排期（涉及多端 UI 改动）
- LoginSheet 里 chooseAvatar 拒绝授权（用户关闭对话框）会留 placeholder，没有 toast 提示，是 chooseAvatar 接口本身的限制
