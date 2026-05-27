# 击球帮 · 微信小程序适配技术方案

> **版本：** v2.20.x（小程序适配补丁）
> **更新时间：** 2026-05-14
> **状态：** 设计中（等用户 review）
> **范围：** 仅 `billiards-score`（C 端 Taro 工程），不涉及 admin / server。

本文档承接 `billiards-match-app-prd-v2.10.md`，把 C 端跑到微信小程序时暴露的 4 个共性问题落地成可执行方案。每一项都尽量"两端通吃"（weapp + h5），避免给小程序写一份、给 H5 再维护另一份。

---

## 0. TL;DR

| # | 问题 | 方案 | 影响面 |
|---|------|------|--------|
| 1 | 静态图片是 `.svg`，weapp 编译后渲染不出来 | tabBar 等小程序原生消费的图标改为 `.png`（@2x，PNG-32），统一放 `src/assets/tabs/` | tabBar 4 张图、`app.config.ts` 引用 |
| 2 | `styles/global.scss` 用 `:root { … }` 声明 CSS 变量，weapp 拿不到 | 改用 `page { … }`；H5 端 `page` 同样合法（Taro 把 `<TaroPage>` 编译成根容器） | 1 个文件 |
| 3 | weapp / h5 偶发"整页被缩放" | designWidth 维持 375 + deviceRatio 三档；显式给 `page` 兜底 `font-size: 32rpx`；禁止业务 scss 出现 `html { font-size }`、`body { zoom }`；项目内统一 px（由 pxtransform 处理），不混用 rem/rpx | 1~2 个文件 + 约定 |
| 4 | `npm run build:weapp` 没注入域名，`API_BASE_URL` 落到 `localhost:3001` | 增 `build:weapp:prod` 脚本（cross-env 注入 `TARO_APP_API_BASE` / `TARO_APP_WS_BASE`），并在 `.env.example` 同步生产域名 | `package.json`、文档 |

---

## 1. 静态图片 SVG → PNG

### 1.1 现状

`src/assets/tabs/` 下 4 个 svg：

```
home.svg / home-active.svg
me.svg   / me-active.svg
```

被 `app.config.ts` 的 `tabBar.list[].iconPath` / `selectedIconPath` 引用。

### 1.2 问题

微信小程序 `tabBar.iconPath` 官方只接受 PNG / JPG（[文档][weapp-tabbar]）；Taro 把 svg 当二进制文件原样拷贝过去，宿主显示空白或编译告警。`<Image src="...svg" />` 同理：weapp 的 Image 组件不识别 svg。

[weapp-tabbar]: https://developers.weixin.qq.com/miniprogram/dev/reference/configuration/app.html#tabBar

### 1.3 方案

1. 用现有 svg 渲染出 81×81 PNG-32（带透明），文件名保持一致：
   - `home.png` / `home-active.png` / `me.png` / `me-active.png`
   - 81×81 是微信推荐尺寸（建议范围 81×81 ~ 162×162，文件 < 40KB）。
2. 替换 `app.config.ts` 里 4 处引用扩展名 `.svg → .png`。
3. 删除 4 张 svg，避免双源。
4. 后续如果 C 端组件内部要用矢量图，改用 `@nutui/icons-react-taro` 之类的字体图标，或在 H5 走 svg / weapp 走 PNG fallback；本次只处理 tabBar。

### 1.4 验收

- weapp 预览：tabBar 4 个图标正常显示、active 切换正确。
- H5 预览：4 个图标正常显示。
- 文件夹下不残留 svg。

---

## 2. global.scss `:root` → `page`

### 2.1 现状

```scss
:root {
  --primary: #1a2f23;
  // ...
}
```

### 2.2 问题

微信小程序的 wxss 没有 HTML，`:root` 选择器在 wxss 里不生效（Taro 4 + webpack5 编译时不会把它替换成 page）。结果：所有 `var(--primary)` 在 weapp 端拿到 fallback 或空值，全局深绿背景丢失。

### 2.3 方案

```scss
page {
  --primary: #1a2f23;
  --primary-light: #2d4a3a;
  // ...
  background-color: var(--bg-dark);
  color: var(--text-primary);
  min-height: 100vh;
}
```

- weapp：`page` 是宿主提供的根选择器，等价 H5 的 `:root`。
- H5：Taro h5 把 page 编译成 `taro-page-core` 之类的根容器，CSS 变量沿 DOM 树继承，子节点照常使用。
- 已有的 `page { background-color … }` 块合并到同一个 `page` 选择器，避免重复。

### 2.4 验收

- weapp 预览：首页 / 我的页背景色为深色（不是默认白底）。
- H5 预览：背景色无回归。
- DevTools 检查 `var(--primary)` 在两端都解析到 `#1a2f23`。

---

## 3. 字号缩放治理

### 3.1 现状

- `taro.config.ts` / `config/index.js` 都设了 `designWidth: 375`，`deviceRatio { 375:1, 812:1, 414:1 }`。
- 业务样式遍布 `font-size: 11px ~ 48px` 的写法，依赖 Taro 的 pxtransform。
- 现象：weapp 在部分机型上整页"被缩放"；H5 偶发同样问题。

### 3.2 根因（候选）

1. **deviceRatio 的设计宽度匹配落空**：实际机型宽度不在 `375 / 812 / 414` 这三档里时，pxtransform 用插值算缩放系数，整体看起来"放大/缩小一档"。
2. **`page` / `body` 没显式 `font-size`，宿主默认值不一致**：weapp 默认 16px；H5 默认 16px；但 H5 在某些 webview 里被"用户字号偏好"接管（系统设置里把字体调大）。
3. **`<meta viewport user-scalable=no>` 在 iOS Safari 上仍可能因双指/系统辅助功能放大**（已在 index.html 设了 `user-scalable=no`，但这条只对部分设备生效）。

