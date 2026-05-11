# 桌球计分 · v2.10 球房入驻 + 赛事 PRD

> **版本：** v2.10.0 草稿
> **分支：** `v2.10`（基于 v2 @ `3c7c464`）
> **更新时间：** 2026-05-11
> **状态：** 设计中（等用户 review）
> **依赖：** v2 已落地部分（共享比赛、账号、WebSocket、管理后台基础）

本文档承接 `billiards-match-app-prd-v2.md` 第 6、7、8 章（球房 / 赛事 / 数据模型）的占位条目，把它们落地到可执行的设计。

---

## 0. TL;DR

- 新增**独立的商家入驻体系**：营业执照 + 店铺信息审核，与 C 端用户体系解耦。
- 引入**三种赛事形态**：日/周/月排行榜、报名制单场赛、长期联赛；但本期 v2.10 只实现**报名制单场赛**（含单败淘汰赛制）和排行榜的**数据写入侧**，其余放 v2.11+。
- 不碰钱。所有报名费/奖金只记在赛事元数据里，作为"荣誉+线下履约"，平台不做代收代付。
- C 端新增"球房"与"赛事"两个一级入口；Admin 后台新增"入驻审核"与"赛事运营"两个模块。

---

## 1. 角色和身份

| 角色 | 来源 | 能做的事 |
|------|------|----------|
| **C 端用户** | 手机号/微信登录（v2 已有） | 打比赛、报名赛事、查看球房、看排行榜 |
| **球房账号（商家）** | 独立入驻审核通过后开通，与 C 端账号解耦的独立账号体系 | 后台：管理球房资料、发布编辑赛事、查报名、现场开局；C 端：只读视角看历史/当前赛事 |
| **平台运营（admin）** | 后台创建 | 审核入驻、**后台直接建房（后门）**、管理赛事、全局看板 |

### 1.1 商家独立入驻，不是 C 端升级

- 理由：营业执照和店铺资质以**店铺**为主体，一个老板可能多家分店、多个店员帮同一家店发赛事。这种 N:M 关系放个人账号里会拧。
- 落地：新增 `venues`（球房）和 `venue_applications`（入驻申请）；商家用独立 JWT（type=venue_account）登录。

### 1.2 商家账号可在 C 端登录（只读视角）

商家账号是后台账号体系，**也允许在 C 端登录**。同一个账号，登入端不同 → 能力不同：

| 登入端 | 能做 | 不能做 |
|------|------|------|
| **admin 后台**（`admin.zhuoqiu.xxx`） | 完整：建/改赛事、开局、改店铺资料、查报名手机号 | — |
| **C 端 app**（Taro） | 看自家球房 / 历史赛事 / 当前赛事进度 / 玩家名单（脱敏） | **创建/修改任何东西**（建赛事 / 开局 / 改资料 → 提示"请到管理后台" / 跳后台链接） |

理由：让老板出门在外、用手机也能盯比赛进度；但创建动作集中在后台，避免误操作。

### 1.3 C 端"切换到球房管理模式"入口

C 端 `我的` 页加按钮 `🏢 切换到球房管理模式` →

```
点击 → 球房管理模式登录页（独立登录态，与 C 端 user 登录态共存）
        ├─ 已注册商家：手机号 + 验证码登录
        ├─ 还没账号：[ 申请球房入驻 ] → 注册商家账号 + 填申请表
        └─ 平台运营 / 客服后门入口（admin 用同手机号登录）
```

登录成功后，C 端 UI 切换到"球房视角"：底部 Tab 变为 `首页 / 我的球房 / 我的赛事 / 我的`，看到的内容只属于自己的球房。点"创建赛事"等动作会提示跳转后台。

### 1.4 平台运营建房后门

平台运营在 admin 里有 `+ 新建球房` 按钮，跳过自助申请流程：填店铺信息 → 选/创建商家账号（手机号） → 直接生成 venue。用于：合作球房快速上架、申请被驳回但商家电话来求情后人工创建、demo 数据。

操作走审计日志（adminId, action=create_venue_directly）。

---

## 2. 模块总览

