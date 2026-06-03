# 战报系统 PRD（v2.22）

> 关联：`prd/share.md`（分享）、`changelog/2026-06-01-04-...`（UI 审计·刀 D）
> 范围：完整 C 档 —— 海报感战报 + 比赛收尾流 + 战绩沉淀。
> 非范围（明确不做）：排行榜、PK 历史、视频回放、多语言、H5 战报。

## 0. 决策结果（已与 user 确认）

| # | 决策 | 选定 |
|---|------|------|
| 1 | 海报生成方式 | ✅ **server-side `@napi-rs/canvas` + Node 端 ali-oss 上传** |
| 2 | 海报上的二维码扫码落地 | ✅ **战报页本身** `pages/match-detail/index?ms=...` (传播闭环) |
| 3 | 比赛结束自动跳「我」页 | ✅ **改成弹三按钮**（查看战报 / 再来一场 / 歇会），3s 强跳取消 |
| 4 | 战绩统计存储 | ✅ **聚合查询**，不建 user_stats 表 |
| 5 | 海报触发与交互态 | ✅ **server 异步生成 + 前端骨架立刻渲染 + 海报区轮询占位**；海报 url 走 OSS 公共 bucket |
| 6 | OSS downloadFile 域名白名单 | ✅ user 已在微信公众平台配置 |
| 7 | 「再来一场」按钮本期实现 | ⚠️ 本期 placeholder（按钮可见但点击 toast「敬请期待」），完整逻辑下一轮做 |
| 8 | 微信小程序码触发条件 | ⚠️ 需要小程序为体验版 / 正式版（access_token 才能拉 wxacode）；开发版用占位 PNG，**前端正常分享流程不受影响** |

## 1. 背景与动机

当前 `pages/match-detail/index.tsx` 是**审计日志风**：堆事件 JSON dump，没有
"叙事感"，普通用户进去什么都看不出来。结果是：

- 比赛打完，用户**没有动力分享**（分享出去内容也不动人）
- 个人累计战绩**完全无沉淀**（打了 100 场和打了 1 场对用户来说没区别）
- 朋友点开分享卡进来后，**看到的是事件日志而不是结果**

C 档目标是把 match-detail 升级成「真正的战报体验」：
- 视觉上是**海报**而非表格
- 比赛结束**自动引导**到战报，而非默认回首页
- 海报作为**分享卡片图**（朋友圈也能看到）
- 海报底部带**小程序码**，扫码直达战报页 → 形成传播闭环
- 个人累计战绩出现在「我」页

## 2. 用户旅程

### 2.1 联机比赛刚打完
1. 房主点「结束比赛」→ server 触发 `end` 事件
2. server 异步生成海报（不阻塞）
3. weapp `OnlineMode` 收到 ws `match_event` 中 `type=end` → **现在的 endedOverlay
   3 秒倒计时**改成弹三按钮：
   - **🏆 查看战报**（金色主按钮）→ navigate 到 `match-detail?id=...`
   - 🔁 再来一场 → 走 `初始化新房` 流（沿用 `index/index` 的 `创建联机` 逻辑）
   - 💤 先去歇会 → 跳「我」页（保留旧行为）
4. 海报若已生成完毕，战报页直接渲染；未完则展示 LoadingState 「正在生成战报…」

### 2.2 战报页内
1. 顶部展示**海报缩略图**（点开放大）
2. 中部：玩家比分大字 + 冠军徽章 + 时长 / 撤销次数 等元数据
3. 底部 floating「📤 分享战报」金色 CTA → 拉起微信分享，imageUrl 用海报 URL
4. 「查看完整事件日志」**折叠**入口（保留原 events JSON，但不主屏）

### 2.3 朋友收到分享卡片
- 卡片图就是海报 PNG（5:4 视觉，1080×864 裁剪）
- 点击 → 进战报页 → 又看到「分享」按钮 → 二次传播

### 2.4 朋友扫海报上的小程序码
- 扫码 → 直接进战报页（`match-detail?id=...`）—— 不是首页
- 与点击分享卡的体验一致；都能再分享出去

