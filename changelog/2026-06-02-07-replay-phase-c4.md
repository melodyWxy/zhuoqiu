---
date: 2026-06-02
version: v2.22
title: 战报系统 · Phase C-4 - 战绩接口 + 我页模块
---

# 战报系统 · Phase C-4 - 战绩接口 + 我页模块

## 动机
`prd/match-replay.md` 第 6 阶段。打了 100 场和 1 场对用户来说没区别，需要
给登录用户一个累计战绩可见的入口。

## PRD / 设计
- `prd/match-replay.md` §2.5（我页累计战绩）、§4.4（战绩聚合实现）

## 代码变化

### server

#### `server/src/match/match.service.ts`
- 新增 `myStats(userId)`：
  - 拉用户参与的所有 ended match
  - 每场走 `detailFromTx` 拿 computed
  - 聚合：总场数 / 胜场 / 胜率 / 九球累计黄金9/大金/小金/普胜/最高分 / 中八累计胜局
  - 最近 5 场摘要：opponent / 比分 / endedAt / isWin
- 性能：单用户 < 1000 场 < 100ms；超过再考虑预聚合表

#### `server/src/match/match.controller.ts`
- 新增 `GET /me/stats`（`@UseGuards(UserAuthGuard)`，仅自己看自己的）

### weapp

#### `billiards-score/src/core/api/match.ts`
- 加 `MyStats` 类型 + `matchApi.myStats()` 调用
- 顺手修一个 trailing comma 漏掉的 syntax error（Phase C-2 加 byIdSuffix
  时引入）

#### `billiards-score/src/pages/me/index.tsx`
- 新增 state `stats: MyStats | null`
- `loadStats()` + 在 `useEffect cloudUser change` / `useDidShow` 中调用
- 未登录态 / 0 场比赛时不显示卡片（避免空状态打扰）
- 卡片结构：
  - 顶栏：📊 战绩 + 胜率
  - 第二行：出场 / 胜场 / 九球最高分（三个大数字 cell）
  - 九球累计：金黄 chips（黄金9 / 大金 / 小金 / 普胜，0 的不显示）
  - 中八累计：「打了 N 场，赢 X 场，累计胜局 Y」一行

#### `billiards-score/src/pages/me/index.scss`
- 新增 `.stats-card` `.stats-header` `.stats-summary-row` `.stats-cell`
  `.stats-num` `.stats-detail` `.stats-chip` 等

## 验证
- [x] tsc 干净；server / weapp 都 build 通过
- [ ] 真机：登录 + 至少打过 1 场 → 我页出现 stats-card
- [ ] 未登录 / 0 场 → 不显示
- [ ] 数字与实际比赛吻合（出场 / 胜场 / 单场最高分）
- [ ] 九球只打过 → 不显示中八区段
- [ ] 中八只打过 → 不显示九球区段

## 故意保留 / 未做
- **「全部战绩」详情页**：本期只在我页显示概要；点 stats-card 不跳，
  下一轮做
- **admin 反查其他用户战绩**：留 TODO，本期不做
- **预聚合表 user_stats**：单用户 < 1000 场不需要；以后量大再说
- **最近 5 场列表 UI**：API 已返回，但本期不在我页显示（避免与「历史记录」
  section 重复）

## 关联
- PRD：`prd/match-replay.md`
- 上一阶段：`changelog/2026-06-02-06-replay-phase-c3.md`
- 下一阶段（最后）：Phase C-5（admin-web 集成）
