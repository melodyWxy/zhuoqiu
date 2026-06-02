---
date: 2026-06-02
version: v2.22
title: 战报系统 · Phase C-5 - admin-web 集成（收尾）
---

# 战报系统 · Phase C-5 - admin-web 集成（收尾）

## 动机
`prd/match-replay.md` 第 7 阶段，也是战报系统**最后一阶段**。把 admin
后台与战报海报打通：
- 比赛详情页能看到海报缩略图 + 二维码 + 状态
- admin 能手动重新生成（force=true，覆盖 24h 缓存）
- 列表页能快速看每场战报状态

## PRD / 设计
- `prd/match-replay.md` §6（admin-web 改动）

## 代码变化

### server

#### `server/src/match/match.service.ts`
- `detailFromTx` 返回值追加 5 个 replay 字段：`replayStatus` / `replayPosterUrl` /
  `replayQrUrl` / `replayGeneratedAt` / `replayFailedReason`

> 备注：admin 复用 weapp 的 detail()，所以 weapp 端 MatchDetail 类型也间接
> 多了这些字段；但 weapp 仍然主要走 `replay()` 接口，没有视觉上变化。

### admin-web

#### `admin-web/src/types/index.ts`
- 加 `ReplayStatus` type
- `MatchListItem` 加 optional `replayStatus / replayPosterUrl`
- `MatchDetail` 加 optional `replayStatus / replayPosterUrl / replayQrUrl /
  replayGeneratedAt / replayFailedReason`

#### `admin-web/src/api/matches.ts`
- `matchesApi.regeneratePoster(id)` → `POST /admin/matches/:id/poster`

#### `admin-web/src/pages/Matches/Detail.tsx`
- 新增「战报海报」Card：
  - title 含 status Tag（ready / pending / failed / 未生成）
  - extra「重新生成」/「生成海报」按钮（canWrite 才显示），二次确认
  - 海报缩略图 180px + 小程序码 120px，AntImage 支持点击放大预览
  - 失败时展示 failedReason

#### `admin-web/src/pages/Matches/List.tsx`
- 新增「战报」列：
  - ready → 绿 Tag + 海报 URL 直链（新窗口打开）
  - pending → 蓝色 processing Tag
  - failed → 红 Tag
  - state=ended 但无 status → 灰「未生成」
  - 进行中 / 等待中 → 「—」

## 验证
- [x] tsc 干净；admin-web `npm run build` 通过
- [ ] admin 页面：进 Matches/Detail → 看到海报 + 状态 Tag
- [ ] 点「重新生成」→ 二次确认 → 接口返回 → 缩略图刷新
- [ ] 故意 stub server 让海报失败 → admin 详情页看到 failedReason
- [ ] List 页「战报」列 ready 行点击 → 新窗口打开 OSS URL

## 战报系统全部 7 阶段总览

至此 PRD `prd/match-replay.md` 全部 7 个 Phase 落地完毕：

| Phase | commit | 内容 |
|-------|--------|------|
| A | 860866a | 战报视觉重做 + replay endpoint |
| B | 9d46233 | 比赛收尾流三按钮 |
| C-1 | 45d8770 | @napi-rs/canvas 海报生成 + ali-oss + schema migration |
| C-2 | 7f59481 | 微信小程序码 + scene 路由 + by-suffix 反查 |
| C-3 | f04f310 | 前端轮询 + 海报展示 + 重试按钮 |
| C-4 | 628cee6 | /me/stats 战绩聚合 + 我页 stats-card |
| C-5 | 本 commit | admin-web Matches Detail/List 海报集成 |

## 部署清单（按顺序）

1. **server**：
   - `npm install`（拉新依赖 @napi-rs/canvas）
   - `npx prisma migrate deploy`（落地 schema 迁移）
   - 重新构建容器（Dockerfile 已加 font-noto-cjk）
   - 部署 + 重启 → onApplicationBootstrap 自动扫 stale pending（如有）
2. **weapp**：
   - 体验版上传，回归测试一遍核心路径
   - 正式版上线
3. **admin-web**：
   - `npm run build` → 部署静态资源

## 后续 / 已知 TODO

- 「再来一场」placeholder 实装（Phase B 留的）
- 全部战绩详情页（Phase C-4 留的）
- admin 反查其他用户战绩（Phase C-4 留的）
- 旧比赛批量补海报（Phase C-1 留的，admin 一个个 force）
- 真 share-cover 设计稿（兜底用 tabbar logo）

## 关联
- PRD：`prd/match-replay.md`
- 上一阶段：`changelog/2026-06-02-07-replay-phase-c4.md`
- 战报系统全套至此完结