### 2.5 「我」页累计战绩
1. 进「我」页 → 个人卡下方多一个 `.stats-card` 战绩模块：
   ```
   战绩
   出场 23 场  ·  胜 14 场  ·  胜率 60.9%
   九球：💎 5  🏅 12  👑 1  ✅ 87
   中八：胜局累计 47
   最高分：26 分（vs 李四，5/27）
   ```
2. 点 stats-card 跳一个未来的「全部战绩」页（本期不做，留 TODO）

## 3. 海报设计

> 视觉方案：**B 版「动感对阵」**（2026-06-03 重做）。先用 HTML/CSS 出目标稿在浏览器
> 调到满意再落地到 `@napi-rs/canvas`。设计稿见 `design/poster-mockups/*.html`。

### 3.1 规格
- **画布**：1080 × 1920 PNG（5:9 海报比例 ≈ 朋友圈推荐尺寸）
- **微信卡片图**：从海报中部 1080 × 864 裁切出来用作 `imageUrl`（5:4 比例）；
  B 版中部正好是大比分 / 领奖台，适合裁切
- **字体**：
  - 拉丁数字 / 英文标签 → 仓库自带 **Oswald 静态字重**（`server/assets/fonts/Oswald-{500,600,700}.ttf`，仅拉丁约 270KB），呈现「运动条形字」
  - 中文 → 系统 **NotoSansCJK**（容器 `font-noto-cjk`，dev fallback PingFang）
  - emoji → 系统 **font-noto-emoji**；关键图标（冠军皇冠）改用 **canvas 矢量绘制**，不依赖 emoji 字体
- **配色**：dark 底 + **斜切撞色**（冷蓝 `--slot-1` vs 暖紫 `--slot-2`）+ 金 `--accent` 强调；
  领奖台名次用**金 / 银 / 铜**

### 3.2 模板结构（1v1·自上而下）

```
┌─────────────────────────────┐
│      · BATTLE REPORT ·       │  ← kicker（Oswald 间距英文）
│      九球追分 · 房间 7K2M     │  ← 比赛类型 + 房间码
│                             │
│   ┌─────┐   ◯VS   ┌─────┐   │  ← 圆角方头像微旋转，左冠军金边发光 /
│   │ 头像 │         │ 头像 │   │     右亚军紫边；斜切冷蓝/暖紫背景
│   │ 张三 │         │ 李四 │   │
│   │WINNER│         │ 2ND  │   │  ← 胶囊标签
│                             │
│      9    :    6            │  ← Oswald 条形大比分（冠军金 / 对手紫，
│                             │     两位数自动缩小）
│      张三 力克 李四          │  ← verdict（按分差选词，冠军名描金）
│      (时长 23分) (黄金9×1)   │  ← 胶囊 chips（来自 narrative.subline）
│                             │
│  击球帮            ┌────┐    │  ← 底部品牌（左）+ 小程序码卡（右）
│  长按二维码看战报   │ QR │    │
└─────────────────────────────┘
```

### 3.3 多人场景模板差异
- **3 人（高频，九球追分）→ 领奖台 podium**：冠军居中抬高、亚军银色居左、季军铜色
  居右，台座高度即名次，台座标 **冠 / 亚 / 季**。装饰：金色放射光芒、彩色纸屑、
  冠军光环 + 矢量皇冠 + 星芒、3D 立体台座。
- **4 人及以上 → 冠军 hero + 名次列表**：冠军大卡置顶，下方名次行（名次/头像/名字/分数）
  自适应排，放不下聚合成「其他 N 名玩家」。
- **平局（时间到、比分相同）**：对称渲染，不给任一方金色 WINNER，两侧比分同为金色，
  标签都标「平局」，verdict「A 与 B 战平」。

## 4. 服务端设计

### 4.1 Schema 改动

`Match` 表加：
```prisma
model Match {
  // ... 已有字段
  replayPosterUrl   String?    @map("replay_poster_url")    // OSS URL
  replayQrUrl       String?    @map("replay_qr_url")        // 备用：单独存小程序码
  replayGeneratedAt DateTime?  @map("replay_generated_at")
}
```

