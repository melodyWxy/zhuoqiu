# 击球帮 · 隐私合规与微信直登 MVP

> 版本：v1.0 · 2026-05-27 · 范围：C 端 Taro 客户端（微信小程序 / H5）
> 关联：`prd/weapp-adaptation.md` §6（小程序登录链路改造从"未排"挪到本 PRD）

---

## 1. 背景与合规依据

微信小程序提交审核时反馈：

> 小程序【手机号】涉及收集、使用和存储用户信息，请补充增加或完善《用户服务协议》及《隐私政策》，明确告知收集用户信息的使用目的、方式和用途，并取得用户授权同意后，才能获取用户收集用户信息。

同时按《微信小程序用户隐私保护指引》要求，调用涉隐私 API（如 `wx.login`、`wx.getUserProfile`、`wx.getPhoneNumber`）前必须经过用户对隐私协议的明示同意。

当前 `LoginSheet` 直接展示"微信一键登录 / 手机号登录"两个按钮，**没有任何协议告知与同意流程**，且 H5 下"微信一键登录"实际只能 mock，会误导用户。

## 2. 范围

| 是 | 否 |
|---|---|
| C 端 LoginSheet 入口（首页 / join / me / config / tournament-detail 共 5 处）的协议告知与同意 | BindPhoneSheet（已登录态后才出现，不重复弹协议；正文覆盖即可） |
| 新建《用户服务协议》《隐私政策》MVP 版（仓内常量） | 后台/球房账号体系（独立 JWT，沿用现状） |
| 微信环境 `wx.getPrivacySetting` / `wx.requirePrivacyAuthorize` 同步授权状态 | 不开 `__usePrivacyCheck__` 全局拦截 |
| weapp 同意后**直接微信登录**，不再展示 actionsheet 菜单 | 不接 Markdown 渲染、不接外链协议 |
| H5 同意后展示 actionsheet，**只剩手机号登录** | 不做"撤回授权"UI（v1 通过注销账号实现） |

## 3. 用户流程

### 3.1 微信小程序

```
点击「登录」
  └─ 已同意（legal-agreed-v1=1）
        └─ ensureWxPrivacyAuthorized() 通过 → wx.login → authApi.wechatLogin → 检查 user.phoneNumber
              ├─ 已有 → 完成
              └─ 没有 → 切到 wechat_phone 步骤（见下）
  └─ 未同意
        └─ 弹隐私协议 sheet
              ├─ 不同意 → 关闭，不变更状态
              └─ 同意并继续
                    ├─ accept() 写入 storage
                    ├─ wx.requirePrivacyAuthorize 拉系统授权
                    └─ 通过 → wx.login → authApi.wechatLogin → 检查 phoneNumber → 见上
                       未通过 → toast「需同意隐私政策才能继续登录」，停留
```

**3.1.2 wechat_phone 步骤（手机号收集）**

```
触发：wechatLogin 成功但 user.phoneNumber === null
UI：标题「为更好地为您服务，请授权使用您的手机号」
    主按钮 <Button open-type="getPhoneNumber" bindgetphonenumber>
    次按钮 「稍后绑定」
回调 e.detail.code →
  ├─ 用户点了授权 → POST /auth/wechat/phone { code } →
  │       服务端 code2phone → bindPhone → 返回新 user → finishLogin（关闭 sheet）
  ├─ 用户拒绝 / 关闭 → 不报错，停在 wechat_phone 步骤；用户可点「稍后绑定」直接 finishLogin
  └─ 后端调用失败 / 手机号已属另一账号 → toast 错误，留在原步骤
```

「稍后绑定」走 finishLogin —— 用户可在「我」页面通过 BindPhoneSheet（短信验证码）补绑。

**3.1.3 服务端 mock fallback**

`WECHAT_MP_APP_ID` / `WECHAT_MP_APP_SECRET` 任一为空 → WechatService 回落 mock，用 `mock_wx_<code prefix>` 拼伪 openId、`getPhoneNumber` 直接返回固定测试号 `+8613000000000`。开发环境零配置即可跑通，生产必须配真实 appId/secret。

**3.1.4 wechat_profile 步骤（昵称 + 头像收集）**

> 微信自 2022-10-25 起 `wx.getUserProfile` 不再返回真实昵称/头像，新建用户默认昵称都是 `微信用户`，赛事中无法区分。本步骤是官方推荐的「头像昵称填写能力」实现。

```
触发：wechatLogin 或 wechat_phone 完成后，user.nickname === '微信用户' || !user.nickname
触发条件加 isWeapp() —— H5 没有 chooseAvatar 能力，跳过
UI：
  · 头像：<Button open-type="chooseAvatar" bindchooseavatar>，点击后选中的 wxfile 临时路径预览在按钮里
  · 昵称：<Input type="nickname">，聚焦时微信键盘上方自动浮出"使用微信昵称"
  · 主按钮"保存"：
        ① wxfile 路径 → POST /me/avatar（multipart）→ 服务端返回 https URL
        ② PATCH /me { nickname?, avatar? }
        ③ store.setUser(merged) → finishLogin 关闭 sheet
  · 次按钮"跳过"：保留 server 默认 '微信用户'，用户可在「我」页面再改
```

H5 / 已有真实昵称的用户（再次登录）不会进入此步骤。


### 3.2 H5

```
点击「登录」
  └─ 已同意 → 直接展示 actionsheet（仅手机号登录 / 暂不登录）
  └─ 未同意 → 弹隐私协议 sheet
        ├─ 不同意 → 关闭
        └─ 同意 → accept() → 进 actionsheet
```