```text
C 端（Taro，普通用户视角）              C 端（商家登录后的视角）
  ├─ 首页                                ├─ 首页
  ├─ 球房（发现）← 新 tab                ├─ 我的球房（只读） ← 替换
  ├─ 赛事（发现）← 新 tab                ├─ 我的赛事（只读） ← 替换
  ├─ 我的                                ├─ 我的
  │   └─ 🏢 切换球房管理模式            │   └─ 🚪 退出球房视角 / 进后台
  │   (未登录商家账号时)                 │   (已登录商家账号时)
  └─ 创建比赛 / 联机 / 加入房间          └─ 不显示"创建"类入口

Admin 后台（admin.zhuoqiu.xxx · 共用域名，按 JWT type 路由菜单）
  ├─ platform_admin 菜单
  │   ├─ 概览 / 用户 / 比赛 / 审计（已有）
  │   ├─ 入驻审核 ← 新增
  │   ├─ 球房管理（+ 新建球房后门） ← 新增
  │   └─ 赛事总览（跨球房） ← 新增
  ├─ venue_account（owner）菜单
  │   ├─ 店铺主页 / 店铺资料
  │   ├─ 赛事管理（发布 / 编辑 / 报名列表）
  │   ├─ 现场控台（开启比赛）
  │   └─ 团队（占位，v2.11）
  └─ 未入驻商家
      └─ 申请入驻
```

---

## 3. 球房入驻

### 3.1 流程（两个入口 + 一个后门）

入口 A：C 端"切换球房管理模式"

```text
C 端我的 → 🏢 切换球房管理模式 → 球房管理模式登录页
    ├─ 已有商家账号 → 手机号+验证码登录 → 进 C 端球房视角
    └─ 没有账号 → [申请球房入驻]
        → 填手机号 + 验证码建商家账号
        → 进入申请表单（店名 / 地址 / 台桌数 / 营业执照图 / ...）
        → 提交 venue_application (state=pending)
        → 停留在"审核中"状态页
```

入口 B：admin 域名直接入驻

```text
老板 → admin.zhuoqiu.xxx/apply
     → 商家手机号注册/登录
     → 申请表单 → 提交 venue_application
```

两个入口落库到同一张 `venue_applications` 表，不区分来源（仅记录 source=c_app | admin_web 用于分析）。

平台审核

```text
platform_admin → admin / 入驻审核
  → 查看申请详情（营业执照图、店铺资料）
  → 通过：创建 venue + 绑定 owner + 发站内信 + 短信通知
  → 驳回：填驳回原因 → 申请回到 draft，老板可修改后重新提交
```

后门：平台直接建房

```text
platform_admin → admin / 球房管理 / + 新建球房
  → 填完整店铺信息
  → 填老板手机号：
      ├─ 已存在的 venue_account → 直接绑定为 owner
      └─ 不存在 → 自动创建商家账号（首次登录用验证码登录）
  → 直接生成 venue（不走审核流程）
  → 记审计日志 action=create_venue_direct
```

适用场景：合作球房快速上架、驳回后人工救场、Demo 数据。

### 3.2 状态机

```text
venue_application:
  draft ──submit──▶ pending ──approve──▶ approved (生成 venue)
                        │                    │
                        └───reject─▶ rejected (带 rejectReason)
  rejected ──edit+submit──▶ pending
  approved 不可再改（要改店铺资料走 venue 的更新流程）
```

### 3.3 字段

#### venue（球房主体）

| 字段 | 类型 | 备注 |
|---|---|---|
| id | uuid | |
| name | string | 店名，搜索键 |
| slug | string? | 可选短码，分享链接用 |
| address | string | 文字地址 |
| lat/lng | float? | 后续做"附近"用；本期先手工录 |
| phone | string | 联系电话 |
| cover_image | string? | 封面图 URL |
| tables_count | int | 台桌数量（字段记录；本期不精细到台桌 ID） |
| open_hours | jsonb | `{mon: "10:00-02:00", ...}` |
| description | text? | 店铺介绍（富文本） |
| ownerAccountId | uuid | 指向 venue_account（商家账号表） |
| state | enum | active / suspended |
| created_at / updated_at | ts | |

#### venue_account（商家账号，与 C 端 users 表解耦）