只加，不动现有列；migration 简单。

### 4.2 API

| Method | Path | 说明 |
|--------|------|------|
| POST | `/v1/matches/:id/poster` | （内部）触发海报生成。幂等：已生成且 < 24h 旧的直接返回旧 URL；否则重生成 |
| GET | `/v1/matches/:id/replay` | 战报数据：detail + posterUrl + 摘要文本（叙事化）|
| GET | `/v1/me/stats` | 我的累计战绩聚合 |

（`GET /v1/matches/:id` 已存在，本期不动；`replay` 是叙事化的产品视角接口）

### 4.3 海报生成实现

#### 选型：`@napi-rs/canvas`

理由：
- N-API 原生绑定，预编译二进制（不需要 native 编译环境）
- 性能 ≈ Skia / Cairo，单张 1080×1920 海报 < 100ms
- 比 `node-canvas` 部署更友好（后者需要 Cairo / Pango 系统库）
- 比 `puppeteer`（headless Chrome）轻 100 倍

#### 字体打包
- 把 `SourceHanSansCN-Regular.otf` `SourceHanSansCN-Bold.otf` 放到 `server/assets/fonts/`
- 启动时 `GlobalFonts.registerFromPath(...)`
- Noto Color Emoji 同样打包，作为 emoji 兜底字体

#### 头像处理
- 拉 `player.avatar`（OSS URL）→ `fetch` 下载 → `loadImage()` 解码
- 圆形裁切：`ctx.arc + clip()` 后绘制
- emoji 头像（`🧍`）→ 直接用 emoji 字体渲染

#### 小程序码
- 调微信 `wxacode/getUnlimited` API：
  - `scene`: `m=${matchId.slice(-12)}`（精简，留 buffer 给以后扩展）
  - `page`: `pages/match-detail/index`
  - 返回 PNG buffer
- 缓存策略：每场比赛只生成一次小程序码，存到 `replayQrUrl`（避免重复生成消耗微信配额）
- weapp 启动时解析 `App.onLaunch` 的 `query.scene`，命中 `m=xxx` 就 navigate 到战报页
  - 由于 scene 字段限制 32 字符，matchId 从 `m_8c3f29a01b...` 完整 32+ 字符压缩到尾 12 字符；服务端 / 前端各做一层匹配
  - 兜底：scene 解析失败 → 落首页

#### OSS 上传
- 复用 `server/src/upload/oss-direct.service.ts`
- 路径：`replay/{matchId}/poster.png` `replay/{matchId}/qr.png`
- 设置合理 cache-control（24h），24h 后旧 URL 仍能访问，分享卡不会失效

#### 触发与幂等
- `match.service.ts` 的 `endMatch()` / `forceEnd()` 末尾 `setImmediate(() => generatePoster(matchId))`
- 失败重试：3 次指数退避；最终失败也只是 posterUrl 为空，前端兜底用现有 logo
- 重生成接口：admin 用 `POST /v1/admin/matches/:id/poster?force=true`

### 4.4 战绩聚合

```ts
// GET /v1/me/stats
{
  totalMatches: 23,
  wins: 14,                        // 自己是冠军（按 type 分别算）
  byType: {
    nine_ball: { matches, wins, bigJack, smallJack, golden9, normalWin, highScore, highScoreVs }
    eight_ball: { matches, wins, totalWinRounds }
  },
  recent: [{ matchId, type, opponent, myScore, oppScore, endedAt }],  // 最近 5 场
}
```

实现：直接 SQL group by `MatchPlayer` 关联 `Match` 关联 `MatchEvent` —— 不预聚合表。

性能预估：单用户 < 1000 场前都能在 < 100ms 内出结果；超过再考虑预聚合。

## 4.5 Server 端补充

### 重启时 pending job 恢复
- `match.module.ts` `OnApplicationBootstrap`：扫 `Match where replayGeneratedAt is null and endedAt < now()-5min` → 重新入队
- 防止 server 在生成海报中途崩溃 → 比赛永远卡在 pending

