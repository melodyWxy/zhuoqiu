---
date: 2026-06-02
version: v2.22
title: 战报系统 · Phase A - 视觉重做 + replay endpoint
---

# 战报系统 · Phase A - 视觉重做 + replay endpoint

## 动机
`prd/match-replay.md` 第 1 阶段。把原来「事件日志 dump」风的 match-detail
彻底改成战报体验，作为 C 档全套（海报 + 收尾流 + 战绩）的视觉打底。

本期不接海报，海报区先用 `LoadingState` 占位（始终 pending），但前端代码
路径已经走 `replay` 接口的 `poster.status`，C-1/C-3 接通海报后端后无缝
切换。

## PRD / 设计
- `prd/match-replay.md` §0、§4.5、§5、§7
- 决策已 user gate 完成，本阶段无新决策

## 代码变化

### 后端
- `server/src/match/match.service.ts` 新增 `replay(matchIdOrCode)` 方法：
  - 复用 `detail()`
  - 计算 `narrative.headline`：
    - 1v1 → `"张三 7:5 击败李四"`
    - 多人 → `"张三 拿下第一"`
  - 计算 `narrative.subline`：`"时长 23 分钟 · 黄金 9 ×1"` 这种
  - `poster.status` 暂返回 `'pending'`，C-1 之后接 OSS URL
- `server/src/match/match.controller.ts` 新增 `GET /matches/:idOrCode/replay`
  公开接口（matchId 长哈希，分享给陌生人能打开是基本诉求）

### 前端 weapp
- `core/api/match.ts`：
  - 加 `ReplayResponse` 类型
  - 加 `matchApi.replay(idOrCode)` 调用
- `pages/match-detail/index.tsx` 整页改写：
  - 海报区（`md-poster-card`）：pending → LoadingState；ready → `<Image>` +
    点击 `previewImage`；failed → 占位
  - 标题卡：金色渐变背景，叙事文案（headline + subline）+ 比赛类型 + 时间
  - 玩家比分卡：每人头像 + 昵称 + 详细统计 chips；冠军行 `is-champion`
    （金色昵称 + 大字比分 + 🏆 角标）
  - 元信息卡：时长 / 击球次数 / 撤销次数
  - 完整事件日志：默认折叠，点开看；payload JSON 调试遗留**移除**
  - floating 「📤 分享战报」按钮：底部 fixed，金色实色，触发原生分享
- `pages/match-detail/index.scss` 整体重写
- `utils/share.ts`：`TournamentLite.name` → `.title`（顺手修一个 share commit
  里漏的字段名 typo —— server 端字段是 `title`）
- `pages/tournament-detail/index.tsx`：调用处同步 `t.title`

## 验证
- [x] tsc 无新增错误（仅 NineBall.ts:281 旧账）
- [x] `npm run build:weapp` 编译通过
- [ ] H5 / weapp 真机：进战报页 → 标题 / 比分 / 玩家头像 / 冠军徽章 全部正确
- [ ] 海报区目前固定显示 LoadingState「正在生成战报海报」（Phase A 预期）
- [ ] 「查看完整记录」折叠 → 展开 → 收起，事件列表正常
- [ ] 底部 floating「分享战报」按钮可点，触发右上角分享菜单

## 故意保留 / 不动
- 海报始终 pending：本期不接，C-1 之后真生成
- 「再来一场」按钮还没出现：在 Phase B 动 OnlineMode 时一起做
- 「我」页比赛历史的入口走法不变（路径不变）

## 已知 warning（与本期无关）
- `mini-css-extract-plugin` 报 `LoadingState/index.scss` 与 `EmptyState/index.scss`
  在 common chunk 里的顺序冲突 —— 是刀 D 留下的，本期不修

## 关联
- PRD：`prd/match-replay.md`
- 上一篇 PRD：`prd/share.md`
- 下一阶段：Phase B（OnlineMode 收尾流三按钮）
