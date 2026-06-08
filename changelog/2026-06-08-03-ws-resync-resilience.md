---
date: 2026-06-08
version: v2.22
title: 联机 WS 断线导致分数不一致 - 兜底同步 + 连接韧性
---

# 联机 WS 断线导致分数不一致 - 兜底同步 + 连接韧性

## 动机（user 反馈）
联机房间计分时 WS 易断,房间内玩家各自显示的分数不一致。

根因(分析结论):架构是**服务端权威 + HTTP 写读 + WS 仅作"去刷新"的通知**,服务端分数
始终一致;"不一致"本质是**显示陈旧**——漏收 WS 通知的那端没去重新拉取就停在旧分数。
放大它的缺陷:① 无兜底刷新;② 半死连接探测不到(只靠 onClose/onError、服务端无主动 ping);
③ 小程序"切前台/网络恢复立即重连"用的是 DOM 事件,weapp 无 DOM 被静默跳过;④ 重连 8 次
放弃;⑤ 心跳 30s 偏大。

## 改动

### P0 — 同步兜底(含 user 明确要求:房间页再次 show 主动拉最新战绩+记录)
- 新建 `billiards-score/src/core/ws/useRoomLiveSync.ts`:
  - `useDidShow`(切回前台/返回该页)→ `kick()` 重连 + 立即 `refresh()` + 重拉历史记录;
  - 可见期间 **12s 兜底轮询**,`useDidHide` 停;
  - 监听 `__ws_open__`(重连成功)→ 强制 `refresh()`,不只依赖 afterSeq 补发。
- 两个联机页 `pages/nine-ball|eight-ball/OnlineMode.tsx` 接入该 hook;
  `MatchHistorySheet` 加 `reloadKey`,页面 show 时若历史面板开着也重拉记录。

### P1 — 连接韧性(`billiards-score/src/core/ws/socket.ts`)
- `installNetworkListeners` 改用跨端 `Taro.onAppShow` + `onNetworkStatusChange` 触发立即重连
  (保留 H5 的 window/document 兜底);`close()` 里 off 掉。
- 心跳 30s → **15s**,压在运营商 NAT 回收窗口内。
- **客户端看门狗**:记 `lastRecvAt`(任何消息含 heartbeat_ack 都刷新),心跳定时器里
  超 40s 无消息 → 判半死,`forceReconnect`(解决 onClose 不触发的半死连接)。
- 新增 `kick()`:清放弃态 + 立即重连,供 `useDidShow` 调。

### P1 — 服务端 ping 看门狗(`server/src/realtime/realtime.gateway.ts`)
- gateway 维护全连接 `Set`,`OnModuleInit` 起 25s 定时:上轮没回 pong 的 `terminate()` 并
  清订阅,否则 `_isAlive=false` 再 `client.ping()`(用上原本写了没人读的 `_isAlive`);
  `OnModuleDestroy` 清定时器。回收半死连接,不再往死 socket 广播。

### 离开房间即关 WS（user 建议）
- 两个联机页卸载(出栈)时改为 `closeMatchSocket()`(原来只 `unsubscribeMatch`、保留全局连接)。
  C 端同一时刻只在一个房间,离开关掉避免留下空闲/半死连接;再进房间 `useEffect` 重新建连 +
  `subscribe(afterSeq)` + `useDidShow` refresh 保证全新且对齐。注:navigateTo 跳子页只是隐藏
  房间页、不卸载,不会触发关闭。

### P2 — 配置注释纠正
- `deploy/Caddyfile`:澄清 `transport.keepalive` 管的是 caddy↔上游连接池、与客户端 WS 存活
  无关(WS 存活靠应用层心跳)。无功能改动。

## 一致性说明
服务端是唯一权威源(重放 matchEvent 算分),`refresh()` 幂等全量覆盖。只要"有变化/重连后/
回前台/定时"任一触发 refresh,各端必收敛到同一状态。本次提供四重触发 + 减少触发不了的时间窗,
无需客户端增量合并/去重。

## 验证
- server `nest build`、weapp `build:weapp:prod` 通过。
- 真机两台同房:A 计分 → B 即时看到;B 飞行模式数秒再恢复 → 十几秒内(轮询/重连)分数对齐;
  B 切后台再回房间页 → 立即刷新成最新;离开房间再进 → 全新连接 + 状态对齐。
- server 日志:ping 看门狗能 terminate 死连接,订阅表不堆死 socket。

## 部署
- server 重 build 镜像 + 重启;weapp 重打 dist 上传。无 DB 变更。

## 关联
- 分析见会话;后续可选(P2):计分 clientSeq 幂等去重;多副本扩容前上 Redis pub/sub 跨实例广播。