### Dockerfile 字体 + canvas 二进制
- `server/Dockerfile`：
  - `apt-get install -y fontconfig`（@napi-rs/canvas 依赖）
  - COPY `assets/fonts/` 到容器
  - npm install 时 `@napi-rs/canvas` 自动拉对应平台 prebuilt（linux-x64-gnu / linux-arm64-gnu）

### 字体许可
- **Source Han Sans CN**（思源黑体）：SIL Open Font License 1.1，商用免费
- **Noto Color Emoji**：SIL OFL 1.1 + Apache 2.0，商用免费
- 字体文件提交到仓库 `server/assets/fonts/`，约 25-50MB，可接受

### 海报访问公开
- OSS bucket 用现有 `public-read` ACL（与头像 bucket 同档）
- 海报 URL 直接 https URL，无需预签名 / 不会过期 → 分享卡片长期有效

### 战绩接口权限
- `GET /v1/me/stats`：登录用户访问自己的（`@UseGuards(AuthGuard)`）
- `GET /v1/admin/users/:id/stats`：admin 反查（**本期不做**，留 TODO）
- 战报 detail（`GET /v1/matches/:id/replay`）：**公开**（matchId 是 m_xxx 长哈希不易猜；分享给陌生人能打开是基本诉求）

## 5. 前端设计（weapp）—— 主体

### 5.1 match-detail 视觉重做

文件：`pages/match-detail/index.tsx` 整页改写。

- 顶部：`<Image>` 海报缩略图（fallback：现有 logo 兜底卡）
- 长按海报 → `wx.previewImage` 大图查看
- 中部：玩家行 + 比分大字（沿用现有数据，但叙事化文案）
- 「📤 分享战报」**floating bottom button**（z-index 9，与 GameToolbar 类似）
- 「查看完整事件日志」可折叠（默认收起；展开后就是现在那个 events 列表，但
  drop 掉 `JSON.stringify(payloadJson)` 这条调试遗留）

### 5.2 OnlineMode 比赛结束流

`pages/nine-ball/OnlineMode.tsx` `pages/eight-ball/OnlineMode.tsx`：

- `endedOverlay` state 从 `{ countdown: number }` 改成 `{ done: true }`
- 3s 倒计时整段去掉
- 弹窗内容：
  ```
  比赛已结束 🏁
  
  [🏆 查看战报]   ← navigateTo /pages/match-detail/index?id=...
  [🔁 再来一场]   ← navigateBack to index, prefill 同 venue / 同对手
  [💤 先去歇会]   ← switchTab /pages/me/index（旧默认行为）
  ```
- 「再来一场」做不做：本轮 placeholder（按钮显示「敬请期待」），完整逻辑下轮做

### 5.3 我页战绩模块

`pages/me/index.tsx`：在 `.section.identity-card` 之下加 `.stats-card`：

- 加载逻辑：`useDidShow` 拉 `/v1/me/stats`
- 未登录态：不展示 stats-card
- Loading：用现有 LoadingState inline

### 5.4 分享集成升级

`utils/share.ts buildMatchReplayShare`：
- 改签名 `(d: MatchDetail, posterUrl?: string)`
- `imageUrl` 优先用 `posterUrl`，否则 fallback 到现有 logo
- 增加 `useShareTimeline` 接入（朋友圈需要 imageUrl，海报正合适）

### 5.5 异步生成的交互态

**核心思路**：战报数据（玩家、比分、冠军、时长、叙事文案）来自 `GET
/v1/matches/:id/replay` 的 detail 部分，**立刻能给**；海报 PNG 来自异步
generate job，**可能要等 0~3s**。把这两条数据流分开，前端骨架立刻渲染，
海报独立轮询。

#### 后端 GET `/v1/matches/:id/replay` 返回结构
```ts
{
  detail: { /* 玩家、比分、冠军、时长、events 摘要 ... */ },
  poster: {
    status: 'pending' | 'ready' | 'failed',
    url: string | null,           // ready 时是 OSS HTTPS URL
    qrUrl: string | null,         // 小程序码同样异步生成
    failedReason?: string         // failed 时填，前端兜底用 logo
  }
}
```

