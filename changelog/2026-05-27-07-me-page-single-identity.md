---
date: 2026-05-27
version: v2.20.x
title: 「我」页面单一身份重构（方案 A1）
---

# 「我」页面单一身份重构

## 动机
登录后 `me` 页面同时挂着两张卡：

1. 上面一张「云端账号」（来自 `useAuthStore.user`）：头像 / 昵称 / 手机号 / 退出登录
2. 下面一张「本地账号」（来自 `useUserStore`）：头像 emoji / 昵称，可点击改

用户视角：「这是两个我吗？」核心混乱。

历史包袱：v1 全程没登录，所以有「本地我」做参与者默认名；v2 加了登录后没把本地账号收掉，留着两条数据线。

## 决策摘要（用户确认）
**方案 A1**：登录后只有云端账号一张卡。本地比赛默认玩家名也用云端昵称。

具体语义：
- **「我」页面**：单卡、唯一身份；登录态读云端，未登录态读本地
- **本地比赛**（offline nine-ball / eight-ball）：玩家 1 默认名 `cloudUser?.nickname || localNickname || '我'`；长按改名仍可改，**只在本场比赛 state 内生效**，不写回任何 store
- **联机比赛**：昵称由账号决定，不能改（本来就没改名入口，无需新增禁用）

## 代码变化

### 客户端

- `billiards-score/src/pages/me/index.tsx`：
  - 删掉原来「本地 profile-card」整块（avatar 大图 + nickname + edit-icon）
  - 原「cloud-account-card」/「cloud-card-anon」合并为唯一的 `.identity-card`
  - 已登录态：头像（weapp `<Button open-type="chooseAvatar">` / H5 `AvatarPickerModal`）+ 昵称行（点击 → `InputModal`）+ 手机号 + id；编辑全部走 `meApi.update`，写回 `useAuthStore.setUser`
  - 未登录态：本地 emoji 头像 + 本地昵称 + 「登录 / 注册」主 CTA + 解锁说明；编辑写本地 `useUserStore`
  - 「绑定手机」「退出登录」从卡片操作位移到右上角 `⋯` 菜单
  - `displayNickname` / `displayAvatar` 计算属性统一两态展示，避免双 state 闪烁
- `billiards-score/src/pages/me/index.scss`：
  - 删 `.cloud-account-card`/`.cloud-card-anon`/`.cloud-row`/`.cloud-emoji`/`.cloud-avatar-img`/`.cloud-info`/`.cloud-nickname`/`.cloud-id`/`.cloud-phone`/`.cloud-actions`/`.cloud-btn`/`.profile-card`/`.avatar`/`.avatar-emoji`/`.avatar-hint`/`.nickname-row`/`.nickname`/`.edit-icon`
  - 加 `.identity-card`/`.identity-row`/`.identity-avatar-btn`/`.identity-avatar-img`/`.identity-avatar-emoji`/`.identity-info`/`.identity-name-row`/`.identity-name`/`.identity-edit`/`.identity-meta`/`.identity-id`/`.identity-login-btn`/`.identity-login-hint`
- `billiards-score/src/pages/nine-ball/index.tsx`：`LocalNineBall` 初始化玩家时 `myName = cloudNickname || localNickname || '我'`
- `billiards-score/src/pages/eight-ball/index.tsx`：`LocalEightBall` 同上 `myName || '我'`

### 不变
- 联机模式（`OnlineMode.tsx`）从来没暴露改名 UI，`displayName` 直接读服务端，无需新增"禁用"
- `useUserStore` 字段保留，未登录用户继续用；已登录用户的本地字段仍存在但 UI 不展示
- `BindPhoneSheet` / `LoginSheet` / `AvatarPickerModal` 等组件零改动

## 验证步骤
- [x] `client: npx tsc --noEmit` 仅剩 v2.20 预存的 NineBall.ts 一条
- [ ] 未登录态：进「我」页 → 看到一张卡（本地头像 emoji + 本地昵称 + 「登录/注册」主 CTA）
  - 点头像 → AvatarPickerModal 选 emoji → 立即生效（写本地）
  - 点昵称 → InputModal 改 → 生效（写本地）
  - 进九球本地模式 → 玩家 1 默认名 = 本地昵称
- [ ] 登录态：进「我」页 → 一张卡（云端头像 + 云端昵称 + 手机号 + id），**没有第二张卡**
  - weapp 点头像 → 微信 chooseAvatar → 上传 + meApi.update → 立即更新
  - H5 点头像 → AvatarPickerModal emoji → meApi.update → 更新
  - 点昵称 → InputModal → meApi.update → 更新
  - 进九球本地模式 → 玩家 1 默认名 = **云端昵称**（不是本地的）
  - 长按玩家卡改名 → 只改本场，回到「我」页面云端昵称未变
- [ ] 联机模式：玩家卡显示服务端 `displayName`，无改名入口（一直如此）
- [ ] 右上角 `⋯` 菜单：登录态多了「绑定手机号」（仅未绑时显示）和「退出登录」；未登录商家时多了「切换到球房管理模式」
- [ ] 已登录商家：venue-mode-card 仍显示在身份卡下方

## 上线必做
- 客户端：`docker compose up -d --build h5`（小程序：本地 `npm run build:weapp:prod` 重打包）
- 服务端：无改动

## 遗留问题 / 已知限制
- `useUserStore` 的本地字段对已登录用户实质成「死数据」；后续可考虑彻底废弃这个 store，把"未登录占位名"挪到一个轻量的 sessionStorage
- 已登录用户改昵称走 `meApi.update`，未做防抖；用户连点会多次请求（成本极低，后续看需求加 throttle）
- 「我」页面没有"账号合并"入口；目前合并只在 BindPhoneSheet 检测到冲突时触发，前后两个登录账号的关联只能走那条路