| 字段 | 类型 | 备注 |
|---|---|---|
| id | uuid | |
| phone | string | 登录键，唯一 |
| nickname | string | |
| role | enum | owner / staff |
| venue_id | uuid? | staff 必填，owner 可以在 venue 表里反查 |
| state | enum | active / banned |

#### venue_application

| 字段 | 类型 | 备注 |
|---|---|---|
| id | uuid | |
| applicantAccountId | uuid | 提交人（venue_account） |
| payload | jsonb | 所有字段快照（店名、地址、台桌数、营业时间等） |
| license_image | string | 营业执照图 URL |
| id_card_image | string? | 本期选填 |
| state | enum | draft / pending / approved / rejected |
| reject_reason | text? | |
| reviewed_by | uuid? | admin_id |
| reviewed_at | ts? | |
| venue_id | uuid? | approved 后写入 |
| created_at / updated_at | ts | |

### 3.4 店员（v2.10 做最简）

- 入驻后 owner 可在商家后台"团队"页加店员（填手机号 → 生成邀请码 → 店员用手机号登录后自动绑定）
- 店员权限：发赛事、查报名、现场开局；**不能**改店铺资料、不能踢人
- 本期不做邀请码流程，先只支持 owner 一人（UI 预留入口，文案"即将上线"）

---

## 4. 赛事

### 4.1 赛事形态（3 种 × 本期范围）

| 形态 | 典型场景 | 本期 v2.10 | 备注 |
|------|---------|-----------|-----|
| **报名制单场赛** | 五一擂台赛、周六八球赛 | ✅ **全做** | 含单败淘汰赛制，其他赛制占位 |
| **日/周/月排行榜** | "本周本店九球王" | ⚠ **只做写入侧**（每场比赛记 venue_id 归属，后端定时任务算榜） | C 端展示放 v2.11 |
| **长期联赛（赛季积分）** | 春季联赛 12 周 | ❌ 不做 | v2.12+ |

### 4.2 报名制单场赛（MVP 聚焦）

#### 核心字段

##### tournament

| 字段 | 类型 | 备注 |
|---|---|---|
| id | uuid | |
| venue_id | uuid | 归属球房 |
| title | string | "五一擂台赛" |
| game_type | enum | nine_ball / eight_ball |
| format | enum | **single_elim** / double_elim / round_robin / swiss（本期只 single_elim 实现，其他占位） |
| rules_json | jsonb | 规则快照（比如九球的 normalWin/smallJack 等，与 match.rules 同构） |
| max_players | int | 上限 8/16/32/64 |
| min_players | int | 启动下限（默认 4） |
| entry_fee_cents | int | 记录用（线下收），平台不经手 |
| prize_pool_text | text? | 自由填，比如"冠军 500 元 + 店内 3 小时券" |
| registration_starts_at / registration_ends_at | ts | |
| match_starts_at | ts | 赛事开打时间 |
| cover_image | string? | |
| state | enum | **draft / published / registering / in_progress / completed / cancelled** |
| created_by_account_id | uuid | 商家账号 |
| created_at / updated_at | ts | |

##### tournament_registration（报名记录）

| 字段 | 类型 | 备注 |
|---|---|---|
| id | uuid | |
| tournament_id | uuid | |
| user_id | uuid | C 端用户 |
| display_name | string | 提交时的昵称快照 |
| phone | string | 便于商家现场联系（快照） |
| seed | int? | 种子序号，编排时才分配 |
| state | enum | confirmed / withdrawn / disqualified |
| registered_at | ts | |

##### tournament_bracket_match（赛程对阵）

| 字段 | 类型 | 备注 |
|---|---|---|
| id | uuid | |
| tournament_id | uuid | |
| round | int | 1=首轮、2=四分之一……最大轮=决赛 |
| slot_in_round | int | 该轮内的顺序 |
| player_a_registration_id | uuid? | 允许 null（轮空 / 还没决出） |
| player_b_registration_id | uuid? | |
| match_id | uuid? | 关联到 `matches` 表（即实际计分比赛） |
| winner_registration_id | uuid? | 比赛结束后回填 |
| state | enum | pending / ready / in_progress / completed |
| scheduled_at | ts? | 商家可预先排时间，可 null |

#### 流程（商家 & C 端）

