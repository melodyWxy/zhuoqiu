---
date: 2026-06-10
version: v2.22
title: 联机体验优化 - 已在房间直接进 + 犯规补偿排除本人
---

# 联机体验优化 - 已在房间直接进 + 犯规补偿排除本人

## 1. 点房间分享卡片:已在房间内的人直接进房
现状:点对战房间分享卡片,落到加入页,仍展示"选空位 / 以观众加入"。
期望:如果我本来就在这个房间(在座选手),直接进房间。

改动 `billiards-score/src/pages/join/index.tsx handlePreview`:
- 拉到房间 detail 后,若当前登录用户已是该房间的在座选手
  (`m.players.some(p => p.isCurrent && p.userId === cloudUser.id)`)且房间未结束,
  直接 `redirectTo` 对应联机页(`?matchId=&role=player`),跳过选位/观众 UI。
- 未登录 / 不在座 / 已结束 → 仍走原预览流程。

## 2. 计分目标排除操作者本人
现状:操作某选手的普胜/大金/犯规等,目标可选到他自己。
- 排查:普胜/小金的"掏谁"(`pickTarget`)**本就排除了 winner 自己**;大金/黄金9 无目标选择。
  真正包含自己的是**犯规**:`handleFoul` 的"给谁 +1"补偿列表用了 `players.map`,含犯规者本人。

改动 `billiards-score/src/pages/nine-ball/OnlineMode.tsx handleFoul`:
- 补偿对象 `targets = players.filter(p => p.slot !== fouler)`,ActionSheet 与
  `compensateSlot` / 记后选中都改用 `targets`,不再能给犯规者自己 +1。

## 验证
- weapp `build:weapp:prod` 通过。
- 真机:① 自己在房间内时点分享卡 → 直接进房;② 犯规补偿列表不再出现犯规者本人。

## 部署
- 纯 weapp 改动,重打 dist 上传即可。

## 关联
- 上一篇:`changelog/2026-06-09-01-ws-token-refresh-reconnect.md`