`status` 状态机：
- `pending`：generate job 入队 / 进行中
- `ready`：海报 + 小程序码都已上传 OSS，url 可用
- `failed`：3 次重试后仍失败；前端兜底用 logo，**仍允许分享**（imageUrl
  fallback 到 logo），不让用户卡在「海报生成中」永远走不到分享

#### 前端战报页交互
- **打开瞬间**：渲染所有非海报内容（玩家头像 + 比分 + 文案），用户**立刻
  能看到比赛结果**
- **海报区域**：
  - `pending` → `LoadingState text='正在生成战报海报…'` 占位（与 weapp 现
    有 LoadingState 视觉一致）
  - `ready` → `<Image src={poster.url}>` 渲染海报缩略图
  - `failed` → 静默 fallback 到 logo 兜底图，不显示「失败」字样（避免吓
    用户）；后台继续上报错误
- **轮询**：`pending` 时每 **1.5s** 拉一次 `replay`，最多 **20 次（30s）**；
  超时改成「点击重试」按钮（手动触发后端重生成）
- **分享按钮**：始终可点。imageUrl 当前能拿到的最佳值（poster.url > logo
  fallback），不依赖海报状态

#### 实测预期
- @napi-rs/canvas 绘制 < 100ms
- fetch 头像 + 上传 OSS ≈ 200~800ms
- 微信 wxacode 拉小程序码 ≈ 300~1500ms（拼网络）
- 总计 P50 **≈ 1s**，P95 **≈ 3s**
- 用户「弹窗 → 点查看战报 → navigateTo」本身约 500ms~2s
- → **大多数情况打开战报页时海报已 ready**；少数需要轮询 1~2 次

#### 兜底原则
- 海报失败 ≠ 战报失败：用户看到的核心信息（比分、冠军、玩家头像）来自
  detail，永远能渲染
- 分享失败 ≠ 战报失败：海报没好也能分享（imageUrl = logo），只是卡片图
  没那么动人

### 5.6 OSS 域名 weapp 白名单（重要！）

海报 URL 是 OSS HTTPS URL，weapp `<Image>` 渲染走 downloadFile，需要在
**微信公众平台 → 开发管理 → 开发设置 → 服务器域名** 的 `downloadFile
合法域名` 里加 OSS 域名（例如 `https://xxx.oss-cn-shanghai.aliyuncs.com`
或自定义 cdn 域名 `https://cdn.macrobit.com.cn`）。

**user 那边要确认这一项**：现在头像（`avatar` OSS URL）能正常展示，说
明域名已经在 `downloadFile` 白名单 → 海报走同一域名也能直接渲染，无需
再配。但如果海报上传到不同 bucket / 不同域名，需要补配。

实施侧：海报 OSS bucket 复用现有头像 bucket（同一域名），可以省掉这一步
人工配置。

### 5.7 小程序码 scene 解析

`billiards-score/src/app.tsx` 当前是空 class component，加 `onLaunch` lifecycle：
```ts
class App extends Component<PropsWithChildren> {
  onLaunch(options) {
    // scene === 1011 是扫小程序码场景；options.query.scene 是 wxacode 携带的 scene 字段
    const sceneParam = options?.query?.scene
    if (options?.scene === 1011 && sceneParam?.startsWith('m=')) {
      const ms = sceneParam.slice(2)  // 12 字符 matchId 后缀
      // 用 reLaunch 替代 navigateTo，避免 tabBar 路径冲突
      Taro.reLaunch({ url: `/pages/match-detail/index?ms=${encodeURIComponent(ms)}` })
    }
  }
  // ...
}
```

`pages/match-detail/index.tsx` 改成同时支持 `id`（直链）和 `ms`（小程序码后缀）：
```ts
const { id, ms } = router.params
const matchId = id ?? (ms ? await matchApi.byCodeSuffix(ms) : undefined)
```

server 新增 `GET /v1/matches/by-suffix/:ms` → DB `where id LIKE 'm_%${ms}'`
精确匹配（碰撞概率低；两条命中返回 400 让前端回退到首页）。

