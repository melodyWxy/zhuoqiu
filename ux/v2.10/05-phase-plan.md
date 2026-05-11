# v2.10 实施阶段 & 里程碑

> 配套 PRD：`prd/billiards-match-app-prd-v2.10.md` §8-§9
> 目标：把"入驻 + 报名制单败赛事完整闭环"拆成可验证的阶段，每阶段独立可 demo

---

## 阶段划分

```
P0: schema & 商家登录      ────▶  后端能跑，商家账号可创建
P1: 入驻申请 & 平台审核    ────▶  老板自助提交 → admin 通过 → 生成 venue
P2: 商家店铺资料 & C 端球房列表 ▶  C 端能看到已入驻球房
P3: 赛事 CRUD & 报名       ────▶  商家发赛事，C 端报名
P4: bracket 生成 & 开赛    ────▶  满员开赛生成赛程
P5: 赛事局计分 & bracket 推进 ──▶  赛事比赛和 v2 联机计分打通
P6: E2E 串测 & 体验打磨     ────▶  提交 v2.10 发布
```

每个阶段完成即 commit + changelog + 小 demo（browse/截图）。

---

## P0 schema & 商家登录（~1 天）

**后端**
- [ ] Prisma 加三张表 + 三个 enum（VenueAccount / Venue / VenueApplication）
- [ ] Migration 1: `add_venue_account_and_venue`
- [ ] `VenueAuthModule`: 手机号+验证码登录，JWT type=venue_account
- [ ] `VenueAccountController`: 注册、登录、/me
- [ ] Seed: 1 个开发用 owner（phone=13900000001）

**admin-web**
- [ ] 登录页支持识别账户类型（platform_admin vs venue_account），后端返回 type 字段
- [ ] 角色路由骨架：未入驻 → /apply，已入驻 owner → /venue，admin → /admin

**验证**
```
✓ POST /v1/venue-auth/sms/send + verify 能换到 venue_account JWT
✓ GET /v1/venue-auth/me 返回当前商家账号
✓ admin-web 登录后按类型分支菜单
```

## P1 入驻申请 & 平台审核（~1.5 天）

**后端**
- [ ] `VenueApplicationController`: submit / get / list / approve / reject
- [ ] 通过时事务：创建 Venue + 绑定 applicant 为 owner + 写 audit log
- [ ] OSS 直传 STS 签名接口（`/v1/upload/sign`）；先支持腾讯云 COS 或本地 mock

**admin-web 商家侧**
- [ ] /apply 引导页 + /apply/form 表单（分步或单页均可）
- [ ] 图片上传组件（直传 OSS）
- [ ] /apply/status 状态页（pending/rejected 都在这个路由）

**admin-web 平台侧**
- [ ] /admin/venue-applications 列表 + 详情 + 审核动作
- [ ] 站内信（复用现有 audit_logs + notification？没有就简化为站内消息 skip）
- [ ] 短信通知（复用 SMS 模块，driver 先 dev mock）

**验证**
```
✓ 老板提交申请 → DB 有 pending 记录
✓ admin 通过 → venue 创建 + state=approved
✓ 老板再次登录 → 直接跳 /venue/overview
✓ 驳回 → 老板看到驳回原因，可修改后重新提交
```

## P2 店铺资料 & C 端球房列表（~1 天）

**后端**
- [ ] `VenueController` 公开接口：list / detail
- [ ] `VenueController` 商家接口：updateMyVenue（只允许 owner）

**admin-web 商家侧**
- [ ] /venue/overview 概览页
- [ ] /venue/profile 资料编辑页

**C 端**
- [ ] 底部 Tab 重构为 `首页 / 球房 / 赛事 / 我的`
- [ ] /pages/venues/index 列表
- [ ] /pages/venue-detail/index 详情

**验证**
```
✓ C 端能看到已通过审核的球房列表
✓ 球房主页展示店铺信息
```

## P3 赛事 CRUD & 报名（~1.5 天）

**后端**
- [ ] Migration 2: `add_tournament`
- [ ] `TournamentModule`: 发布 / 草稿 / 报名 / 取消报名
- [ ] 业务约束：报名人数 ≤ maxPlayers，报名期内，state=registering
- [ ] WS 推：报名增减广播给商家控台

**admin-web 商家侧**
- [ ] /venue/tournaments 列表
- [ ] /venue/tournaments/new | /:id/edit 表单
- [ ] /venue/tournaments/:id Tab 布局（信息 / 报名 / 赛程）
- [ ] 报名 Tab：名单列表 + [取消] + [开赛]

