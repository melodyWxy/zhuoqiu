---
date: 2026-06-03
version: v2.22
title: 战报海报头像修复 - emoji 头像渲染 + 无头像随机兜底
---

# 战报海报头像修复 - emoji 头像渲染 + 无头像随机兜底

## 动机

user 反馈「生成的战报里没有头像」。排查发现根因不是"没画头像",而是
**emoji 头像在服务端渲染成了空白**：

- 新用户默认头像就是 emoji `'🎱'`（`billiards-score/src/core/user/store.ts:37`），
  用户也可以从 `AVATAR_EMOJI_CHOICES` 选 emoji 头像。
- 渲染器画 emoji 时靠**系统字体回退**找 emoji 字形。这个回退在 mac dev 与
  Alpine 容器行为不一致、不可靠 —— 本地复现就是**整块空白**（只有底色，没字形）。
- 所以「有 emoji 头像的人」在海报上反而是空的，看着像"没头像"。

顺带满足 user 期望：**真·无头像（avatar=null）时，随机给一个头像**，不要再留空。

## 代码变化（`server/src/match/replay-renderer.service.ts`）

### 1. 打包 Emoji 字体，显式指定家族（不再靠系统回退）

- 新增 `server/assets/fonts/Emoji.ttf`：从单色 NotoEmoji 子集化，只含 12 个头像
  emoji（对齐小程序 `AVATAR_EMOJI_CHOICES`：🎱🧍🦸🥷🐯🦊🐼🐶🐱🦁🐰🐻），仅 **20KB**。
- `ensureFonts()` 注册为家族 `Emoji`；`drawInitial()` 画 emoji 时显式用
  `"Emoji"` 家族（单色白色剪影），不依赖 `font-noto-emoji` 的 fontconfig 回退。
- 效果：默认 🎱 头像、用户选的 emoji 头像，本地与容器都稳定渲染成白色剪影图标。

### 2. 无头像随机兜底（`fillFallbackAvatars`）

- 渲染前给 `avatar` 为空的玩家分配一个 emoji 兜底头像：
  - 用「名字#slot」做种子 → **同一个人每次生成都是同一个**（稳定不乱跳）
  - 同一局内线性探测避开已用 emoji（含别人选过的）→ **不撞脸**
- 兜底池 `FALLBACK_AVATARS`（11 个，去掉占位的 🧍）。

## 验证

`scripts/poster-preview.ts` + 无头像专项渲染：

- 1v1 无头像 → 张三 🎱 / 李四 🐻（不同）
- 三人领奖台无头像 → 🐯 / 🦊 / 🦁（三者不同）
- 4 人榜单 → 冠军 🐯、🐼、🧍（用户显式 emoji）、🦁 都正常
- 混合（一人选 🐶 + 一人 null 兜底 🦊）→ 用户头像与兜底都渲染、不重复

> 注：name 里若含 emoji（罕见）仍可能缺字形，不在本次 12 字子集内；头像场景已全覆盖。

## 部署

⚠️ server 端，必须**重新 build Docker 镜像**（带上 `assets/fonts/Emoji.ttf`）再重启。
验证：admin 后台 → Matches Detail → 重新生成海报（force）。

## 关联

- 上一篇：`changelog/2026-06-03-02-replay-poster-redesign-b.md`
