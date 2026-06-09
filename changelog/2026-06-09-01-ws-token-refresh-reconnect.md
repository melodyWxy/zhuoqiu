---
date: 2026-06-09
version: v2.22
title: 修复联机 WS 断线后"一直重连不上"(token 过期未刷新)
---

# 修复联机 WS 断线后"一直重连不上"(token 过期未刷新)

## 动机（user 反馈）
房间内 WS 断开后,顶部出现"重新连接"提示,点了一直连不上。

## 根因(已确认)
不是服务端释放了旧连接,而是**新连接的鉴权 token 过期被拒**:
- WS 用 `?token=accessToken` 连接,token 取自 store、connect 时取一次、**从不刷新**。
- access token 只有 15 分钟(`JWT_ACCESS_TTL`)。挂后台/离开/断网超过该时长即过期。
- 服务端校验失败 → `close(4001)`(`realtime.gateway.ts`)。
- 客户端把 **4001 当"永久放弃、不再重连"**(`AUTH_CLOSE_CODES`);手动"重新连接"仍用
  store 里那个**没变的过期 token** → 又 4001 → 循环,且每次瞬间失败。
- HTTP 的 `callApi` 在 401 时会 `refreshAccessToken` 换新 token,但 **WS 完全没接这套**。

## 改动(`billiards-score`)
- `core/api/client.ts`:导出 `refreshAccessToken`(单飞刷新 + 写回 store),供 WS 复用。
- `core/ws/socket.ts`:
  - 把 **4001 从"永久放弃"改为"刷新 token 再重连"**:`onClose` 收到 4001 → `handleTokenClose()`
    → `refreshAccessToken()`;拿到新 token 就 `kickReconnect()`(connect 会读到刚刷新的 token),
    刷新失败(refresh token 也失效=真登出)才 `giveUp('登录已过期，请重新登录')`。
  - `MAX_AUTH_REFRESH=2` 兜底,防服务端持续 4001 时死循环;`onOpen`/`reset`/`kick` 重置计数。
  - `AUTH_CLOSE_CODES` 收窄为 `{4003, 1008}`(forbidden/policy 仍直接放弃)。

## 效果
- token 过期导致的断线现在能**自动刷新 + 重连**,不再卡在"一直连不上";只有真正登录失效
  才提示重新登录(文案明确)。
- 与上一轮(12s 兜底轮询 + 看门狗 + onAppShow 重连)叠加:断线在多数情况下静默自愈。

## 验证
- weapp `build:weapp:prod` 通过。
- 复现验证:房间挂置 >15min 让 token 过期 + WS 掉线 → 应自动刷新并重连成功(而非红条);
  断开极久(refresh token 也失效)→ 提示"登录已过期，请重新登录"。

## 部署
- 纯 weapp 改动,重打 dist 上传即可,server 无需变更。

## 关联
- 上一篇:`changelog/2026-06-08-03-ws-resync-resilience.md`
