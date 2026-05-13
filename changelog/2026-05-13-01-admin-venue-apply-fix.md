---
date: 2026-05-13
version: v2.20.0-alpha.5
title: v2.20 · 修复 admin-web「申请球房入驻」按钮误跳转
---

# v2.20：修复 admin-web「申请球房入驻」按钮误跳转

## Bug

在 [admin-web/src/pages/VenueMerchant/VenueLogin.tsx](../admin-web/src/pages/VenueMerchant/VenueLogin.tsx)，
未登录状态下点击「🎱 申请球房入驻」按钮会导致页面看起来像"刷新"。

**根因链路**：

1. `VenueLogin` 点击按钮 → `navigate('/apply')`
2. `Apply` 页面挂载 → useEffect 检查 `accessToken` 不存在
3. `navigate('/venue-login', { replace: true })` 把用户踢回登录页
4. 用户感知：点了按钮后页面好像"刷新了一下"

## 分析

admin-web 登录成功的逻辑已经是对的（见
[VenueLogin.tsx:60-64](../admin-web/src/pages/VenueMerchant/VenueLogin.tsx#L60-L64)）：
手机号+验证码登录后，有 venue 的跳 overview，没 venue 的自动跳 apply。

下方那个「申请球房入驻」独立按钮实际是多余的——误导用户以为要单独点击
才能开始申请流程，结果反而陷入死循环。

C 端 [billiards-score/src/pages/venue-login/index.tsx](../billiards-score/src/pages/venue-login/index.tsx)
的同名按钮行为本来就是对的：只 showToast 提示"先用手机号+验证码登录"，
不做跳转。

## 改动

admin-web 跟 C 端对齐：把「申请球房入驻」按钮从 `navigate('/apply')`
改成 `message.info(...)` 提示。

## 受影响文件

- [admin-web/src/pages/VenueMerchant/VenueLogin.tsx](../admin-web/src/pages/VenueMerchant/VenueLogin.tsx)
  — 1 个按钮的 onClick 从 navigate 改 message.info
