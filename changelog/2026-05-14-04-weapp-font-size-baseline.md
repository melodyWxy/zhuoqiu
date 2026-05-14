---
date: 2026-05-14
version: v2.20.x
title: 字号兜底 + 禁用 webview 自动放大（治偶发整页缩放）
---

# 字号兜底 + 禁用 webview 自动放大（治偶发整页缩放）

## 动机

weapp / h5 偶发"整页被缩放"，根因候选：
1. 业务样式没有显式 `page` 字号基准，宿主默认 16px 在不同设备/webview 上有偏差；
2. iOS Safari、部分安卓 webview 的「文字自动放大」行为，会在系统字号偏好开启时把 H5 整体放大。

第一步先做兜底治理，不动 designWidth；观察期收集真机数据再决定是否做大手术。

## PRD / 设计变化

- 对应 `prd/weapp-adaptation.md` §3。
- `docs/01-客户端说明文档.md` §6.1 新增「字号约定」小节，写进项目规约。

## 代码变化

- 新增文件：无
- 修改文件：
  - `billiards-score/src/styles/global.scss`：`page` 选择器内追加：
    - `font-size: 32rpx;`（750 设计基准下的 16px 等价）
    - `-webkit-text-size-adjust: 100%; text-size-adjust: 100%;`
  - `docs/01-客户端说明文档.md`：新增 §6.1 字号约定（业务统一写 px，由 pxtransform 处理；禁止 `html{font-size}` / `body{zoom}` / 手写 rpx / rem）。
- 删除文件：无

## 验证步骤

- [ ] weapp 开发者工具：iPhone 13 / iPhone SE / Pixel 三档预览，字号视觉一致（不缩放）
- [ ] H5：iOS Safari 系统设置「加大字体」开到最大，页面文字不再整体放大
- [ ] 现有页面 `font-size: Npx` 写法无视觉回归
- [ ] grep 确认无 `html { font-size`、`body { zoom`、`rem;` 出现

## 遗留问题 / 已知限制

- 第二步（真机截图采集 + 评估是否切 designWidth 750 全量 rpx）放观察期，不在本次。
- 引入第三方组件库（NutUI 等）后，可能要给 pxtransform 加 `selectorBlackList`。
