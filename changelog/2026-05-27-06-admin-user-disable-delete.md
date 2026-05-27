---
date: 2026-05-27
version: v2.20.x
title: 管理端用户管理增加禁用/启用/删除快捷操作
---

# 管理端用户管理：禁用 / 启用 / 删除

## 动机
之前 `/admin/users` 列表页只能跳到详情页才能封禁/解封；删除功能缺失（合规上要求"用户申请注销 → 真删"，运营上要求能直接清理测试账号）。本次把三个操作都收进列表行内 + 详情页保留入口。

## 代码变化

### 服务端（`server/src/admin/users-admin-write.controller.ts`）
新增 **`POST /admin/users/:id/delete`**（`@Roles(super_admin)`）：

- 拒绝删除 `u_system` 占位账号
- 事务内顺序：
  1. `upsert u_system`（不存在则建，状态 banned）
  2. `phone_verify_codes` 按 phoneNumber 删（不在 user 上有 FK）
  3. `tournament_registrations` 删除（避免唯一键冲突）
  4. `match_players.userId` / `match_events.actorUserId` 置 NULL（schema 本来就是 nullable）
  5. `matches.ownerUserId` 转给 `u_system`（owner 必填、无 cascade）
  6. `DELETE FROM users` —— `wechat_bindings` / `douyin_bindings` 走 schema 的 `onDelete: Cascade`
- audit log 记录 reason + 删除前快照（nickname / phone / source / createdAt）

DTO：`DeleteUserDto { reason: string }`

### 客户端（`admin-web`）

- `src/api/users.ts` —— `usersApi.remove(id, reason)`
- `src/pages/Users/List.tsx`：
  - 加 `操作` 列（fixed: right, width 200），3 个按钮：
    - 状态 `active` → "禁用"（reuse `ban(id, 0, '管理员禁用')`，简单 Modal.confirm）
    - 状态 `banned` → "启用"（`unban(id, '管理员启用')`）
    - 任意状态 → "删除"（仅 super_admin，二次确认 Modal：reason 必填 + 输入 user id 字面匹配才放行）
- `src/pages/Users/Detail.tsx`：
  - 顶部右上角加 "删除" 按钮，同样的二次确认逻辑；删除成功后 navigate 回列表

权限：
- 禁用 / 启用：`super_admin` / `operator` 都能做
- 删除：仅 `super_admin`

## 验证步骤
- [x] `server: npx tsc --noEmit` 通过
- [x] `admin-web: npx tsc --noEmit` 通过
- [ ] 部署后端 → 管理后台 → 用户列表：操作列出现 3 个按钮
- [ ] 用 super_admin 跑一遍：禁用 → 状态变"封禁"+ 列表按钮变"启用" → 启用回到"正常"
- [ ] 删除：弹窗输入错误 user id → 拒绝；输入正确 + reason → 提交成功 → 列表里该行消失
- [ ] 用 operator 角色：删除按钮 disabled
- [ ] 删除一个有 ownedMatches 的用户后，比赛仍在，owner 显示"系统"昵称
- [ ] 同手机号被删后，C 端用同号短信验证码重新登录 → 创建新 user 行 OK
- [ ] audit_logs 表有对应 `user.delete` 记录，detail 含 reason + snapshot

## 上线必做
- 服务器：`git pull && docker compose up -d --build server` —— 不需要 prisma migrate（schema 没改）
- 管理后台 H5：`docker compose up -d --build admin`

## 遗留问题 / 已知限制
- 不区分"用户主动注销"和"管理员强删"两种语义；都走同一接口、都真删，audit 只能靠 reason 文本区分
- `u_system` 占位账号一旦被建出来后会一直留在 users 表里。它的 `phoneNumber=null / status=banned`，不会被 list 页面默认筛选过滤掉；如果想彻底隐藏，可以在 `/admin/users` list 里加 `where id != 'u_system'` 过滤
- 如果某个用户的所有 `match_players` 都被置空了（即只有该用户参与的比赛），比赛里会出现"无参与者"的孤儿行；目前不做清理，等运营反馈再说
- 删除后如果该用户在某场赛事的 bracket 里被列为参赛者（`tournament_bracket_match`），不会自动重排；若要支持需要补 bracket 重组逻辑
