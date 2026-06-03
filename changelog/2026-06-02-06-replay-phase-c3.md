---
date: 2026-06-02
version: v2.22
title: 战报系统 · Phase C-3 - 前端轮询 + 海报展示
---

# 战报系统 · Phase C-3 - 前端轮询 + 海报展示

## 动机
`prd/match-replay.md` 第 5 阶段。C-1 的海报是异步生成的，前端打开战报页时
可能海报还在 pending；按 PRD §5.5 的方案，骨架数据立刻渲染，海报区单独
轮询。

## PRD / 设计
- `prd/match-replay.md` §5.5（异步生成的交互态）

## 代码变化

### `pages/match-detail/index.tsx`
- 新增 state `pollExhausted`：轮询超时标志
- 新增 useEffect 轮询逻辑：
  - `replay.poster.status === 'pending'` 且未超时时启动 setInterval
  - 每 1500ms 拉一次 replay
  - 命中 `status !== 'pending'` 立刻清 timer 并 setReplay
  - 跑满 20 次（30s）→ `setPollExhausted(true)` 停止
- 新增 `handleRetryPoster()`：用户点「点击重试」→ 清 pollExhausted + 拉
  一次新 replay；若 server 端期间已 ready 就直接出
- 海报区四态 UI：
  - `pending && !pollExhausted` → LoadingState 占位
  - `pending && pollExhausted` → 「点击重试」按钮
  - `ready` → 海报大图（点击 previewImage）
  - `failed` → 静默兜底（emoji + 短句）

### `pages/match-detail/index.scss`
- 新增 `.md-poster-retry` `.md-poster-retry-text` `.md-poster-retry-btn`
  样式：金色描边按钮，与刀 D 的 EmptyState CTA 同档

### 分享 imageUrl 升级
已在 Phase A 时埋好（`if (replay.poster.url) share.imageUrl = replay.poster.url`），
本期没改但确认链路打通：
- 海报 pending → imageUrl 走 logo 兜底
- 海报 ready → imageUrl 切到 OSS URL（朋友收到的卡片图就是真海报）
- 海报 failed → imageUrl 仍是 logo 兜底；分享继续可用

## 实测预期
- @napi-rs/canvas 绘制 ≈ 100ms
- fetch 头像 + OSS 上传 + 微信 wxacode + 上传二维码 ≈ 1-2s
- 用户从弹窗到点查看战报 ≈ 0.5-2s navigation
- → P50 海报 ready 时机 **早于**用户进战报页
- → 少数情况下需要轮询 1~3 次（1.5s × 3 = 4.5s）

## 验证
- [x] tsc 干净；build 通过
- [ ] 真机：进战报页瞬间海报区展示 LoadingState；约 1-3s 后无缝切到大图
- [ ] 故意 stub server 让海报永远 pending → 轮询 30s 后出现「点击重试」
- [ ] 分享出去的卡片，海报 ready 时是真海报；pending / failed 时是 logo

## 关联
- PRD：`prd/match-replay.md`
- 上一阶段：`changelog/2026-06-02-05-replay-phase-c2.md`
- 下一阶段：Phase C-4（战绩接口 + 我页模块）
