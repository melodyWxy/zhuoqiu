---
date: 2026-06-02
version: v2.20
title: 微信小程序分享能力（联机房间 / 球房 / 赛事 / 战报 / 首页）
---

# 微信小程序分享能力

## 动机
用户原话：

> 我发现目前我的小程序没有分享功能，需要加入分享能力

之前 weapp 端右上角"…"点开只有「投诉」，没有「分享给朋友」/「分享到朋友
圈」选项。本轮把 P0/P1 各页都接上，并在联机房间码 banner 加显眼的「分享给
朋友」按钮（不光靠右上角"…"）。

## PRD / 设计变化
- 新增 `prd/share.md`：分享矩阵、文案、路径、卡片图、朋友圈支持范围全部
  落到 PRD
- 卡片图先用 logo 兜底（`assets/tabs/home-active.png`），后续补真 share-cover

## 代码变化

### 新增
- `src/utils/share.ts`：所有 build*Share() 工具，集中管理标题 / 路径 / 兜底
  imageUrl，以及朋友圈的 `{ title, query, imageUrl }` 变体
- `src/utils/share.ts` 的兜底 cover 用 `/assets/tabs/home-active.png`（不
  新建资源），微信会等比拉伸到 5:4 卡片框

### P0 接入

| 页面 | 给好友 | 朋友圈 |
|------|-------|-------|
| `pages/nine-ball/index.tsx` | ✅ 联机房间码作为分享 path | ❌ |
| `pages/eight-ball/index.tsx` | ✅ 同上 | ❌ |
| `pages/venue-detail/index.tsx` | ✅ | ✅ |
| `pages/tournament-detail/index.tsx` | ✅ | ✅ |

联机比赛 hook 触发时**重新拉一次 detail 拿 code**（兜底 OnlineMode 还没初
始化好的场景），失败也给兜底 path 不让分享按钮"挂"。

### 联机房间 banner 增强
- `pages/nine-ball/OnlineMode.tsx` + `pages/eight-ball/OnlineMode.tsx`：
  把 `room-code-banner` 拆成 `.rcb-main`（点击复制房间码，原行为保留）+
  `<Button openType='share'>分享给朋友</Button>`（新增显眼 CTA）
- 对应 SCSS：`pages/nine-ball/index.scss` `pages/eight-ball/index.scss`
  - `.room-code-banner` `flex-direction: column; gap: 10px`
  - 新增 `.rcb-main`（移走 cursor + :active 反馈）
  - 新增 `.rcb-share-btn`（金色实色按钮 44px 高，与刀 A 触达档对齐）
  - 圆角 12px → `var(--radius-md)`（顺手 token 化）

### P1 接入

| 页面 | 给好友 | 朋友圈 |
|------|-------|-------|
| `pages/match-detail/index.tsx` | ✅ 战报标题含 1v1 比分 / 多人榜首 | ❌ |
| `pages/index/index.tsx` | ✅ | ✅ |

## 文案样例

- 联机：`九球房间 ABCD12，进来记分？`、`中八房间 ABCD12，进来记分？`
- 球房：`XXX球城（北京） · 已认证球房`
- 赛事：`xx 杯八球公开赛 · 正在报名`
- 战报 1v1：`击球帮战报 · 九球：张三 7:5 李四`
- 战报多人：`击球帮战报 · 中八：张三 拿了第一`
- 首页：`击球帮 · 台球记分小程序`

## 故意不做
- **联机比赛 / 战报 不接朋友圈**：朋友圈 query 透传虽然支持（基础库 ≥
  2.11.3），但落地路径不可控，房间码 / matchId 这种强依赖参数的页面进朋友
  圈会变成一颗哑弹
- **`pages/join/index`**：本身就是分享落地页，不需要再分享
- **列表页（venues / tournaments）**：分享 ROI 低，先不做
- **真 share-cover 卡片图**：等美术，本轮用 logo 兜底
- **分享追踪 / 邀请奖励 / 战绩榜**：未来事
- **H5 端分享**：H5 没有微信原生 API，要做得走 share API + 二维码兜底，
  本轮不上

## 验证步骤
- [x] `npm run build:weapp` 通过（无类型 / 导入错误；遗留的 mini-css-extract
  顺序 warning 是刀 D 的旧账）
- [ ] 真机：联机九球 / 中八房间页，房间码 banner 「分享给朋友」按钮 →
  好友收到的卡片标题含房间码 → 点开直达 join 页
- [ ] 真机：右上角"…" → 「分享给朋友」生效，标题同上
- [ ] 真机：球房详情 → 朋友圈，朋友圈打开能正确落到该球房
- [ ] 真机：赛事详情 → 朋友圈，同上
- [ ] 真机：战报 → 「分享给朋友」OK，朋友圈选项**不显示**
- [ ] 真机：首页 → 「分享给朋友」+ 朋友圈都能用

## 遗留问题 / 已知限制
- 卡片图用 81×81 tabbar logo 兜底，微信会拉伸到 5:4 卡片框，分辨率偏低；
  建议下一轮加 `src/assets/share/share-cover.png`（500×400 PNG）
- 分享追踪没接，无法量化「分享 → 加入」漏斗，后续如要做需 server 端打点
- `pages/join/index` 的 `roomCode` query 解析在本轮没改动，靠现有逻辑

## 关联
- PRD：`prd/share.md`
- 上一轮 UI 审计：`changelog/2026-06-01-04-v2.20-ui-audit-knife-d-display-states.md`
