---
date: 2026-06-03
version: v2.22
title: 战报系统 followup - 4 个 user 反馈修复 + 海报重做
---

# 战报系统 followup - 4 个 user 反馈修复 + 海报重做

## 动机
战报系统 7 阶段全量上线后真机回归，user 报了 4 个问题：

1. 房间分享出去的卡片图是个小 home logo（丑），且**朋友点开后还是要手动
   输入房间码**（落地页 query 解析没对上）
2. 战报页左上角「← 返回」从分享卡片直接进入时**点了没反应**（页面栈深度
   1，navigateBack 静默失败）；海报视觉**丑**
3. 「我」页累计战绩卡和下方历史记录卡**没间隔**，挤在一起
4. 战报页一些数字字色和背景色对比度不够，**看着不明确**

## 代码变化

### 1. 房间分享 imageUrl + 落地页 query

`billiards-score/src/utils/share.ts` `buildMatchInviteShare`:
- **path** `?roomCode=` → `?code=`：join 页 `useRouter().params.code` 读
  的是 `code`，名字必须对上才能自动预览房间，不让朋友重复输入
- **imageUrl** 从 `/assets/tabs/home-active.png`（小 home 图）→ `undefined`：
  让微信自动截当前页面顶部 5:4 区域当卡片图。联机房间页中部是房间码 banner，
  截图比 81×81 tabbar logo 应景

> 注：用户原话「先用 logo 兜底」是指等真 share-cover 设计稿；目前的小
> home logo 不算 logo，截图反而更好。后续真有 share-cover 再换。

### 2. 战报页返回 fallback

`billiards-score/src/pages/match-detail/index.tsx`:
- 提取 `handleBack()`：`Taro.navigateBack({ fail: () => switchTab('/pages/index/index') })`
- 兜底链：navigateBack 失败 → switchTab 首页失败 → reLaunch 首页
- 解决从分享卡片 / 小程序码 / scheme 直接进入时页面栈深度 1，
  `navigateBack` 静默失败的体验问题

### 3. 海报重做（server-side `@napi-rs/canvas`）

`server/src/match/replay-renderer.service.ts` 重构整体布局：

| 之前 | 现在 |
|------|------|
| 死黑底 | 暗墨绿渐变（顶 `--primary-dark` → 中 `--bg-dark` → 底 `--primary-dark`），呼应台球桌色调 |
| 顶部金色高光一片 | 加金色装饰横线（顶部左右各 120px 短金线）+ 高光降到 700px |
| 玩家头像零散在 800px 高度 | 中部 760px 高的「比分卡」金边圆角容器把玩家+VS+比分包起来 |
| VS 80px 大字裸放 | VS 50px 圆形装饰底（深底 + 金边）|
| 比分大字干瘪 | 比分加 `shadowBlur: 24, shadowOffsetY: 6` 立体感 |
| 比分下面空荡 | 加金色虚分割线 + 「🏆 X 击败 Y」一行内嵌叙事 |
| 二维码白色裸底 | 二维码区改成深色金边卡片，QR 自带白底，整体调性统一 |
| 二维码占位灰底 | 占位也用深色 + 🎱 + 文字两行 |
| 底部 app 名孤零零 | 底部加金色装饰线（320×2px）后再放 app 名 |

字号也调小一档防止挤：
- 顶部 logo 72px → 64px
- 比分大字 240px → 200px（已经够大）
- 多人金字塔尺寸 240/180/180 → 200/150/150

### 4. 数字对比度

`billiards-score/src/pages/match-detail/index.scss`:
- `.md-headline-card` 背景从单层金色透明渐变 → **叠一层 bg-card 深底**，
  避免白字标题在浅金渐变上糊
- `.md-stat-chip` 字色 `text-secondary` (#a0a8a4 灰) → `text-primary` (#fff)，
  背景从 `rgba(255,255,255,0.06)` → `rgba(212,175,55,0.15)` 金色淡底
- `.md-score` 加 `text-shadow: 0 2px 6px rgba(0,0,0,0.5)` 立体感

`billiards-score/src/pages/me/index.scss`:
- `.stats-num` 加 `text-shadow: 0 1px 4px rgba(0,0,0,0.45)` 让金色大数字
  在 bg-card 上更出挑

### 5. stats-card 间距

`billiards-score/src/pages/me/index.scss`:
- `.stats-card` `margin: 12px 16px 0` → `margin: 14px 16px`（加上下间距，
  与 `.section margin-bottom: 14px` 一致）

## 部署

- weapp 重打 prod dist 上传体验版
- server 重启拿到新海报模板（dev 模式 watch 自动重载）
- 想看新海报：admin 后台 → Matches Detail → 「重新生成海报」按钮

## 关联
- PRD: `prd/match-replay.md`
- Phase A-C5 全套：`changelog/2026-06-02-02 ~ 08-replay-phase-*.md`