H5 下不展示"微信一键登录"按钮（不可用），避免误导。

## 4. 协议正文要点（MVP）

两份协议都用纯结构化段落（`{ heading, paragraphs[] }`）放在 `src/pages/legal/content.ts`，不依赖 Markdown 渲染。

### 4.1 《用户服务协议》要覆盖

- 服务提供方：击球帮（运营主体待补，先用占位）
- 服务内容：本地计分、联机比赛同步、赛事报名、球房展示
- 用户行为规范（合规言论、不滥用 SMS、不冒用账号）
- 账号：手机号 / 微信 OpenID 唯一标识，注销见隐私政策
- 知识产权、免责声明、协议更新机制
- 联系方式与争议解决（占位）

### 4.2 《隐私政策》必须明确

- **收集字段**：手机号（短信验证码）、微信 OpenID/UnionID/昵称、设备型号与操作系统（接口诊断）、比赛行为日志（局数 / 得分）
- **收集方式**：用户主动输入手机号 + 短信验证码；微信侧 `wx.login` 授权
- **使用目的**：登录鉴权、联机比赛同步、赛事报名识别、客服对账
- **共享与转让**：不向任何第三方共享、转让、公开披露用户个人信息
- **存储期限**：账号注销前持续存储；注销后 30 日内擦除
- **用户权利**：查询、更正、删除个人信息；账号注销渠道（暂走客服占位）
- **未成年人保护**：14 岁以下需监护人同意
- **联系方式**：邮箱 / 微信占位
- **生效与更新**：版本号 + 生效日期；下文 §5 的 `LEGAL_VERSION` 升级时弹窗重弹

## 5. 数据契约

```ts
export const LEGAL_VERSION = 'v1'         // 协议正文 bump 时改这里
const STORAGE_KEY = `legal-agreed-${LEGAL_VERSION}`  // 同意态 key
```

存储位置：`Taro.setStorageSync` 设备级。

`useLegalConsent()` Hook：返回 `{ agreed, accept }`。`accept()` 写入 storage 并 setState。

## 6. 微信隐私 API

封装在 `src/utils/wxPrivacy.ts`：

```ts
isWeapp(): boolean                                  // Taro.getEnv() === Taro.ENV_TYPE.WEAPP
ensureWxPrivacyAuthorized(): Promise<boolean>       // weapp：getPrivacySetting → 需要时 requirePrivacyAuthorize；H5 直接 true
```

所有 `wx.*` 调用都用 `typeof wx !== 'undefined' && typeof wx.xxx === 'function'` 守卫，编译期 H5 也安全。

不开 `__usePrivacyCheck__`、不动 `project.config.json`。

## 7. UI 规约

- 协议页 `pages/legal/index?type=privacy|terms`，单页两态
- 标题运行时 `Taro.setNavigationBarTitle` 切换
- 暗色主题（`#0a0f0d / #1a2f23 / #d4af37`），段落 14px / 行高 1.7 / 最大宽 720px / 左右各 16px
- LoginSheet privacy step：标题"用户服务协议与隐私政策"，正文一段说明 + 两个 `.legal-link`（金色下划线）跳协议页，按钮"同意并继续"+"不同意"

## 8. 验收用例

| # | 环境 | 状态 | 操作 | 期望 |
|---|------|------|------|------|
| 1 | weapp | 首次 | 任一入口点登录 | 弹隐私协议 → 同意 → 拉起 wx 授权 → 微信登录成功 |
| 2 | weapp | 已同意 | 点登录 | 不弹协议，直接微信登录 |
| 3 | weapp | 首次 | 同意但 requirePrivacyAuthorize 拒绝 | toast 提示，停留在 privacy step |
| 4 | weapp | 任意 | 点不同意 | sheet 关闭，storage 不变 |
| 5 | H5 | 首次 | 点登录 | 弹隐私协议 → 同意 → 进手机号 menu（**无微信选项**） |
| 6 | H5 | 已同意 | 点登录 | 直接进手机号 menu |
| 7 | 任意 | 任意 | 协议 v1 → v2 升级 | LEGAL_VERSION 改了之后所有用户重弹一次 |
| 8 | 任意 | 任意 | 5 个调用方各点一次 | 行为一致 |

## 9. 非目标

- 不接 Markdown 渲染、不接外链版本协议（后续版本可换）
- 不做"撤回授权"独立入口（v1 通过注销账号实现）
- 不改 server schema、不记录服务端同意时间戳
- 不动 BindPhoneSheet（前置已登录、协议正文已覆盖）
- 不动后台/球房账号登录链路

## 10. 变更日志

| 版本 | 日期 | 变更 |
|------|------|------|
| v1.0 | 2026-05-27 | 初稿，对齐微信小程序合规要求；落地 LoginSheet privacy step + weapp 直登 |
| v1.1 | 2026-05-27 | 服务端接真 wx code2session；新增 `/auth/wechat/phone` + 客户端 wechat_phone step（getPhoneNumber 收集手机号，用户可"稍后绑定"） |
| v1.2 | 2026-05-27 | 新增 wechat_profile step（chooseAvatar + type=nickname），解决"参赛玩家昵称头像都一样无法区分"问题；服务端 `users.avatar` 列长度从 32 改为 512 容纳 URL；新增 `POST /me/avatar` 上传接口；UI 头像渲染按 URL/emoji 分支 |