```text
[商家（admin 后台，或 C 端只读视角中的"去后台"链接）]
 ├─ 新建赛事（draft）→ 填信息 → 保存
 ├─ 发布（draft → registering，自动）
 └─ 报名截止或手动"开赛"（registering → in_progress）
     └─ 系统生成 bracket（单败淘汰：按报名人数补 BYE 到 2^n）
     └─ 商家在"现场控台"里点某对阵 → 创建 matches 行（复用 v2 的 match 系统）→ 比赛计分
     └─ match.end → 自动把 winner 写回 bracket → 进入下轮（对阵生成下一条 bracket_match）
     └─ 最后一轮决出冠军 → 赛事 completed

[C 端用户]
 ├─ 赛事列表（按球房/时间筛）
 ├─ 赛事详情（信息 + 当前赛程树 + 自己的对阵/名次）
 ├─ 报名（state=registering 且未满员时）
 └─ 开打时扫赛事里的"我的对阵 → 进入对战"，直接进九球/中八联机计分页
```

#### 赛制：单败淘汰（Single Elimination）

- 人数不是 2^n 时，首轮给头部种子补 BYE
- 种子分配：报名顺序 = seed（v2.10 简化；v2.11 再做 ELO/手动排种）
- 示例 6 人 → 扩到 8（2 个 BYE）：

  ```text
  R1: #1 BYE / #2 vs #7 / #3 vs #6 / #4 vs #5 / BYE #1
  (正确 bracket: 1-BYE, 4v5, 3v6, 2-BYE 交替——按 seed 分区)
  R2: 4 人（2 场）
  R3: 2 人（决赛）
  ```
- 一次性生成全部空 bracket，随比赛推进回填 winner

#### 其他赛制（v2.11+）

- double_elim：败者组
- round_robin：所有人两两对打，按胜场 + 净分排名
- swiss：每轮按积分分组配对，轮数固定
- 数据模型上 `format` 字段已预留；bracket 表 round/slot_in_round 对循环赛不够用，到时再加 `round_robin_matches` 表或给 bracket 加 group_id。

### 4.3 赛事归属（排行榜的写入侧）

- 从 v2.10 起，**任何在球房场景下发起的比赛**都写 `matches.venue_id`：
  - 通过赛事"现场控台"创建的 match：自动带 venue_id
  - 商家自建"店内随手局"（可选），也要求选 venue（v2.11 做）
  - C 端用户自己开的私局（不在球房）：venue_id = null
- 排行榜字段先只在 `matches` 加 `venue_id` 外键；统计接口/页面放 v2.11。

---

## 5. 不做（显式）

- ❌ **支付**：平台不接入微信支付、不代收代付、不抽成。入驻费、报名费、奖金全线下。
- ❌ **台桌级预约**：只记录球房"台桌总数"，不建 table_id 维度的预约系统。
- ❌ **实名/身份证审核**：入驻只看营业执照；身份证字段保留但不强制。
- ❌ **商家端 App/小程序**：商家用 web 后台，不做端。
- ❌ **赛事直播/视频**
- ❌ **附近球房（LBS）**：lat/lng 保留字段，本期不给"按距离排序"
- ❌ **店员系统完整版**：只 owner 一人，UI 留占位
- ❌ **循环赛/瑞士轮/双败**：format 字段保留，逻辑放 v2.11+

---

## 6. 与现有系统的对接

### 6.1 Match 表扩展
```sql
ALTER TABLE matches ADD COLUMN venue_id uuid NULL REFERENCES venues(id);
ALTER TABLE matches ADD COLUMN tournament_bracket_match_id uuid NULL
  REFERENCES tournament_bracket_matches(id);
```
- 普通联机局 venue_id=null, tournament_bracket_match_id=null（行为不变）
- 球房私局 venue_id=xxx, tournament_bracket_match_id=null
- 赛事局 venue_id=xxx, tournament_bracket_match_id=xxx（match.end 触发 bracket 回填）

### 6.2 WS 广播
赛事场景下，观众多（球房开大屏看比赛）。复用现有 `match_event` 广播，但多订一个 topic：
- `tournament:{id}` → 有新一轮、新对阵、决出冠军时推送
- `match:{id}` → 维持原逻辑

