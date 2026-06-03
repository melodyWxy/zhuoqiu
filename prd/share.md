# 分享功能 PRD（v2.20+）

> 关联：`ux/v2.20-ui-audit.md` 同期
> 范围：weapp 微信小程序内的「分享给朋友」+「分享到朋友圈」两个能力。
> 非范围：H5 不做（H5 没有微信原生分享接口；要做得走 share API + 二维码兜底，本轮不上）。

## 业务目标
1. 联机比赛：打球时把房间码甩给好友，对方一点就直达 `join` 页加入。当前是
   靠扫房间码二维码，分享能力是更原生的入口。
2. 球房 / 赛事：发现球房 / 赛事 → 一键安利给朋友。
3. 战报 / 首页：让用户从「赛后回顾」页 / 主页推广 app 本身。

## 分享矩阵

| 页面 | 分享给好友 | 朋友圈 | 说明 |
|------|-----------|-------|------|
| 联机九球（`nine-ball/index?matchId=X`）| ✅ | ❌ | 朋友圈打开不接 path 参数，房间码会丢，做了反而误导 |
| 联机中八（`eight-ball/index?matchId=X`）| ✅ | ❌ | 同上 |
| 球房详情（`venue-detail/index?id=X`）| ✅ | ✅ | 朋友圈走 query；落地页能解析 |
| 赛事详情（`tournament-detail/index?id=X`）| ✅ | ✅ | 同上 |
| 战报（`match-detail/index?id=X`）| ✅ | ❌ | 战报性质，朋友圈意义低 |
| 首页（`index/index`）| ✅ | ✅ | app 推广 |
| `join`、`venues`、`tournaments`、`me`、`config`、`venue-apply`、`venue-login`、`legal` | ❌ | ❌ | 落地页 / 列表页 / 私有页 |

## 文案

> 文案以「直白 + 一点点暧昧的紧迫感」为基调。

| 场景 | title |
|------|-------|
| 联机九球 | `九球房间 ${roomCode}，进来记分？` |
| 联机中八 | `中八房间 ${roomCode}，进来记分？` |
| 球房详情（已认证） | `${venueName} · 已认证球房` |
| 球房详情（带城市信息） | `${venueName}（${city}） · 已认证` |
| 赛事详情（报名中）| `${tournamentName} 正在报名` |
| 赛事详情（进行中 / 已结束）| `${tournamentName} · ${statusText}` |
| 战报（自己赢）| `击球帮战报：${selfName} ${selfScore}:${oppScore} ${oppName}` |
| 战报（多人）| `击球帮战报：${type}，${players[0].name} 拿了第一` |
| 首页 | `击球帮 · 台球记分小程序` |

## 路径

均走现有 path（不额外加参数）：

- 联机比赛：`/pages/join/index?roomCode=${roomCode}`（落地到 join 页，与扫码同入口）
- 球房：`/pages/venue-detail/index?id=${id}`
- 赛事：`/pages/tournament-detail/index?id=${id}`
- 战报：`/pages/match-detail/index?id=${matchId}`
- 首页：`/pages/index/index`

## 卡片图（imageUrl）策略

> 用户决定：**先用 logo 兜底，后续再补设计稿**。

实现层面有三种取值：
1. 真实图（球房 `coverImage`、未来的赛事 banner）→ 直接用 OSS URL
2. 静态 logo 兜底 → `/assets/share/share-cover.png`（本轮**不**新建文件，而是
   复用已有 `assets/tabs/home-active.png`）
3. 留空（`imageUrl: undefined`）→ 微信自动截图首屏

策略：
- 球房有 `coverImage` → 用之；否则 fallback 到 logo
- 赛事 / 战报 / 联机比赛 → fallback 到 logo
- 首页 → 留空，让微信自动截图（首页本身已经是 logo 风格）

注：tabbar logo 是 81×81 PNG，分享卡推荐 5:4 比例（500×400），微信会自动等比
拉伸到 5:4 框内。视觉会有点偏小但不会糊；后续美术给真正的 share-cover 再换。

## 朋友圈细节

`useShareTimeline` 返回 `{ title, query, imageUrl }`：
- `query` 是 `id=xxx&foo=bar` 形式（不是完整 path）；落地页路径不可控（朋友圈
  打开默认从 app entry 进入，但 weapp 基础库 ≥ 2.11.3 会把 query 透传给被
  分享的页面）
- 朋友圈不接 `path`，所以联机比赛 / 战报这种**强依赖落地路径**的页面不做朋友圈
- 球房 / 赛事的 query 透传后，对应页面 `useRouter().params` 仍能拿到 id，OK

## 触发入口

| 场景 | 入口 |
|------|------|
| 联机比赛 | 房间码 banner 旁加 **自定义 `<Button openType='share'>` 「分享房间」按钮**（默认右上角"…"也保留）|
| 球房 / 赛事 / 战报 / 首页 | 仅默认右上角"…"（不加自定义按钮，避免污染信息密度）|

## 不做（明确范围）

- 分享追踪（带 `?from=share` 或后端打点）
- 自定义分享卡（H5 canvas 绘制比分图）
- 邀请奖励 / 战绩榜
- H5 端的 share API 桥接

## 验证

- [ ] 真机：联机房间页 → 右上角 "…" → 分享给朋友，对方点开直达 `join` 加入
- [ ] 真机：联机房间页 → 房间码 banner 「分享房间」按钮，效果同上
- [ ] 真机：球房详情 → 分享给朋友 + 分享朋友圈，朋友圈进 app 后路径能正确落地
- [ ] 真机：赛事详情 → 同上
- [ ] 真机：战报 → 分享给朋友（朋友圈灰掉）
- [ ] 真机：首页 → 分享给朋友 + 分享朋友圈
- [ ] 朋友圈不在矩阵的页面，确认右上角"…"里**没有**「朋友圈」选项

## 落地节奏

1. `prd/share.md`（本文件）
2. `src/utils/share.ts`：所有 build*Share() 工具
3. P0 接入：`nine-ball/index.tsx` `eight-ball/index.tsx`（页面级 hook）+
   `OnlineMode.tsx`（房间码 banner 按钮）+ `venue-detail` + `tournament-detail`
4. P1 接入：`match-detail/index.tsx` + `index/index.tsx`
5. `changelog/2026-06-02-XX-share-features.md`
6. push