### 5.8 logo 资源

海报上的「🎱 击球帮 · 战报」角标和小程序码下的 app logo，需要一张 1080×1080
PNG。本期方案：

1. 优先：让 user 出一张高清 logo PNG → 放到 `server/assets/logo.png`
2. 兜底：用 emoji `🎱` 大字 + `击球帮` 中文字符（思源黑体 200px）合成

实现侧 `server/src/match/replay-renderer.ts` 兼容两种：检测 logo 文件存在
→ 用之；否则 fallback 到 emoji + 文字。

### 5.9 「再来一场」按钮本期 placeholder

- `endedOverlay` 三按钮中「🔁 再来一场」点击后 `Taro.showToast({ title: '敬请期待', icon: 'none' })`
- 不隐藏：保留入口让用户感知到这个功能将来会有
- 下一轮：调 `matchApi.create()` 复用相同 `venueId` + 同对手 slot prefill

## 6. 前端设计（admin-web）

admin-web 已有 `Matches/List.tsx` + `Matches/Detail.tsx` + `matchesApi`。
本期增量：

### 6.1 `admin-web/src/api/matches.ts`
新增：
```ts
matchesApi.regeneratePoster(id: string) → POST /admin/matches/:id/poster?force=true
matchesApi.replay(id: string) → GET /admin/matches/:id/replay  // 含 posterUrl, qrUrl, status
```

### 6.2 `admin-web/src/types/index.ts` `MatchDetail`
加字段（与 server schema 对齐）：
```ts
replayPosterUrl?: string | null
replayQrUrl?: string | null
replayGeneratedAt?: string | null
replayStatus?: 'pending' | 'ready' | 'failed'
```

### 6.3 `admin-web/src/pages/Matches/Detail.tsx`
新增「战报海报」卡片：
- 海报 `<Image>` 缩略图（最大 200×360）+ 小程序码缩略图（120×120）
- 状态 Tag（pending / ready / failed）
- 「重新生成海报」按钮（force=true，二次确认）
- 「下载海报」按钮（直接 a tag href）
- 失败时展示 `failedReason`

### 6.4 `admin-web/src/pages/Matches/List.tsx`
列表表格新增「战报」列：
- ready → 缩略图 hover preview
- pending → spinner
- failed → ⚠️ icon + tooltip
- 点击列单元格 → 跳详情

### 6.5 `admin-web/src/pages/Users/Detail.tsx`（可选，本期 TODO）
留位：未来加「战绩」tab 展示 `/admin/users/:id/stats`，本期不做。

## 7. 前端设计（weapp）—— 续

## 8. 阶段化实施

| Phase | 内容 | 工作量 | 风险 |
|-------|------|--------|------|
| **A · 战报视觉重做** | match-detail 整页改写 + 折叠 events log；分享按钮就位（imageUrl 兜底 logo）；server `replay` endpoint（仅 detail 部分） | 半天 | 低 |
| **B · 收尾流改造** | OnlineMode endedOverlay 三按钮；3s 倒计时去掉；「再来一场」placeholder | 半天 | 低 |
| **C-1 · 海报生成后端** | `@napi-rs/canvas` + 字体打包 + 模板绘制 + ali-oss 上传；POST `/v1/matches/:id/poster`；schema migration；on-startup pending 恢复 | 2 天 | 中（字体 / emoji 渲染 / Dockerfile 改）|
| **C-2 · 小程序码集成** | 微信 wxacode.getUnlimited + 写到海报；scene 路由解析（app.tsx + match-detail）；by-suffix 反查接口 | 1 天 | 中（微信 API、scene 长度、需小程序已发版）|
| **C-3 · 前端轮询 + 海报展示** | match-detail 轮询 replay；海报 ready 后切 imageUrl；分享 imageUrl 升级 | 半天 | 低 |
| **C-4 · 战绩接口 + 我页模块** | `/v1/me/stats` 聚合查询 + .stats-card UI | 1 天 | 低 |
| **C-5 · admin-web 集成** | matchesApi 加 regeneratePoster + replay；List 加海报列；Detail 加海报卡片 | 半天 | 低 |

