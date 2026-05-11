---
date: 2026-05-11
version: v2.0.0-alpha.7
title: 联机对战页选中-操作 UI 重构 + 登录后继续未结束比赛
---

# 联机对战页选中-操作 UI 重构 + 登录后继续未结束比赛

## 动机

上一轮 UX 修复完成后继续迭代：

1. 联机对战页当前是"点玩家卡片 → 弹 ActionSheet"，交互层级深、每次都得翻弹窗，体验差
2. 已登录用户如果上次比赛没正常结束（app 崩了、切后台、跨设备登录），目前没有"回到那场比赛"的入口

## 用户反馈原文

> 房间对战界面，犯规和撤销不对称，而且太大了。点击对应的人后，才会出加分相关的操作弹窗，感觉不太友好。把这些操作按钮都直接集成到界面里吧，相关操作，在没有选中人之前，要提示用户先选择对应玩家。

> 对于登陆用户来讲，如果登陆后，先查询一下是否还有该用户创建的未结束的房间，如果有的话，直接跳转到该房间的对战界面内。

## 代码变化

### 联机对战页选中模式

**九球 `pages/nine-ball/OnlineMode.tsx`**
- 新 state `selectedSlot: number | null`
- `handleCardClick` 改为 toggle 选中（不再弹 ActionSheet）
- 加 `ensureSelected()` 校验 helper；`doWin(kind)` 用当前选中做 4 种胜利（普胜/小金/大金/黄金9）
- `handleFoul` 改为：选中 = 犯规者，再弹 ActionSheet 选"给谁 +1"
- render 加：
  - `.player-card.selected` 高亮（金色边框 + 金色阴影）
  - `actions-hint` 动态文案：未选 → "👆 先点玩家卡片选中"；已选 → "已选中 {name} · 点下方操作"
  - `.win-grid` 2×2 四个胜利按钮
  - `.actions-grid` 仅保留犯规/撤销
- 操作完成后 `setSelectedSlot(null)` 自动清空

**中八 `pages/eight-ball/OnlineMode.tsx`**
- 同样改选中模式
- 单胜利按钮 `本局胜 +1` + 撤销

**SCSS**
- `pages/nine-ball/index.scss` 加 `.player-card.selected`、`.win-grid`、`.win-btn` 变体（normal/small/big/golden9 四种配色）
- `pages/eight-ball/index.scss` 加 `.player-card.selected`

### 登录后继续未结束比赛

**服务端**
- `match.service.ts` 新增 `findMyActiveMatch(userId)`：按 `createdAt desc` 查 user 参与的 `waiting/in_progress/paused` 房间，返回完整 detail 或 null
- `match.controller.ts` 新增 `GET /v1/me/active-match`

**客户端**
- `core/api/match.ts` 新增 `matchApi.myActiveMatch()`
- 新文件 `core/match/resume.ts`：`tryResumeActiveMatch()` helper —— 查询到有活跃房就 `Taro.redirectTo` 到对应游戏页
- `components/LoginSheet/index.tsx` 加 `redirectToActiveOnSuccess?: boolean` prop；微信/手机号两条登录路径都在成功后调用 helper
- `pages/index/index.tsx`：
  - LoginSheet 传 `redirectToActiveOnSuccess`
  - 加"🎮 你有进行中的比赛"banner（`.active-match-banner`），`useEffect` + `useDidShow` 刷新
  - 点击 banner 走 `navigateTo` 进对战页
- `pages/index/index.scss` 加 banner 样式（金色渐变边框 + 箭头）

### 为什么 config/join/me 不自动跳

- **join**：用户明确指定了要加入的房间码，不应跳去他的旧房
- **config**：用户明确来配置新比赛，跳走会让他困惑；新建比赛会自动关旧房（见前一轮 #8）
- **me**：用户主动去"我的"页面看历史；自动跳走违背意图

首页保留 banner 作为"回比赛"的通用入口。

## 验证

### 手动

待重启三端后用 /browse 走一遍：
```
✓ 登录后进首页 → 若有未结束房间，金色 banner 可见 + 点击跳转
✓ 九球对战页：点玩家卡片 → 卡片金色高亮 + hint 变成"已选中"
✓ 四个胜利按钮 disabled 灰 → 选中后启用；点大金 → score+10；自动清空选中
✓ 犯规：选中 A → 点犯规 → ActionSheet 选"给 B+1"→ 完成
✓ 中八：选中 → 本局胜 → wins+1
✓ 结束比赛后，首页 banner 消失
```

## 遗留

- 中八选中模式已对齐，但中八本身操作少（就一个胜利），意义主要是一致性
- `/me/active-match` 每个页面加载都查一次；活跃房场景低频，暂不做缓存
- banner 只在首页显示，config 页没同步加（避免跟"开新局"意图冲突）
