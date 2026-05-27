---
date: 2026-05-27
version: v2.20.x
title: 微信小程序真实登录 + getPhoneNumber 手机号收集
---

# 微信小程序真实登录 + getPhoneNumber 手机号收集

## 动机
真机调试时反馈："微信授权后拿到的 user 信息没有手机号"。

根因有两处：
1. 服务端 `wechatLogin` 是 MVP mock —— 把客户端 `code` 字符串拼成 `mock_wx_xxx` 当成假 openId，并未调微信 `code2session`，所以拿不到真 OpenID/UnionID。
2. 微信小程序的"身份"和"手机号"是**两条独立授权链**，`wx.login` 永远不返回手机号；要拿手机号必须再走一次 `<Button open-type="getPhoneNumber">` + 服务端 `getuserphonenumber`。

## PRD / 设计变化
- `prd/legal-mvp.md` §3.1 微信小程序流程加 §3.1.2 `wechat_phone` 步骤、§3.1.3 mock fallback 说明，变更日志加 v1.1。
- 用户确认时间：2026-05-27（用户口头反馈 + 选 1 接真 wx）。

## 代码变化
### 服务端
- 新增 `server/src/auth/wechat.service.ts` —— 封装 `code2Session` / `getStableAccessToken`（内存缓存，TTL 一减 200s 提前失效）/ `getPhoneNumber`；`WECHAT_MP_APP_ID` 或 `WECHAT_MP_APP_SECRET` 为空时整体回落 mock（保持 dev 零配置可跑），mock 手机号固定 `+8613000000000`。
- `server/src/auth/auth.module.ts` —— providers / exports 加 `WechatService`。
- `server/src/auth/dto/client-login.dto.ts` —— 新增 `WechatPhoneDto { code }`。
- `server/src/auth/user-auth.controller.ts`：
  - `POST /auth/wechat`：去掉 `mock_wx_${code}` 拼装，改 `WechatService.code2Session` → 真 OpenID/UnionID → `usersService.upsertByWechat`。
  - 新增 `POST /auth/wechat/phone`（`UserAuthGuard`）—— 拿 `e.detail.code` → `WechatService.getPhoneNumber` → `usersService.bindPhone`；号已被另一账号占用时抛 `LOGIN_FAILED`，提示前端走"我"页面合并。

### 客户端
- `billiards-score/src/core/api/auth.ts` —— `authApi.wechatBindPhone(code)`。
- `billiards-score/src/components/LoginSheet/index.tsx`：
  - Step 加 `'wechat_phone'`。
  - `handleWechat` 拆出 `closeSheetWithToast`；`wechatLogin` 成功后**先 setSession**（让后续接口拿到 token），再判断 `user.phoneNumber`：
    - 已有 → `closeSheetWithToast('登录成功')`
    - 没有 → `setStep('wechat_phone')`，**不关闭 sheet**
  - 新增 `handleGetPhoneNumber` 处理 `<Button open-type="getPhoneNumber">` 的 `e.detail.code`，调 `wechatBindPhone` → `setUser`。
  - 新增 `handleSkipPhone`（"稍后绑定"，直接关 sheet，用户保留登录态，可在「我」页面通过 BindPhoneSheet 补绑）。
  - 三处 console.log 已加在 wechatLogin / Taro.login / wechatBindPhone 关键节点，便于真机调试。
- `billiards-score/src/components/LoginSheet/index.scss` —— `.login-sheet-btn` 加 `width:100%; box-sizing:border-box; border:none; ::after{border:none}`，让 Taro `<Button>` 与 `<View>` 按钮宽度一致。

## 验证步骤
- [x] `server: npx tsc --noEmit` 通过
- [x] `client: npx tsc --noEmit` 仅剩 v2.20 预存在的 `NineBall.ts:281 ballType` 一条
- [ ] **服务端配 `WECHAT_MP_APP_ID` / `WECHAT_MP_APP_SECRET`** 后真机：点登录 → 协议 → 同意 → 微信授权 → wechatLogin 拿真 OpenID（console 见 user.id 是 `u_xxx` 而非 mock 拼接）→ 因新用户无手机号自动进 wechat_phone step → 点"微信授权手机号" → 系统弹窗确认 → server `getuserphonenumber` 返回真号 → bindPhone → user 更新带 `phoneNumber`（已脱敏 `138****0000`）→ 关闭 sheet。
- [ ] 服务端**未配** appId/secret（dev / 当前生产环境）：行为同上但手机号为 mock `138****0000`，账号会按 `mock_wx_<code>` 唯一性创建/复用，便于联调。
- [ ] 用户在 wechat_phone step 点"稍后绑定" → sheet 关闭、登录态保留，进"我"页面 → BindPhoneSheet 走短信验证码补绑成功。
- [ ] 用户在 getPhoneNumber 系统弹窗点拒绝 → toast "已取消手机号授权"，停留在 wechat_phone step 可重试或稍后绑定。
- [ ] 同一手机号绑到另一账号时再 wechatBindPhone → toast "该手机号已属另一账号，请到「我」页面进行账号合并"。
- [ ] H5 行为不变：仍只有手机号短信验证码登录路径。

## 上线前必做
1. 微信公众平台后台填 **服务器域名** 白名单：`https://api.weixin.qq.com`（接 jscode2session / getuserphonenumber 必须）。
2. 服务端 `.env` 配真实 `WECHAT_MP_APP_ID` / `WECHAT_MP_APP_SECRET`，重启。
3. `legal/content.ts` 里的 `LEGAL_OPERATOR / LEGAL_CONTACT_EMAIL` 等占位由法务/运营复核。

## 遗留问题 / 已知限制
- 当前 access_token 缓存仅在单进程内存里；多实例部署需要换 Redis（见后续 v2.30）。
- 手机号冲突暂只抛错，没有像 BindPhoneSheet 那样的合并 UI；用户得手动去"我"页面走合并。
- `code2Session` 失败的错误信息直接透传给前端，可能含微信原文 errmsg；上线前可视情况脱敏。
- 不持久化 `session_key`；当前没用到 wx.getUserInfo 的解密路径。
