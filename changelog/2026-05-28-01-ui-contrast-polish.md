---
date: 2026-05-28
version: v2.20
title: UI 对比度统一打磨 + H5 整页白底修复
---

# UI 对比度统一打磨 + H5 整页白底修复

## 动机
用户原话：

> 1. 房间创建后，各位玩家的玩家卡片的背景色和页面比较统一，对比不够明显，需要给每位玩家设定不一样的背景色；
> 2. 房间内的比赛结束后，我的页面 比赛记录 的每个记录卡片内，时间没有格式化，导致卡片内容堆叠了；
> 3. 主页上的几个卡片的背景色和页面也比较统一，也应该有点对比效果；
> 4. 我的页里 我的信息卡片、比赛记录卡片也是。整体优化下 UI 展示。

调试 H5 时另外发现一个 P0 级 regression：v2.10 的 weapp 适配把 `:root` 改成
`page` 选择器，但 H5 里 `page` 不命中任何 DOM，导致 H5 整页 CSS 变量空缺、
背景退化成白底。本次顺手修。

## PRD / 设计变化
- 不涉及 PRD 改动，纯样式打磨。
- 设计稿层面新增「色板分层 + slot 配色」约定（写进 `styles/global.scss` 注释里）：
  - `--bg-card` 提到 `#1f2c26`，`--bg-card-strong` `#263730`，与 `--bg-dark`
    `#0a0f0d` 拉开三档亮度。
  - `--card-border` / `--card-shadow` 给卡片统一描边 + 投影变量。
  - `--slot-1..4` 房间内玩家卡每个号位独立色调（蓝 / 紫 / 苔绿 / 砖红）。

## 代码变化
- 修改文件：
  - `billiards-score/src/styles/global.scss`：
    - CSS 变量同时挂在 `page, :root`（weapp 用 page，H5 用 :root），修复 H5
      整页白底。
    - 新增卡片色板变量 + slot 配色变量。
    - 把 `background-color` / `font-size` / `min-height` 从变量块拆出来，
      page 上保留 weapp 字号 32rpx，html/body 上加深色兜底。
  - `billiards-score/src/pages/index/index.scss`：
    - `.mini-card` 默认渐变改成更亮一档的绿，加 `box-shadow`。
    - `.primary-card`（九球 / 中八）叠一层金色高光。
    - `.join-card` 蓝色透明度上调，更明显。
    - `.venues-card` / `.tournaments-card` 改成虚线 + 金色低饱和渐变。
    - `.hot-item` 加描边 + 投影。
  - `billiards-score/src/pages/me/index.scss`：
    - `.identity-card` 金色渐变更厚，加投影。
    - `.section` 用 `--bg-card` + 描边 + 投影替代 `rgba(255,255,255,.03)`。
    - `.history-item` 用 `--bg-card-strong` + 描边，让卡中卡更立体。
    - `.item-time` 加 `white-space: nowrap`，防止时间换行挤垮右列。
  - `billiards-score/src/pages/me/index.tsx`：
    - 新增 `formatDateTimeShort`，把云端历史的 `endedAt` 输出统一成
      `MM/DD HH:mm`。原来用 `toLocaleDateString() + toLocaleTimeString()`
      在中文 locale 下会输出 `2026/5/27 下午3:30` 这种长串，挤爆 `item-score`
      竖列布局，导致卡片堆叠。
  - `billiards-score/src/pages/eight-ball/index.scss`：
    - `.player-card` 默认背景去掉，依赖 `:nth-child(N)` 给每个号位发一份
      slot 渐变；`:active` / `.selected` 只控边框 + 阴影，不再覆盖底色。
  - `billiards-score/src/pages/nine-ball/index.scss`：同上策略，三人 / 四人
    场景下三个号位分别拿到 slot-1/2/3 渐变。

## 验证步骤
- [x] `npm run dev:h5` 编译通过，无报错。
- [x] H5 上首页 / 我的页 / 中式八球 / 九球追分 四个页面截图对比：
  - 首页背景恢复深绿渐变，卡片层级清晰。
  - 我的页 identity 卡 + section 卡 + history-item 三层背景明显。
  - 中式八球 1/2 号位分别冷蓝 / 暖紫。
  - 九球追分 1/2/3 号位分别冷蓝 / 暖紫 / 苔绿。
- [ ] weapp 端回归（基础库自测）：检查
  - `page { ... }` 仍然命中根元素（变量入口未改）；
  - `font-size: 32rpx` 仍生效；
  - `--bg-card` 调亮一档不影响 join / venue 等深色场景的对比度。
- [ ] 待真实云端历史出现长 endedAt 时验证 `MM/DD HH:mm` 显示正确，且不溢出。

## 追加：玩家卡使用真实头像

用户原话：「房间内的比赛，玩家卡片的头像不是玩家真正的头像。这个要处理一下。」

之前 `OnlineMode.tsx` 玩家卡里写死 `🧍` emoji，没用 server 返的玩家头像。

- `server/src/match/match.service.ts` `detailFromTx`:
  - players include `user: { select: { id, avatar } }`
  - 输出每个 player 增加 `avatar: p.user?.avatar ?? null` 字段
- `billiards-score/src/core/api/match.ts`：`MatchDetail.players[]` 加
  `avatar: string | null`
- `billiards-score/src/pages/eight-ball/OnlineMode.tsx` /
  `nine-ball/OnlineMode.tsx`：新增 `PlayerAvatar` 子组件，复用
  `utils/avatar.ts` 的 `isAvatarUrl` 判断 emoji vs URL：
  - URL（OSS / 微信头像）→ `<Image mode='aspectFill'>`
  - emoji / 空 → `<Text>`，空位回退到 `🧍`
- 八球 / 九球 SCSS：`.avatar` 加 `overflow: hidden`，新增
  `.avatar-img` / `.avatar-emoji` 子样式。

注意：本地（非联机）模式仍是 `🧍` 占位，因为本地玩家没头像数据；用户没要求改这块。

## 遗留问题 / 已知限制
- slot 配色目前只支持到 4 人；如果以后比赛人数 > 4，需要继续扩 `--slot-5..N`
  和 `:nth-child(5)..` 规则。
- H5 的 `page` 选择器历史上一直被绕过去（v2.10 起），本次只补了 `:root`
  和 html/body 兜底；如有其它 weapp 专用选择器在 H5 不命中，需逐个排查。
- 真实头像生效依赖 server 端这次改动同步部署；旧 server 返回的 player 无
  `avatar` 字段，前端会回退到 `🧍` 占位（不会崩）。
