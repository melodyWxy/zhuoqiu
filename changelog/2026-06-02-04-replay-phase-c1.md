---
date: 2026-06-02
version: v2.22
title: 战报系统 · Phase C-1 - 海报生成后端
---

# 战报系统 · Phase C-1 - 海报生成后端

## 动机
`prd/match-replay.md` 第 3 阶段。把 Phase A 留下的 `poster.status === 'pending'`
占位接通成真实生成链路：

`比赛结束` → `setImmediate(generate)` → `canvas 绘制 1080×1920 PNG` →
`ali-oss 上传` → `Match.replayPosterUrl 写回` → 前端轮询拿到 URL 渲染。

二维码占位（C-2 接入真小程序码）。

## PRD / 设计
- `prd/match-replay.md` §0（决策结果）、§3（海报模板）、§4（服务端设计）、
  §4.5（重启恢复 / 字体 / 许可 / 公共 OSS）

## Schema 变化

### `prisma/schema.prisma`
- 新增 enum `ReplayStatus { pending, ready, failed }`
- `Match` 加 5 列：
  - `replayStatus`：状态机
  - `replayPosterUrl`：海报 OSS URL
  - `replayQrUrl`：小程序码 OSS URL（C-2 fill）
  - `replayGeneratedAt`：上次成功生成时间（24h 缓存窗口）
  - `replayFailedReason`：失败原因（VARCHAR 500）

### `prisma/migrations/20260602060000_add_match_replay_poster/migration.sql`
- `CREATE TYPE "ReplayStatus"`
- `ALTER TABLE matches ADD COLUMN ...`
- 索引 `(replay_status, ended_at)` 给 on-startup 扫 stale 用

## 代码变化

### server/src/match/replay-narrative.ts （新）
纯函数 `computeNarrative()`：从 detail 抽出 headline/subline/championSlot/type。
拆出的目的：避免 `MatchService` 与 `ReplayJobService` 互相依赖（NestJS 循环
引用）。

### server/src/match/replay-renderer.service.ts （新）
基于 `@napi-rs/canvas` 的 1080×1920 海报模板：
- 顶部：金色高光 + 「🎱 击球帮 · 战报」+ 比赛类型 + 房间码
- 中部：1v1 头像左右对阵（圆形 clip + 冠军金色描边）/ 多人金字塔
- 比分大字 240px / 多人榜首 56px
- 叙事 headline + subline + 🏆 表情
- 二维码区：本期占位灰底「扫码看战报（即将上线）」
- 底部 app 推广

字体策略：
- Linux Alpine 容器：`apk add font-noto-cjk font-noto-emoji` + `fc-cache -f`
- macOS dev：fallback 到 `/System/Library/Fonts/PingFang.ttc`
- 找不到字体时 warning 但不 crash（CJK 文字可能渲染成方块）

### server/src/match/replay-job.service.ts （新）
`@Injectable() implements OnApplicationBootstrap`：
- `generate(matchId, opts)`：拉 replay → render → OSS upload → 写回。
  失败重试 3 次（指数退避），最终落 `replayStatus=failed`
- `generateSafe()`：fire-and-forget 包装，不抛异常，给 setImmediate 用
- `onApplicationBootstrap` → `recoverStale()` 扫 `endedAt < now-5min` 但
  仍 pending 的 match，重新入队（cover 进程崩溃 / 部署重启场景）
- 幂等：24h 内已 `ready` 直接复用；`force=true` 跳过缓存

### server/src/match/match.service.ts
- 注入 `ReplayJobService`（forwardRef 解循环）
- `endByOwner` / `forceEndByAdmin` 事务提交后 `setImmediate(generateSafe)`
- `replay()` 重写：用 `computeNarrative` 替换 inline 逻辑；poster 字段从
  Match 表读 `replayStatus / replayPosterUrl / replayQrUrl / replayFailedReason`

### server/src/match/match.module.ts
- `imports: [AuthModule, UploadModule]`
- `providers: [MatchService, ReplayRendererService, ReplayJobService]`
- `exports: [MatchService, ReplayJobService]`

### server/src/admin/matches-admin-write.controller.ts
- 注入 `ReplayJobService`
- 新增 `POST /admin/matches/:id/poster`：admin 强制重生成，audit 落库

### server/Dockerfile
- runner stage `apk add fontconfig font-noto-cjk font-noto-emoji`
- `fc-cache -f` 预热字体缓存
- 镜像增重约 +100MB（CJK 字体）

### server/package.json
- `dependencies` 加 `@napi-rs/canvas ^1.0.0`（N-API 预编译，无需 native build）

## 部署 / 上线步骤

1. server 容器 rebuild（Dockerfile 改了 → `docker compose build server`）
2. 跑 migration：`npx prisma migrate deploy`
3. 重启 server
4. on-startup 自动 recover：扫超时 pending（理论上是 0 个，因为之前没这字段）

旧比赛（迁移前已结束的）`replayStatus IS NULL`，`replay()` 接口会返回
`status: 'pending'` 默认值。如想给历史比赛补海报，admin 调
`POST /admin/matches/:id/poster` 一个个 force 重生成；批量补不在本期范围。

## 验证
- [x] `npm run build` server 编译通过
- [x] tsc 无新错
- [ ] 手动测试：本机 dev 起 server → 创建并结束一场比赛 → server 日志看到
  `poster ready` → DB Match.replay_poster_url 有 OSS URL → 浏览器打开 URL
  看到海报 PNG
- [ ] 1v1 / 多人 两种场景视觉都正确
- [ ] 头像是 OSS URL 时圆形头像渲染；emoji 头像也能渲染
- [ ] 故意把 OSS 配错 → generate 失败 3 次后 status=failed，DB 有
  failedReason
- [ ] 容器内 CJK 文字渲染正常（不是方块）

## 故意保留 / 未做
- **二维码区是占位**：「扫码看战报（即将上线）」灰底；C-2 接入 wxacode 后
  替换成真小程序码
- **批量补历史**：旧比赛要海报需 admin 手动 force；不在本期
- **海报缓存清理**：24h 后理论上还能复用，永不清理；OSS 容量按 200KB/张
  估算可控

## 关联
- PRD：`prd/match-replay.md`
- 上一阶段：`changelog/2026-06-02-03-replay-phase-b.md`
- 下一阶段：Phase C-2（小程序码集成 + scene 路由）
