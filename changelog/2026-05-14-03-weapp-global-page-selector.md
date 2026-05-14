---
date: 2026-05-14
version: v2.20.x
title: global.scss `:root` → `page`（weapp 全局变量丢失）
---

# global.scss `:root` → `page`（weapp 全局变量丢失）

## 动机

`styles/global.scss` 用 `:root { --primary: …; }` 声明 CSS 变量。微信小程序的 wxss 没有 HTML 文档，`:root` 选择器不生效，所有 `var(--primary)` 在 weapp 端拿到 fallback / 空值，全局深绿底色丢失。

用户已在本地实测：把 `:root` 改成 `page`，weapp 预览全局样式恢复正常。

## PRD / 设计变化

- 对应 `prd/weapp-adaptation.md` §2。

## 代码变化

- 新增文件：无
- 修改文件：
  - `billiards-score/src/styles/global.scss`：把 `:root { … }` 与已有的 `page { background-color … }` 合并到同一个 `page` 块；CSS 变量声明全部搬进去。
- 删除文件：无

H5 端 `page` 同样合法（Taro h5 把 page 编译成根容器），CSS 变量沿 DOM 树继承，不影响子节点使用 `var(--primary)`。

## 验证步骤

- [ ] weapp 开发者工具：首页 / `/me` 等页面背景色为深色（`#0a0f0d`），不是默认白底
- [ ] H5 同上无回归
- [ ] DevTools 检查 `var(--primary)` 在两端都解析到 `#1a2f23`

## 遗留问题 / 已知限制

无。
