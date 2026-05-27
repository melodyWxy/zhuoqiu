---
date: 2026-05-27
version: v2.20.x
title: 「我」页商家卡加退出按钮 + venue-login 按钮拉宽
---

# 「我」页商家卡加退出按钮 + venue-login 按钮拉宽

## 动机
1. 商家登录后但还没完成入驻申请之前，「我」页显示的「当前已登录商家」卡片只有「查看 / 完成申请 →」一个入口，**没有退出商家登录按钮**——用户希望随时可以从这张卡片直接退出。
2. 切到商家登录页（`/pages/venue-login`）时，「登录」按钮和「申请球房入驻」按钮宽度都很窄；期望横向占满。
3. 用户要求顺便排查全局其他应该全宽但当前没有的按钮。

## PRD / 设计变化
PRD 不涉及按钮宽度细节，本次属纯 UI 对齐，不动 PRD。

## 代码变化

### 客户端
- `billiards-score/src/pages/me/index.tsx`：
  - import `venueAuthApi`；订阅 `clearVenueSession`。
  - `venue-mode-card` 内 `venue-mode-btn` 后追加 `<View className='venue-mode-logout'>退出商家登录</View>`，点击 → `venueAuthApi.logout()`（失败忽略）→ `clearVenueSession()` → toast「已退出商家登录」。已绑定 venue 和未绑 venue 两种状态都显示。
- `billiards-score/src/pages/me/index.scss`：新增 `.venue-mode-logout`，与 `.venue-mode-btn` 同尺寸（`padding: 10px 14px; font-size: 14px;`），背景/边框/文字色用 `--error`（淡红 + 红边 + 红字）。
- `billiards-score/src/pages/venue-login/index.scss`：`.vl-login-btn` / `.vl-apply-btn` 加 `width: 100%; box-sizing: border-box;`。

### 全局按钮宽度审计
扫了所有 `<Button>` 用法对应 class，结论：

| class | 当前 | 期望 | 状态 |
|---|---|---|---|
| `.vl-login-btn` (商家登录) | auto | 全宽 | **本次修** |
| `.vl-apply-btn` (申请球房) | auto | 全宽 | **本次修** |
| `.va-btn-primary/secondary/upload/logout` | 100% | 全宽 | 上次已修 |
| `.login-sheet-btn` | 100% | 全宽 | OK |
| `.start-btn` (config) / `.td-btn` | 100% | 全宽 | OK |
| `.action-btn` (eight/nine ball) | flex:1 | flex 平分 | OK |
| `.profile-avatar-btn` / `.identity-avatar-btn` | 88px / 64px | 圆形头像 | OK（不应全宽） |
| `.vl-send-btn` | auto | 与输入并排 | OK（不应全宽） |
| `.va-btn-text` (重新上传) | auto | inline 次要 | OK（不应全宽） |
| `.join-btn` / `.preview-btn` (入会码页) | auto + flex stretch | 用户未反馈，保留 | 保留 |

### 服务端
无改动。

## 验证步骤
- [ ] `npm run build:weapp:prod` 构建通过
- [ ] 商家登录但未完成申请：进「我」页 → venue-mode-card 看到「查看 / 完成申请 →」+「退出商家登录」（红色调）两按钮 → 点退出 → 卡片消失 + toast
- [ ] 商家已绑定 venue：「我」页 venue-mode-card 同样两按钮可见（顶部「查看球房状态 →」+ 退出）
- [ ] 进 `/pages/venue-login`：登录按钮 + 申请球房入驻按钮都横向占满（左右仅卡片内边距）
- [ ] 「获取验证码」与输入框并排，不变宽

## 上线必做
- 客户端：`npm run build:weapp:prod` 重打包，开发者工具上传
- 服务端：无

## 遗留问题 / 已知限制
- 「我」页 ⋯ 菜单里也有「退出商家登录」入口，与本次新加的 venue-mode-card 内按钮并存，属冗余备选，先不动。
