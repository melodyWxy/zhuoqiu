---
date: 2026-06-02
version: v2.22
title: 战报系统 · Phase B - 比赛收尾流改造
---

# 战报系统 · Phase B - 比赛收尾流改造

## 动机
`prd/match-replay.md` 第 2 阶段。原 OnlineMode 比赛结束 → endedOverlay
3 秒倒计时 → **强制跳「我」页**，用户没有「查看战报」的入口。

改成：弹「查看战报 / 再来一场 / 歇会」三按钮，**用户主动选**下一步。

## PRD / 设计
- `prd/match-replay.md` §2.1（用户旅程）、§5.2（OnlineMode 收尾流）
- 「再来一场」本期 placeholder（按钮可见，点击 toast「敬请期待」），
  完整逻辑下一轮做

## 代码变化

### 联机模式
- `pages/nine-ball/OnlineMode.tsx` `pages/eight-ball/OnlineMode.tsx`：
  - state `null | { countdown: number }` → `null | { done: true }`
  - 触发改成 `setEndedOverlay({ done: true })`
  - 删除 `useEffect` 倒计时整段（含每秒 setTimeout 跳转）
  - 弹窗内容三按钮：
    - **🏆 查看战报**（primary）→ `Taro.navigateTo('/pages/match-detail/index?id=...')`
    - **🔁 再来一场**（secondary）→ toast「敬请期待」（placeholder）
    - **💤 先去歇会**（tertiary）→ `Taro.switchTab('/pages/me/index')`（旧默认）
  - sub 文案 「N 秒后自动退出到"我的"」 → 「记得分享战报给朋友看看」

### 样式
- `pages/nine-ball/index.scss` `pages/eight-ball/index.scss` 同步更新
  `.ended-box` `.ended-btn` 系列：
  - box max-width 320 → 340，按钮改成 stretch（满宽，三档对齐）
  - radius 16 → `var(--radius-lg)`
  - 新增 `.ended-btn-primary / -secondary / -tertiary` 三档变种
  - primary 金色实色、secondary 金色描边、tertiary 透明文本按钮

## 验证
- [x] tsc 无新错（仅 NineBall.ts:281 旧账）
- [x] `npm run build:weapp` 编译通过
- [ ] 真机：联机九球 / 中八打完一局 → 弹三按钮，**不再倒计时**，用户不点
  弹窗永远不消失
- [ ] 点「查看战报」→ navigateTo 到 match-detail 战报页（Phase A 视觉）
- [ ] 点「再来一场」→ toast「敬请期待」，弹窗不关
- [ ] 点「先去歇会」→ switchTab 到「我」页

## 故意保留 / 不做
- 「再来一场」placeholder：完整 prefill 逻辑下一轮做
- match-detail 海报区还是 pending 状态：Phase C-1 接通后端后会变 ready
- 房主 vs 观众的弹窗内容统一，不区分（观众点「再来一场」也只是 toast）

## 关联
- PRD：`prd/match-replay.md`
- 上一阶段：`changelog/2026-06-02-02-replay-phase-a.md`
- 下一阶段：Phase C-1（海报生成后端，server 改 + schema migration）