合计 ≈ **5.5 天**。

每阶段独立可发版：
- A 完了就比现在好（视觉清爽 + 能点分享）
- AB 完了用户体验完整（结束自动引导）
- C-1 加完海报真正"动人"
- C-2 闭环传播
- C-3 战绩沉淀

## 9. 风险 / 取舍

| 风险 | 缓解 |
|------|------|
| 海报生成失败 | fallback 到现有 logo cover；不阻塞分享流程；20 次轮询后改成「点击重试」按钮 |
| 用户进战报页时海报还没 ready | 战报骨架数据立刻渲染（玩家/比分/冠军），海报区 LoadingState 占位轮询，不阻塞主体阅读 |
| OSS 域名未在 downloadFile 白名单 | 海报 bucket 复用现有头像 bucket，同域名复用 weapp 已配的 downloadFile 白名单 |
| 字体许可 | Source Han Sans / Noto 都是 OFL/Apache 开源协议，商用 OK |
| 海报 emoji 渲染不稳 | 关键场景（🏆 冠军徽章、🎱 logo）改成 png 图片资源；其余 emoji 字体兜底，渲染异常变方块也能接受 |
| 微信 wxacode 配额 | 一场比赛 1 张码，缓存到 OSS 永久；微信侧无总数上限（`getUnlimited`）|
| 小程序码 scene 字段 32 字符限制 | matchId 用尾 12 字符（碰撞概率 < 10^-15）+ 服务端反查 |
| 小程序码必须正式版 | 开发版用占位 QR；体验版 + 正式版才生成真码（auth/wechat.service 已有 access_token 设施）|
| OSS 容量 | 1 张海报 ≈ 200KB，1 万场 ≈ 2GB；阿里 OSS 可控 |
| 头像可能不愿露 | 「我」页未来加「分享战报时隐藏头像」开关，本期不做，先默认展示 |

## 10. 验证

每阶段独立 changelog，验证 checklist 写到 changelog 里。

整体 acceptance：
- [ ] 联机九球打完一场 → 弹窗三按钮可见
- [ ] 点「查看战报」→ 海报出现 < 3s
- [ ] 「分享战报」→ 微信卡片图就是海报中部 5:4 切片
- [ ] 朋友圈分享 → 朋友圈卡片有海报图
- [ ] 海报底部小程序码 → 长按识别 / 拍照扫码 → 直接进战报页
- [ ] 「我」页 → 战绩模块出现，数据正确
- [ ] 老 match-detail 入口（「我」页历史点条目）→ 进入新版战报页
- [ ] 没登录 / 没头像的玩家 → 海报兜底（emoji 头像或灰色占位圆）

## 11. 不在范围内（明确不做）

- **赛季排行榜 / leaderboard**：依赖大盘数据 + 反作弊，下一轮
- **球友 1v1 PK 历史**：与社交/好友关系绑定，下一轮
- **比赛视频回放 / 高光时刻**：投入产出比低，不做
- **多语言**：项目中文 only
- **H5 战报**：H5 没有微信原生分享 / 小程序码，本期不上
- **战报评论 / 点赞**：社交功能，下一轮
- **「再来一场」自动建房**：上面 phase B 标了 placeholder，实际逻辑下一轮做

## 12. 落地节奏

1. user 看本 PRD → gate（已通过）
2. 按顺序实施：A → B → C-1 → C-2 → C-3 → C-4 → C-5
3. 每阶段一个 commit + 一篇 changelog（`changelog/2026-06-XX-replay-X.md`）
4. C-1 / C-2 在 server 端 → 重新部署 server；C-5 在 admin-web → 重新部署 admin；
   其余只更新 weapp 包
5. weapp 全程：体验版 → 真机回归 → 正式版上线

## 13. 关联

- PRD：`prd/share.md`（分享）
- changelog：`2026-06-02-01-share-features.md`（已落地的分享 hook）
- 未来 PRD：`leaderboard.md` / `pk-history.md` / `replay-comments.md`（不在本期）
