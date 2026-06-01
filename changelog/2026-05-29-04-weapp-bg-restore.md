---
date: 2026-05-29
version: v2.20
title: 小程序整页背景色丢失修复
---

# 小程序整页背景色丢失修复

## 动机
用户原话：
> 小程序的背景色怎么没了。
> 之前改 h5 背景色的时候把小程序的改没了。小程序的全局要用 `page { }`。
> 你可以在 global 那里 `page, body {}` 这样两者都生效。

`2026-05-28-01-ui-contrast-polish.md` 修 H5 整页白底时，把 CSS 变量从只挂
`page` 改成了 `page, :root` 双挂，但同时把 weapp 的背景规则单独留在
`page { background-color: var(--bg-dark); ... }` 里 —— 实测在小程序基础库
里这套写法不稳定，weapp 渲染时背景没生效（可能与 var() 在同一选择器
先定义后引用的解析顺序有关）。

## 代码变化
`billiards-score/src/styles/global.scss`：
- 把 weapp `page { ... }` 与 H5 `html, body { ... }` 两条背景规则合并成
  `page, body { background-color, color }`，weapp 命中 `page`、H5 命中
  `body`，互不干扰。
- weapp 独占的 `min-height / font-size / -webkit-text-size-adjust` 留在
  独立的 `page { }` 规则里。
- `html { background-color }` 单留兜底，防 body 高度不足露白。

CSS 变量入口 `page, :root { --primary: ... }` 不动（保持 H5 + weapp 都能拿到色板）。

## 验证步骤
- [x] watch 自动重编译，`dist/app-origin.wxss` 看到新规则生效
- [ ] 微信开发者工具刷新 → 整页恢复深绿底色
- [ ] H5 (`npm run dev:h5`) 回归：背景仍然深色

## 遗留问题 / 已知限制
- 后续若发现 weapp 仍旧不显示底色，最稳的兜底是改成字面量 `#0a0f0d`
  写死在 `page { background-color: ... }` 里，放弃 var() 中转。本次先
  保留 var()，依赖合并选择器策略。
