---
date: 2026-06-08
version: v2.22
title: 赛事赛程支持双败淘汰（double elimination）
---

# 赛事赛程支持双败淘汰（double elimination）

## 动机

球房后台创建赛程此前只支持单败淘汰（`startTournament` 硬卡 `single_elim`，
`TournamentForm` 里 `double_elim` 是 disabled）。本期支持**标准双败 + 任意人数**：

- 标准双败，含 grand final「决胜局（bracket reset）」：WB 冠军一路未负，LB 冠军
  赢一场后需再打一场决胜局才决出总冠军（总决赛最多 2 场）。
- 任意报名人数，非 2^k 用 BYE 补齐（同单败）；双败至少 3 人。

设计/规则见 `prd/billiards-match-app-prd-v2.10.md` §4.2「双败淘汰」。

## 核心设计：显式 next-match 指针

LB 败者下沉无法用单败的 `floor(slot/2)` 闭式表达，改为**生成时把整张图的指针物化**：

- `TournamentBracketMatch` 新增 `bracketGroup`(winners/losers/grand_final) +
  `winnerToMatchId/winnerToSlot` + `loserToMatchId/loserToSlot` +
  `slotASettled/slotBSettled`；唯一约束扩成 `(tournamentId, bracketGroup, round, slotInRound)`。
- 推进统一为「跟指针」：winner→winnerTo、loser→loserTo（都空=真淘汰）；BYE 注入 null
  自动连锁晋级；决胜局空壳预生成、推进期条件激活。
- **消除了历史上三份重复的 floor 推进**（其中 `match.service.ts` 内联那份才是
  match-end 的真实生产路径）。存量进行中的单败（指针为空）回退 legacy floor，行为不变。

## 改动

### server
- `prisma/schema.prisma`：`BracketGroup`/`BracketSlot` 枚举 + 7 列 + 四元组 unique + 索引。
  迁移 `prisma/migrations/20260605120000_add_double_elim_bracket`（纯 ADD COLUMN + 改索引，
  存量单败零破坏；entrypoint 的 `prisma migrate deploy` 自动应用）。
- `src/venue/bracket-utils.ts`：新增 `planDoubleElim(n)`（纯函数，WB 复用 `planBracket`，
  LB 2(k-1) 轮 minor/major 交替，WB 败者 cross/reverse 下沉，GF + reset 空壳）。
- `src/venue/bracket-advance.ts`（新建）：统一推进 `advanceFromCompletedMatch`
  （跟指针 + BYE 连锁 + GF/决胜局特判 + 单败 legacy 回退 + 幂等 + 防环）。
- `src/venue/tournament.service.ts`：`startTournament` 解锁双败 → `genDoubleElimBracket`
  物化指针；`getBracket` 按 `bracketGroup` 分组返回 `winners/losers/grandFinal`，
  保留旧 `rounds`(=胜者组)向后兼容，过滤未激活的决胜局空壳，新增 `format`。
- 接线：`bracket-resolve.ts` / `bracket.service.ts` / `match.service.ts doEnd` 三处
  统一改调 `advanceFromCompletedMatch`；删掉 match.service 的内联 floor 块、bracket.service
  的 `advanceWinnerToNextRound`/`maybeCompleteTournament`/回调类型。

### admin-web
- `api/venue.ts`：`BracketMatchItem` 加 `bracketGroup`；`BracketTree` 加 `winners/losers/grandFinal/format`。
- `TournamentForm.tsx`：放开 `double_elim`（去掉 disabled）。
- `TournamentDetail.tsx`：`BracketView` 双败渲染「🏆 胜者组 / 🥈 败者组 / 👑 总决赛」三段
  （单败保持原单段视图，复用 `BracketMatchCard` 与开赛/判负 Modal）。

## 验证

- `scripts/bracket-check.ts`：生成器断言（n=4/5/6/8/16 节点数、指针连通性、8 人黄金下沉表、reset）。全绿。
- `scripts/bracket-advance-check.ts`：内存 fake-tx 推进（BYE 连锁、LB 落位、GF 两分支、
  决胜局、幂等、单败 legacy 回归）。全绿。
- `scripts/bracket-db-smoke.ts`：本地 dev 库真实物化 + 打完 6 人双败 → completed、冠军正确、
  winners7/losers6/grandFinal2，用完清理。全绿。
- `nest build` + admin-web `tsc -b && vite build` 均通过。

## 部署

- server **重新 build 镜像**（entrypoint 自动 `prisma migrate deploy` 应用新迁移）+ 重启。
- admin-web 重新构建。
- 单败完全向后兼容，无需迁移数据。

## 关联
- PRD：`prd/billiards-match-app-prd-v2.10.md` §4.2
- 上一篇：`changelog/2026-06-04-02-podium-rank-revert-and-regions-diag.md`
