---
date: 2026-05-14
version: v2.20.x
title: tabBar 图标 SVG → PNG（weapp 不识别 svg）
---

# tabBar 图标 SVG → PNG（weapp 不识别 svg）

## 动机

`app.config.ts` 的 `tabBar.iconPath` 引用了 svg，微信小程序官方只接受 PNG / JPG，编译后真机 / 开发者工具里 tab 图标空白。

## PRD / 设计变化

- 对应 `prd/weapp-adaptation.md` §1。

## 代码变化

- 新增文件：
  - `billiards-score/src/assets/tabs/home.png`（162×162 PNG-32，2.4KB）
  - `billiards-score/src/assets/tabs/home-active.png`（金色高亮，2.6KB）
  - `billiards-score/src/assets/tabs/me.png`（4.6KB）
  - `billiards-score/src/assets/tabs/me-active.png`（4.6KB）
- 修改文件：
  - `billiards-score/src/app.config.ts`：4 处 `assets/tabs/*.svg` → `*.png`
- 删除文件：
  - `billiards-score/src/assets/tabs/home.svg`
  - `billiards-score/src/assets/tabs/home-active.svg`
  - `billiards-score/src/assets/tabs/me.svg`
  - `billiards-score/src/assets/tabs/me-active.svg`

PNG 由原 svg 经 Chrome headless 渲染（162×162 透明背景）生成，描边色保持原 `#a0a8a4` / `#d4af37`。

## 验证步骤

- [ ] 编译通过（`npm run build:weapp:prod`）
- [ ] 微信开发者工具：tabBar 4 个图标正常显示，active 切换时颜色由灰变金
- [ ] H5 端 `/`、`/me` 切换正常无回归
- [ ] `src/assets/tabs/` 目录无 svg 残留

## 遗留问题 / 已知限制

无。后续如果业务页面内部要用矢量图，再单独评估字体图标 / 双源 fallback。
