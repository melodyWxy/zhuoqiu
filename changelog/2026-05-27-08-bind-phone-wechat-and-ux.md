---
date: 2026-05-27
version: v2.20.x
title: 绑手机优先走微信授权 + 「我」页绑定按钮 + 弹窗输入框加高
---

# 绑手机优先走微信授权 + 「我」页绑定按钮 + 弹窗输入框加高

## 动机
用户反馈三点（口述原话）：
1. 小程序端如果未通过手机授权（首次登录点了「稍后绑定」），后面再绑手机时仍应该走「微信授权」一键拿手机号，而不是让用户输手机号 + SMS。
2. 未绑定手机号时，「我」页身份卡里那行 `📱 未绑定手机号` 看着只是文案，期望后面跟一个「去绑定」按钮入口（不要再藏在右上角 ⋯ 菜单里）。
3. 改昵称弹窗（`InputModal`）以及登录/绑定 sheet（`LoginSheet` / `BindPhoneSheet`）里的输入框高度太小，整体偏挤；要求增大 60%–100%。

## PRD / 设计变化
- `prd/legal-mvp.md` §3.1.2 wechat_phone 收尾段：原文「『稍后绑定』走 finishLogin —— 用户可在「我」页面通过 BindPhoneSheet（短信验证码）补绑」改为：
  - **小程序**：补绑首屏直接复用 wechat_phone 步骤的 `getPhoneNumber` 按钮 → POST `/auth/wechat/phone`，一键完成；同步保留「使用其他手机号」次按钮，落到原 SMS 流程做兜底（兼容用户想用与微信不同的手机号）。
  - **H5**：与之前一致，只能走 SMS 流程。

## 代码变化

### 客户端
- `billiards-score/src/components/BindPhoneSheet/index.tsx`：
  - 新增 `wechat_auth` step。`visible` 翻 true 时若 `isWeapp()` 起手停在该 step；H5 直接进 `input_phone`。
  - `wechat_auth` step UI：标题「绑定微信手机号」+ 主按钮 `<Button open-type="getPhoneNumber">` → `authApi.wechatBindPhone(code)` → 写回 `setUser` → 关闭 + `onSuccess`；次按钮「使用其他手机号」→ 落 `input_phone`；底按钮「取消」。
  - `getPhoneNumber` 失败时 toast，不切 step；后端冲突（手机号属另一账号）走原合并流程时，会复用现有 `conflict_confirm` 逻辑——SMS 兜底路径不变。
- `billiards-score/src/pages/me/index.tsx`：
  - 身份卡里把 `📱 未绑定手机号` 那行从纯 `<Text>` 改成 `View.identity-meta-row`，文本旁加 `View.identity-bind-btn` 「去绑定 →」点击 `setBindPhoneSheetOpen(true)`。
  - 已绑手机号时仍渲染原 `📱 13****xxxx` 单行，无按钮。
  - `⋯` 菜单里「📱 绑定手机号」保留（属备用入口；用户主动从手机号那行进入是首选）。
- `billiards-score/src/pages/me/index.scss`：加 `.identity-meta-row` / `.identity-bind-btn` 样式。
- `billiards-score/src/components/InputModal/index.scss`：`.input-modal-field` padding `12px 14px` → `20px 14px`（高度 ≈ +66%）。
- `billiards-score/src/components/LoginSheet/index.scss`：`.login-sheet-field` padding `14px` → `22px 14px`（高度 ≈ +57%，与 InputModal 视觉同档）。BindPhoneSheet 共享同一 scss，连带生效。

### 服务端
无改动 —— `/auth/wechat/phone` 已存在且接受任意已登录用户的手机号绑定；BindPhoneSheet 复用即可。

## 验证步骤
- [ ] `npx tsc --noEmit`（billiards-score）通过
- [ ] 小程序端：登录但未绑手机 → 进「我」页，身份卡手机号那行后看到「去绑定 →」按钮 → 点开 → 弹出 sheet 首屏「微信授权手机号」 → 点 → 一键绑定成功
- [ ] 小程序端：在 `wechat_auth` 步点「使用其他手机号」→ 落 `input_phone` → 走原 SMS 流程
- [ ] H5：「我」页同样有「去绑定 →」按钮，但 sheet 起手就是 `input_phone`（无微信授权）
- [ ] 改昵称 / 输手机号 / 输验证码三处输入框肉眼明显比之前高

## 上线必做
- 客户端：`docker compose up -d --build h5`（小程序：`npm run build:weapp:prod` 重打包）
- 服务端：无改动

## 遗留问题 / 已知限制
- `getPhoneNumber` 在小程序非生产环境（如 IDE 模拟器）通常拿不到真实 code，会落 mock；这与 LoginSheet 现有行为一致，不属于本次改动范围。
- 「使用其他手机号」流程仍然涉及 SMS 验证码兜底；如果未来彻底废弃 SMS 通道，再单独改。
