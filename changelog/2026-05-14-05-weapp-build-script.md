---
date: 2026-05-14
version: v2.20.x
title: build:weapp:prod 脚本 + 域名注入（治 weapp dist 落 localhost）
---

# build:weapp:prod 脚本 + 域名注入（治 weapp dist 落 localhost）

## 动机

`npm run build:weapp` 直接打出的 dist 里 API 域名是 `http://localhost:3001/v1`、WS 是 `ws://localhost:3001/ws`，原因是 `core/api/config.ts` 的 `resolveBase()` 在非 web 环境（weapp / native）的 fallback 是 localhost；而 `config/index.js` 的 `defineConstants` 是从 `process.env.TARO_APP_API_BASE` 注入，发版打包时没有人 export 这两个变量。

## PRD / 设计变化

- 对应 `prd/weapp-adaptation.md` §4。
- `DEPLOY.md` 常见问题区追加两条 Q&A（小程序请求落 localhost / H5 拆 API 域名部署）。
- `docs/01-客户端说明文档.md` §7.1 新增「小程序发版步骤」5 步流程。

## 代码变化

- 新增文件：无
- 修改文件：
  - `billiards-score/package.json`：
    - `scripts.build:weapp:prod`：cross-env 注入生产域名后跑 `taro build --type weapp`
    - `scripts.build:h5:prod`：同样思路，给 H5 拆 API 域名部署用
    - `devDependencies.cross-env`：`^10.1.0`
  - `billiards-score/package-lock.json`：cross-env 及其依赖
  - `DEPLOY.md`：常见问题 +2 条
  - `docs/01-客户端说明文档.md`：+§7.1 发版步骤
- 删除文件：无

`build:weapp`（不带 `:prod`）保留 dev 行为，便于本机调试连本地 server。生产域名变更时改 `package.json` 的 prod 脚本一处即可。

## 验证步骤

- [ ] `npm run build:weapp:prod` 通过
- [ ] 微信开发者工具打开 `dist/`，真机预览 → DevTools Network 看到接口走 `https://billiards-server.macrobit.com.cn/v1`
- [ ] `npm run build:weapp`（不带 `:prod`）→ dist 里 `API_BASE_URL` 仍是 localhost（dev 调试用）
- [ ] `npm run build:h5` 在同源部署下接口走 nginx `/v1`（不指定环境变量时走 `window.location` 同源）

## 遗留问题 / 已知限制

- 小程序 appid / 业务域名白名单需在微信公众平台后台手动配置，不是代码改动。
- 真机调试时如果电脑 IP 变化，目前还需要改 `core/api/config.ts` 的 fallback 或 export 环境变量；后续可以加一个 `.env.local` 注入方案。