### 3.3 方案（保守，分两步）

**第一步（本次落地）：**

1. 给 `page` 兜底字号，weapp 端用 rpx 写死，避免被宿主默认 font-size 漂走：

   ```scss
   page {
     font-size: 32rpx; // 750 设计稿基准下的 16px 等价
     -webkit-text-size-adjust: 100%;
     text-size-adjust: 100%;
   }
   ```

   - `text-size-adjust: 100%`：禁用 iOS Safari / 部分安卓 webview 的"自动放大文字"行为，是 H5"偶发缩放"最常见根因之一。
2. 业务样式继续写 `px`，**禁止**出现：
   - `html { font-size: ... }` —— 会和 Taro h5 注入的 rem 基准打架。
   - `body { zoom: ... }`、`transform: scale(...)` 用于全屏缩放。
   - `font-size: 1rem / 0.5rem` 这种 rem 写法（Taro 4 不再推荐 rem 方案）。
3. `taro.config.ts` 的 `mini.postcss.pxtransform.config` 加 `selectorBlackList: ['nut-']`（如果引入 NutUI），先占位，后续若引第三方组件库再启用。
4. 在 `docs/01-客户端说明文档.md` 末尾追加一节"字号约定"，把上面 3 条写进去。

**第二步（观察期，不在本次合并）：**

- 收集真机截图（机型 + 浏览器版本 + 截图）建一个表，看是否仍偶发。
- 如果第一步未根治，再考虑：
  - 切 designWidth 750 + 全量 rpx（迁移成本大，约 30 个 scss 文件）；
  - 或在 `app.tsx` `componentDidShow` 里强制 `Taro.setEnableDebug` + 上报 `getSystemInfo` 的 `pixelRatio / fontSizeSetting` 做诊断。

### 3.4 验收

- weapp 预览：iPhone 13 / iPhone SE / Android Pixel 三档机型，字号视觉一致（不缩放）。
- H5 预览：Safari iOS 系统设置"加大字体"开到最大，页面不再整体放大（会保持设计字号）。
- 现有 `font-size: Npx` 的视觉无回归。

---

## 4. weapp 打包脚本 + 域名注入

### 4.1 现状

```json
"build:weapp": "taro build --type weapp"
```

打出的 `dist/` 里：

```ts
// resolveBase() 在 weapp 环境（非 web）走默认分支：
return { api: 'http://localhost:3001/v1', ws: 'ws://localhost:3001/ws' }
```

线上发版直接死。

### 4.2 方案

**4.2.1 增脚本**

```json
{
  "scripts": {
    "build:weapp": "taro build --type weapp",
    "build:weapp:prod": "cross-env TARO_APP_API_BASE=https://billiards-server.macrobit.com.cn/v1 TARO_APP_WS_BASE=wss://billiards-server.macrobit.com.cn/ws taro build --type weapp"
  },
  "devDependencies": {
    "cross-env": "^7.0.3"
  }
}
```

- 默认 `build:weapp`（不带 prod）保留 dev 行为：仍指向 localhost，便于本地真机调试时连本地服务（手机和电脑同 Wi-Fi 时改成 IP，由用户自己 export 环境变量覆盖）。
- `build:weapp:prod` 是发版用的，写死生产域名。线上域名变更时改这一处即可。
- H5 同样补一条 `build:h5:prod`，对齐。

**4.2.2 sanity check**

`config/index.js` 的 `defineConstants` 已经有：

```js
'process.env.TARO_APP_API_BASE': JSON.stringify(process.env.TARO_APP_API_BASE || '')
'process.env.TARO_APP_WS_BASE': JSON.stringify(process.env.TARO_APP_WS_BASE || '')
```

环境变量为空字符串时 `resolveBase()` 走默认分支；非空时直接用。逻辑无需动。

**4.2.3 文档**

- `docs/01-客户端说明文档.md`：补"小程序发版步骤"小节（5 步：装依赖 → `build:weapp:prod` → 微信开发者工具打开 dist → 真机预览 → 上传体验版）。
- `DEPLOY.md`："常见问题"补一条："Q: 小程序请求落到 localhost？A: 用 `build:weapp:prod` 打包，或自己 export 域名变量后再 `build:weapp`。"

### 4.3 验收

- `npm run build:weapp:prod` → 微信开发者工具打开 `dist/`，真机预览能拉到 `https://billiards-server.macrobit.com.cn/v1` 的接口。
- `npm run build:weapp`（不带 prod）→ dist 里依然是 localhost（dev 调试用）。
- `package-lock.json` 有 `cross-env`。

---

## 5. 落地顺序与 changelog

每一项一条 commit，逐一对应 `changelog/2026-05-14-NN-*.md`：

1. `2026-05-14-01-weapp-prd.md` —— 本 PRD 落地说明
2. `2026-05-14-02-weapp-tab-icons-png.md` —— SVG → PNG
3. `2026-05-14-03-weapp-global-page-selector.md` —— `:root` → `page`
4. `2026-05-14-04-weapp-font-size-baseline.md` —— 字号兜底 + text-size-adjust
5. `2026-05-14-05-weapp-build-script.md` —— `build:weapp:prod` + cross-env

## 6. 不在本次范围

- 小程序 appid / 域名白名单（需用户在微信公众平台后台手动加白）。
- ~~微信小程序登录链路改造~~ → 移交 [`prd/legal-mvp.md`](./legal-mvp.md)（含隐私协议同意 + 微信直登路径）。
- 第三方组件库（NutUI 等）引入。
- iOS / 安卓真机字号体验优化（第二步）。
