---
date: 2026-06-04
version: v2.22
title: 领奖台名次改回 1/2/3 + 发现球房省市区筛选失效诊断
---

# 领奖台名次改回 1/2/3 + 发现球房省市区筛选失效诊断

## 1. 领奖台名次改回 1/2/3（代码改动）

之前把三人领奖台台座的 1/2/3 改成了「冠/亚/季」，上线后发现**台座名次空白**——
中文字在生产容器的 CJK 字体下没渲染出来（数字一直正常，因为走 Oswald）。

`server/src/match/replay-renderer.service.ts`：
- 台座 label `冠/亚/季` → `1/2/3`
- label 字体 `CJK Bold` → `Oswald700`（和大比分同字体，容器里必出）
- 同步设计稿 `design/poster-mockups/gallery-podium.html`

> ⚠️ 需重新 build server 镜像 + force 重新生成海报才能看到。

## 2. 发现球房「省市区筛选点不了」诊断（结论：服务端配置，非代码 bug）

现象：发现球房页三个省/市/区筛选 Picker 点不动，静默无反应。

根因（已用生产接口验证）：
```
GET https://billiards-server.macrobit.com.cn/v1/regions
→ HTTP 500 {"code":90001,"message":"服务异常，稍后再试"}
```
- 链路：`useRegions()` → `regionsApi.list('/regions')`。`RegionsService` 实时调
  **腾讯地图行政区划 API**，需要 `TENCENT_MAP_KEY`（`configuration.ts` 默认空串）。
- key 未配 → 抛 `'TENCENT_MAP_KEY 未配置'`；或 key 失效 / SN 签名(sk)不匹配 /
  腾讯接口失败，且冷启动无缓存 → `/regions` 500。
- 客户端 `callApi('/regions', { toast:false })` catch 后 `setTree([])`，三个 Picker
  `disabled={length===0}` → 静默禁用。同一个 500 也会让**球房入驻**的地区选择失效。

引入版本：v2.21 `94d0343`，与本期海报/登录改动无关。

### 修复（运维侧，不改代码）
生产 server 注入环境变量后重启容器（env 是运行时注入，无需重 build 镜像）：
- `TENCENT_MAP_KEY=<腾讯位置服务 key，需开通行政区划 WebServiceAPI>`
- `TENCENT_MAP_SK=<签名密钥>` —— 仅当该 key 开了 SN 签名校验时配，否则留空
- 验证：`/regions` 返回 `{tree:[...]}` 即恢复

> 本次按 user 决定：先只配 key，不在代码侧加兜底（regions 为空时仍是静默禁用）。
> 后续若想更稳，可加：前端「加载失败·点击重试」态，或后端内置静态省市区兜底。

## 关联
- 上一篇：`changelog/2026-06-04-01-weapp-login-copy-dewechat.md`
