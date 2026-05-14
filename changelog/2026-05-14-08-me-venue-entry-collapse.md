---
date: 2026-05-14
version: v2.20.x
title: 我的页"切换到球房管理模式"收进右上角 ⋯ 菜单
---

# 我的页"切换到球房管理模式"收进右上角 ⋯ 菜单

## 动机

v2.10 把"🏢 切换到球房管理模式"做成了占半屏的金色大卡，对 90% 的普通玩家是噪音 ——
他们只是来记个分，根本不需要商家入口。

v2.20 按 "对大多数玩家友好" 原则收敛视觉：

- **未登录商家态**（绝大多数用户）：页面右上角一个 `⋯` 小圆按钮，点开原生 ActionSheet，
  里面一项「🏢 切换到球房管理模式」。玩家平时察觉不到，想切换的老板一秒就能找到。
- **已登录商家态**（`venueSession` 存在）：保留现有金色大卡（商家名 + 「查看球房状态 →」按钮），
  方便管理视图快速回跳。⋯ 按钮此时不渲染（无其他菜单项可放）。

## PRD / 设计变化

- `prd/billiards-match-app-prd-v2.10.md` §1.3 加了 "v2.20 视觉收敛" 小节，明确两种态的呈现方式。
- 无视觉稿改动（改动很轻，文字 + 原生 ActionSheet）。

## 代码变化

- 修改文件：
  - `billiards-score/src/pages/me/index.tsx`
    - 新增 `openMoreMenu`：收集可选菜单项 → `Taro.showActionSheet` 弹出 → 点击跳转。
    - 顶部条件渲染 `.me-topbar > .me-more-btn`（仅 `!venueSession` 显示）。
    - 删除"未登录商家"分支下的 `venue-mode-card`；`venueSession` 分支的大卡原样保留。
  - `billiards-score/src/pages/me/index.scss`
    - 新增 `.me-topbar` / `.me-more-btn` / `.me-more-btn-hover` 样式。
    - `.venue-mode-card` 及子类样式保留（已登录商家态仍在用）。

- 新增文件：无
- 删除文件：无

## 验证步骤

- [ ] `npm run build:weapp:prod` 通过
- [ ] 未登录商家（默认态）：我的页顶部右上角出现 `⋯` 按钮；点击弹出原生 ActionSheet，
      含一项「🏢 切换到球房管理模式」；点击跳到 `/pages/venue-login/index`。
- [ ] 未登录商家：我的页主体不再有金色大卡。
- [ ] 商家登录后（venueSession 存在）：`⋯` 按钮隐藏；金色大卡保留，显示商家名 + 「查看球房状态 →」。
- [ ] H5 端同样行为（ActionSheet 在 H5 下是 Taro 提供的样式，不影响功能）。

## 已知 trade-off / 遗留

- ⋯ 按钮当前只有一项菜单，视觉上有点"为一个入口做一个菜单"。后续如果有新的少用功能（切换语言、导出
  战绩等），塞进同一个菜单即可，这个脚手架已经搭好。
- 已登录商家态的大卡仍是金色渐变 —— 那张卡**对商家本人**就是核心入口，值得抢眼，保留。