**C 端**
- [ ] /pages/tournaments/index 列表
- [ ] /pages/tournament-detail/index 详情（Tab：信息 / 赛程 / 报名名单）
- [ ] 报名确认弹窗 + 未登录弹 LoginSheet 然后续

**验证**
```
✓ 商家发布赛事 → C 端列表能看到
✓ 用户报名 → 商家报名列表实时出现（WS）
✓ 用户取消报名 → 状态回滚
```

## P4 bracket 生成 & 开赛（~1 天）

**后端**
- [ ] `TournamentService.startTournament`:
  - 校验 state=registering, 报名人数 ≥ min
  - 按 seed 生成单败 bracket（补 BYE 到 2^n）
  - 写 tournament_bracket_matches 全部空对阵
  - state → in_progress
- [ ] `BracketService.getTree(tournamentId)`: 返回整棵树
- [ ] `BracketService.resolveNext`: 单场 completed 后推进逻辑

**admin-web**
- [ ] 赛程 Tab：bracket 可视化（纵向 round，横向 slot）
- [ ] 对阵卡操作菜单：[开始] [判负] [查看]

**C 端**
- [ ] 详情 / 赛程 Tab：读树渲染
- [ ] "我的对阵"高亮

**验证**
```
✓ 16 人开赛 → 8 首轮对阵生成
✓ 6 人开赛 → 2 BYE，首轮 4 真实对阵
✓ C 端赛程能正确渲染
```

## P5 赛事局计分 & bracket 推进（~1.5 天）

**后端**
- [ ] `TournamentService.openBracketMatch(bracketId)`:
  - 创建 Match（复用 MatchService，加 venueId / bracketMatchId）
  - 两个 slot 自动占位报名者
  - bracket.state = in_progress
- [ ] `MatchService.endMatch` hook：
  - 若有 bracketMatchId → 回写 bracket.winnerRegistrationId + state=completed
  - 触发 resolveNext：若本轮全部 completed，生成下轮对阵
  - 若是最后一轮 → tournament.state = completed
  - WS 推 `tournament:{id}` 带 nextMatch 信息

**admin-web 现场控台**
- [ ] /venue/tournaments/:id/live 现场控台页
- [ ] 点"开始比赛" → 跳赛事场景的大屏记分

**C 端**
- [ ] /pages/nine-ball 检测 `match.tournamentBracketMatchId` 非空 → 顶部赛事横幅
- [ ] 我的对阵点击 → 直接进 match 页

**验证**
```
✓ 商家开启 R1 某场 → 两方收到 match 开局 WS
✓ 记分完成 → bracket 回填 → R2 对应位置自动填入 winner
✓ 最后一场 → 赛事 completed → 冠军页
```

## P6 E2E 串测 & 打磨（~1 天）

- [ ] 8 人端到端 smoke：4 人 owner + 4 个 C 端用户全链路
- [ ] 边界：弃权 / 延长报名 / 取消赛事
- [ ] 视觉打磨：赛程树响应式、现场控台大字号
- [ ] 文档：更新 admin 后台用户手册 section

---

## 预估时间

| 阶段 | 净开发时间 | 自然日（含测试） |
|-----|----------|----------------|
| P0 | 1 天 | 1-2 |
| P1 | 1.5 天 | 2-3 |
| P2 | 1 天 | 1-2 |
| P3 | 1.5 天 | 2-3 |
| P4 | 1 天 | 1-2 |
| P5 | 1.5 天 | 2-3 |
| P6 | 1 天 | 1-2 |
| **合计** | **8.5 天** | **10-17 天** |

---

## 风险

1. **图片上传选型**：接 OSS 需要商户账号和 bucket；MVP 可先用本地目录 + 域名白名单，上线前再切
2. **WS topic 扩展**：目前只有 `match:{id}`，要新增 `tournament:{id}`——SocketIO/ws 服务端需要 broadcast 路由改造
3. **时区**：报名时间/开赛时间统一 UTC 存，展示用 Asia/Shanghai；currently v2 的 timestamp 策略要复用
4. **bracket 并发**：两场比赛同时 end 时写下一轮可能 race；用 `SELECT ... FOR UPDATE` 或 advisory lock
5. **重名手机号**：VenueAccount.phone 与 User.phone 同手机号可行但登录入口分离