### 6.3 Admin 后台
- 已有 `matches admin` 模块要在列表里加 venue_id 过滤
- 新加一级菜单"球房"（店铺列表 + 入驻审核）和"赛事"（赛事列表，跨球房视角）

### 6.4 商家后台
- 用同一个 admin-web 代码库，根据登录账户的 `accountType`（platform_admin / venue_owner / venue_staff）路由不同菜单。
- 商家只看得到"自家球房"和"自家赛事"。

---

## 7. 技术栈变更

- 文件上传：v2 暂无，v2.10 需要营业执照/封面图上传。选型：
  - MVP：直接存腾讯云 COS / 阿里云 OSS（存 URL，客户端直传）
  - 或先 base64 存 PG 大字段（只几十张图，够用；好处是零运维成本）
  - **推荐：MVP 用 OSS + 直传**
- 无需新增服务，NestJS 原样扩展模块：`src/venue/`、`src/tournament/`

---

## 8. 本期实现 checklist（v2.10 定义完成）

**服务端**
- [ ] Prisma 加 venues / venue_accounts / venue_applications / tournaments / tournament_registrations / tournament_bracket_matches
- [ ] matches 表加 venue_id / tournament_bracket_match_id
- [ ] VenueModule：入驻申请提交、审核、通过后建 venue
- [ ] 独立商家登录（手机号+验证码，独立 JWT type=venue_account）
- [ ] TournamentModule：赛事 CRUD、报名、开赛、bracket 生成、对阵推进
- [ ] match.end hook → 回填 bracket winner + 生成下一轮 bracket
- [ ] OSS 直传签名接口

**Admin 后台**
- [ ] 平台运营：入驻审核列表 + 审核详情页 + 通过/驳回动作
- [ ] 商家端：店铺信息页 + 赛事列表 + 赛事发布/编辑 + 报名列表 + 现场控台（开启对阵比赛）

**C 端 Taro**
- [ ] 底部 tab 加"球房"和"赛事"（4 tab → 6 tab 或重组成 4 个一级入口）
- [ ] 球房列表 + 球房主页
- [ ] 赛事列表 + 赛事详情 + 报名
- [ ] "我的"里加"我参加的赛事"
- [ ] 赛事对阵点击 → 进九球/中八联机页

**验证**
- [ ] E2E：老板入驻 → 审核通过 → 发赛事 → 两个 C 端用户报名 → 开赛 → 赛事页看到对阵 → 用户进对战页记分 → winner 推进 bracket

---

## 9. 路线图

| 版本 | 重点 | 目标时间 |
|-----|------|---------|
| **v2.10** | 球房入驻 + 报名制单场单败淘汰赛完整闭环 | 2026-05 ~ 2026-06 |
| v2.11 | 排行榜（日/周/月）C 端展示 + 店员系统 + 其他赛制（round_robin） | 2026-06+ |
| v2.12 | 长期联赛 + ELO 积分 + 赛季 | 2026-07+ |
| v3.x | 支付、台桌预约、LBS、商家小程序 | 更远 |

---

## 10. 已决策（用户 2026-05-11 review）

1. **域名**：`admin.zhuoqiu.xxx` 共用一个站，按 JWT type 路由菜单；不单拆 `venue-web/`。
2. **账号互通**：商家账号是独立账号体系，但**同一套账号既能在 admin 后台登录（完整权限），也能在 C 端登录（只读视角：看自家球房 / 历史赛事 / 当前赛事）**。C 端登录的商家账号看不到"创建比赛/发赛事"这类写入能力，提示引导去后台。
3. **C 端入口**：C 端"我的"页加 🏢 切换球房管理模式 → 独立登录页 → 登录页里含「申请球房入驻」入口（先建商家账号再填表）。
4. **后门建房**：admin 后台"球房管理"里加「+ 新建球房」，平台运营可直接录入店铺信息 + 绑定老板手机号（不存在时自动建商家账号）→ 跳过审核直接生成 venue。走审计日志。
5. **bracket 生成**：一次性生成全部空对阵。
6. **一人多赛事**：允许同时报多场，用户自理时间冲突。
7. **弃权**：商家在控台手动标记 walkover，bracket 直接推进，不创建 match。
