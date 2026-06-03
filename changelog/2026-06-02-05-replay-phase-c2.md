---
date: 2026-06-02
version: v2.22
title: 战报系统 · Phase C-2 - 小程序码 + scene 路由
---

# 战报系统 · Phase C-2 - 小程序码 + scene 路由

## 动机
`prd/match-replay.md` 第 4 阶段。把 C-1 海报底部的「扫码看战报（即将上线）」
占位接通成真小程序码，扫码直达战报页 → 形成传播闭环。

## PRD / 设计
- `prd/match-replay.md` §0（决策 #2 二维码扫码进战报页）、§4.3（小程序码）、
  §5.7（scene 解析）

## 代码变化

### server

#### `server/src/auth/wechat.service.ts`
- `getStableAccessToken()` 从 private 改公开 —— wxacode 调用要复用 token
  缓存（防止 token 频繁刷新触发微信限流）

#### `server/src/match/wxacode.service.ts` （新）
封装 `wxacode.getUnlimited`：
- scene 限 32 字符；建议 ASCII（中文 UTF-8 多字节会爆）
- check_path: false（开发版 / 体验版 page 还没发布也能拉）
- env_version 走 `WX_REPLAY_ENV_VERSION` 环境变量（默认 release）
- 视觉：金色 line_color (#D4AF37)，280 width
- 失败时抛 `Error('wxacode err 41030: ...')`，调用方决定降级策略

#### `server/src/match/replay-job.service.ts`
- 注入 `WxacodeService`
- 主流程加 `fetchWxacode()`：matchId 后 12 字符作 scene（`m=xxxxx`）→ 拉
  PNG buffer → 单独上传 `replay/{id}/qr.png` 给 admin 调试 + 把 buffer
  传给 renderer 画到海报上
- 拉 wxacode 失败（开发版 / 微信限流 / 小程序未发版）**不阻塞海报生成**，
  fallback 到占位灰底，海报仍能 ready

#### `server/src/match/match.service.ts`
- 新增 `findByIdSuffix(suffix)`：matchId 后缀（6-16 字符）→ 完整 id
- 用 PG `id LIKE '%suffix'` 全表扫；matches 表通常 < 百万行可接受。多于一
  条命中返回 null（前端兜底）

#### `server/src/match/match.controller.ts`
- 新增 `GET /matches/by-suffix/:suffix` 公开接口

#### `server/src/match/match.module.ts`
- providers 加 `WxacodeService`

### weapp

#### `billiards-score/src/app.tsx`
- 改写为带 `onLaunch` 的 class：scene 1011/1047/1048（小程序码 / 二维码）+
  `query.scene = 'm=xxxxx'` → `Taro.reLaunch` 到 match-detail?ms=...

#### `billiards-score/src/core/api/match.ts`
- `matchApi.byIdSuffix(suffix)` 调用 server 反查接口

#### `billiards-score/src/pages/match-detail/index.tsx`
- 同时支持 `?id=` 和 `?ms=` query：
  - 有 id → 直接走原流程
  - 仅有 ms → 先调 byIdSuffix 拿完整 id，再走 replay
  - 都没 → 「参数错误」
  - ms 反查失败 → 「战报不存在」EmptyState

## 海报视觉变化

C-1 占位「扫码看战报（即将上线）」灰底 → 真小程序码 PNG（金色 280px）

## 部署 / 上线提醒

- **微信小程序需要发版才能拉 wxacode**（开发版会报 41030）
- 生产环境：`WX_REPLAY_ENV_VERSION` 不设或设 `release`，扫码进正式版小程序
- 体验版回归：`WX_REPLAY_ENV_VERSION=trial`，扫码进体验版
- 开发版本地调试：拉 wxacode 会失败，海报会回到「扫码看战报（即将上线）」
  占位 —— 这是预期行为，不是 bug

## 验证
- [x] tsc 无错；server / weapp 都 build 通过
- [ ] 体验版真机：打完比赛 → 战报海报底部小程序码非占位
- [ ] 长按识别 / 扫码 → 进入战报页（同一场）
- [ ] scene 反查命中：log 看到 `byIdSuffix` 调用 → 拿到完整 matchId
- [ ] scene 反查不命中：进「战报不存在」兜底页

## 故意保留 / 未做
- **scene 不带版本号**：以后 scheme 变更需要 server 端兼容老 scene；本期
  只接一种 `m=xxxxx`
- **小程序码批量重生成**：admin 接口已有（C-1 加的 force=true），UI 在 C-5

## 关联
- PRD：`prd/match-replay.md`
- 上一阶段：`changelog/2026-06-02-04-replay-phase-c1.md`
- 下一阶段：Phase C-3（前端轮询 + 海报展示）
