---
date: 2026-05-27
version: v2.20.x
title: 修复弹窗输入框被 padding 遮挡的回归
---

# 修复弹窗输入框被 padding 遮挡的回归

## 动机
用户反馈：上一版（changelog #08）为「输入框加高 60%–100%」把 `.input-modal-field` / `.login-sheet-field` 的 padding 改成 `20px 14px` / `22px 14px` 后，小程序里输入框看上去几乎敲不进字。

定位：weapp `<Input>` 组件高度不会被 padding 撑开（与 HTML `<input>` 不同），导致大幅竖向 padding 直接把文本可视区挤没。

## PRD / 设计变化
无（视觉目标——输入框比默认高一点——保留；仅切换实现手段）。

## 代码变化

### 客户端
- `billiards-score/src/components/InputModal/index.scss`：`.input-modal-field` 从 `padding: 20px 14px` 改为 `height: 48px; padding: 0 14px`。
- `billiards-score/src/components/LoginSheet/index.scss`：`.login-sheet-field` 从 `padding: 22px 14px` 改为 `height: 48px; padding: 0 14px`（BindPhoneSheet 共用此 class，连带修复）。

### 排查范围
全量扫描 `<Input>` 用法对应 class，确认其余历史输入框（`.va-field` / `.code-input` / `.input-field` / `.custom-input` / `.rule-input` / `.vp-search-input` / `.vl-field`）竖向 padding ≤ 16px 且长期生产无反馈，未受影响；本次不动。

### 服务端
无改动。

## 验证步骤
- [ ] `npm run build:weapp:prod` 构建通过
- [ ] 改昵称弹窗：能正常输入、光标可见、文本不被截
- [ ] 登录 sheet：手机号 / 验证码两栏同上
- [ ] BindPhoneSheet「使用其他手机号」分支：手机号 / 验证码两栏同上
- [ ] 视觉高度仍比 4.x 默认 Input 高（48px 目测约比默认高 ~50%）

## 上线必做
- 客户端：`npm run build:weapp:prod` 重打包，开发者工具上传
- 服务端：无

## 遗留问题 / 已知限制
- 后续若再要调输入框高度，统一通过 `height` 调，别动竖向 padding。
