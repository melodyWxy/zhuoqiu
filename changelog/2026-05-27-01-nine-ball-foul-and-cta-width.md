---
date: 2026-05-27
version: v2.20.x
title: 九球追分犯规计分修正 + 报名 CTA 按钮拉满
---

# 九球追分犯规计分修正 + 报名 CTA 按钮拉满

## 动机
用户反馈两点：
1. 九球追分点击"犯规"后分数处理不对——犯规者没扣分，违反"总分守恒"的直觉。
2. 赛事详情页底部"立即报名"按钮显得太窄。

## PRD / 设计变化
- `prd/billiards-match-app-prd.md`：
  - §3.1.1.2 起共 7 处把"犯规 +1 给某人"修正为"**犯规者 -1，被补偿方 +1**"，幅度由 `foulCompensation` 决定（默认 1）。
  - 在变更日志补 v1.8.0 行。
- 设计稿无变化（动作面板 / 卡片布局都没动）。
- 用户确认：2026-05-27 当面口述 → AskUserQuestion 二次确认规则为"犯规者 -1，被补偿方 +1"。

## 代码变化
- 修改文件：
  - `billiards-score/src/core/game/NineBall.ts`
    - `handleFoul()`：返回 `[fouler -points, scoreTo +points]`；fouler === scoreTo 时即净零，等价于无效犯规。
  - `server/src/match/state-machine/nine-ball.ts`
    - `case 'foul'`：在原有 `compensateSlot +rules.foulCompensation` 基础上加 `foulerSlot -rules.foulCompensation`；保持"总分守恒"。
  - `billiards-score/src/pages/tournament-detail/index.scss`
    - `.td-btn` 加 `width: 100%; box-sizing: border-box;` + `&::after { border: none }`，治微信小程序里 `<Button>` 默认窄宽，让"立即报名 / 取消报名 / 名额已满 / 不在报名期内"四个 CTA 都拉满 `.td-cta` 容器宽。
- 新增/删除：无。

## 验证步骤
- [ ] 服务端：单测/手测一场三人九球，slot1 犯规、补偿给 slot2 → slot1 -1、slot2 +1，其他 slot 不变；undo 可回退。
- [ ] 客户端（本地模式）：本地三人九球点⚠️犯规，先选犯规者再选 +1 对象，分数同步扣 +。
- [ ] 客户端（联机模式）：选中犯规者点⚠️犯规 → 选补偿对象，前端 toast "已记录犯规"，刷新后两边分数同步变动。
- [ ] 赛事详情页：在 H5 + 微信小程序下打开报名期赛事，底部按钮宽度等于 `.td-cta` 内宽（左右各留 14px padding）；切换到"已报名/已截止/赛事已取消"等态文案居中、不溢出。
- [ ] 其他赛事 / 球房页面无回归。

## 遗留问题 / 已知限制
- 旧 match 的事件流回放：v2.10 之前已记录的 `foul` 事件回放后会让 fouler 多扣一次 1 分。线上没有正式赛，影响仅限本地测试库；如需保留旧行为可在 `applyNineBallEvent` 入参里加版本字段，目前不做。
- `compensateSlot === foulerSlot` 时净零（等价于"假动作"）。UI 没限制选自己，符合"任意人"原始语义。
