---
date: 2026-06-08
version: v2.22
title: 修复赛程「对手未产生时被误判轮空获胜」
---

# 修复赛程「对手未产生时被误判轮空获胜」

## 动机（user 反馈）

球房后台操作赛事时，若上一轮有的对阵已结束、有的还没结束，下一轮那场只填进了
**一名**选手（另一侧的对手还在上一轮没打完），此时却能直接对这场判负 → 把"还没产生
的对手"当成轮空，让已就位的一方轮空获胜。期望：对手未产生前禁用该场的判负 / 轮空。

## 根因

- admin `BracketMatchCard.clickable` 把 `pending && (playerA || playerB)` 也算可点；
  `BracketActionModal.canWalkover` 用 `playerA || playerB`（或），只要一方在就允许判负。
- 服务端 `bracket.service.manualWalkover` 允许 `pending` 且只校验**胜方**就位，没校验对手。

真正的轮空（首轮没对手）是生成时自动 walkover 处理的，从不走手动判负；手动判负只用于
"双方都在、一方弃权"。所以问题就是少了"对手已产生"这道校验。

## 改动

- `server/src/venue/bracket.service.ts manualWalkover`：新增对手就位校验，对手为空时报
  「对手尚未产生（上一轮还没打完），暂不能判负 / 轮空」（**服务端权威拦截**）。
- `admin-web/.../TournamentDetail.tsx`：
  - `canWalkover` 改为要求 `playerA && playerB` 同时就位。
  - `BracketMatchCard.clickable` 去掉 `pending` 可点分支（等待中的对阵不可操作；也顺带挡住
    未激活的决胜局空壳）。

单败 / 双败都适用（双败里同理：一侧 slot 已就位、另一侧还没到时不可判负）。

## 验证
- server `nest build` + admin-web `tsc -b && vite build` 通过。

## 关联
- 同日：`changelog/2026-06-08-01-double-elimination.md`
