---
date: 2026-06-03
version: v2.22
title: 战报海报视觉重做（B 版·动感对阵 + 三人领奖台）
---

# 战报海报视觉重做（B 版·动感对阵 + 三人领奖台）

## 动机

上一轮海报重做后 user 仍觉得「生成的战报图有点丑」。这次先聊方法论再动手：
手写 canvas 坐标的范式天花板低，决定走「**HTML/CSS 出目标稿 → 浏览器调到满意 →
拍板 → 落地到后端渲染**」。

- 渲染引擎本来想用 Satori，规划时发现镜像里的 `font-noto-cjk` 是 `.ttc` 合集、
  Satori 读不了，得额外打包 ~8MB 中文字体 + 接 Twemoji。权衡后 user 选**路线 2：
  用现有 `@napi-rs/canvas` 复刻**——镜像里中文/emoji 字体现成、零新依赖、最轻最稳，
  海报效果与 Satori 一致。
- 出了 A（暗金殿堂）/ B（动感对阵）两版，user 选 **B**。
- user 补充：**九球三人追分是高频场景**，单独出领奖台稿并落地。
- 文案改成**按分差智能选词**（不再重复巨大比分）。
- 联调中补上 **平局**（时间到、比分相同）这个真实场景。

设计稿（可在浏览器打开对比）：
- `design/poster-mockups/gallery.html` — A / B 两版对比
- `design/poster-mockups/gallery-b-variants.html` — B 版极端数据压力测试
- `design/poster-mockups/gallery-podium.html` — 三人领奖台（含装饰）

## 代码变化

### 1. 渲染器整体重写为 B 版（`server/src/match/replay-renderer.service.ts`）

`RenderInput` 接口保持不变，`replay-job.service.ts` 无需改动。三种布局分支：

- **1v1 对阵**：斜切撞色背景（冷蓝 vs 暖紫，用 `--slot-1/2` 色）、圆角方头像微旋转、
  中间金边 VS 徽章、Oswald 条形大比分（冠军金 / 对手紫）、`pickVerb` 一句话
  verdict（冠军名描金）、胶囊 chips（来自 `narrative.subline`）、底部品牌 + 二维码。
- **三人领奖台（`players.length === 3`）**：见下条。
- **四人及以上**：冠军 hero 大卡 + 名次行列表，可自适应放下几行，超出聚合成
  「其他 N 名玩家」。

比分两位数自动从 340px 缩到 240px（`.wide`），名字按宽度截断加省略号。

### 2. 字体：新增 Oswald 静态字重（`server/assets/fonts/`）

- `Oswald-{500,600,700}.ttf`（仅拉丁，约 270KB）给大比分那种「运动条形字」用。
  由 Oswald 可变字体本地 instancer 切出（`@napi-rs/canvas` 不认可变字重轴）。
- 中文继续用系统 `NotoSansCJK`（dev fallback PingFang），emoji 用系统 emoji 字体。
- `ensureFonts()` 同时注册系统中文 + 仓库 Oswald，字体路径覆盖 dev(`cwd=server`)
  与 prod(`cwd=/app`)。

### 3. 三人追分领奖台（podium）

冠军居中抬高、亚军银色居左、季军铜色居右，**台座高度即名次**。装饰（全部 canvas 矢量绘制）：

- 冠军身后**金色放射光芒**（细三角扇形，外圈渐变淡出）
- **飘落彩色纸屑**（固定布点，保证渲染可复现）
- 冠军**光环** + **矢量皇冠**（不依赖 emoji 字体）+ **四角星芒**
- 台座**金/银/铜**淡色渐变 + 描边 + 3D 顶面椭圆
- 台座名次标签 **冠 / 亚 / 季**（user 要求，从 1/2/3 改）

### 4. 智能选词 + 平局（`server/src/match/replay-narrative.ts`）

- 新增 `pickVerb(diff)`：`<=0 战平 / 1 险胜 / 2-3 力克 / 4-6 战胜 / >=7 大胜`。
- `computeNarrative` 1v1 headline 去掉重复比分：`A 力克 B`；平局 `A 与 B 战平`。
- 渲染器平局**对称处理**：不给任一方金色 WINNER，两侧比分同为金色，标签都标「平局」，
  verdict「A 与 B 战平」白字 + 战平描金。

### 5. 修复：真实头像的 await 链（重要）

重写时一度断了 `drawAvatar`（`loadImage` OSS 头像）的 await 链——`render` 调
`drawDuel/drawPodium/drawLeaderboard` 及其内部 `drawAvatar` 都没 await，null 头像
（同步绘制）测不出，但**真实 OSS 头像会在 `toBuffer()` 之后才画 → 头像丢失**。
已把整条链改回 `await`，并用本地 http 头像验证图片正确绘入。

### 6. 其他

- `server/Dockerfile`：builder + runner 两阶段都 `COPY assets`，把 Oswald 字体带进镜像。
- `server/scripts/poster-preview.ts`：脱离 DB/OSS 的渲染预览工具，覆盖
  1v1 / 平局 / 超长名+两位数 / 三人 / 三人超长名 / 四人 / 八球 7 个场景，输出到 `/tmp`。

## 部署

- server 重新 **build Docker 镜像**（带上 `assets/fonts`），重启生效。
- 想看新海报：admin 后台 → Matches Detail → 「重新生成海报」。
- 24h 内已 ready 的海报会复用，验证时用 force 重新生成。

## 关联

- PRD：`prd/match-replay.md`
- 上一轮：`changelog/2026-06-03-01-replay-followup-fixes.md`
