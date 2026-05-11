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
| **球房管理员（商家）** | **独立入驻审核通过后开通**，与 C 端账号解耦 | 管理自家球房资料、发布/编辑赛事、查看报名、现场开局、查排行榜 |
| **平台运营（admin）** | 只在后台创建 | 审核入驻、管理赛事（限权干预）、全局数据看板 |

**关键决策：商家独立入驻，不是 C 端升级。**
- 理由：营业执照和店铺资质是以**店铺**为主体的，一个老板可能有多家分店；多个店员可能帮同一家店发赛事。这种 N:M 关系放在个人账号里会拧。
- 落地：新增 `venues` 表（球房）和 `venue_applications`（入驻申请）；登录走独立的 `/venue-web` 管理后台（可以先共用 `admin-web` 的壳，再用角色路由切功能集）。
- C 端用户若本人是老板，用手机号登录 admin 后台即可；C 端 app 不承载商家管理功能。

---

## 2. 模块总览

```
C 端（Taro H5 + 小程序）              Admin 后台（React + AntD Pro）
  ├─ 首页                             ├─ 平台运营（已有）
  ├─ 九球 / 中八（已有）              │   ├─ 用户 / 比赛 / 审计
  ├─ 我的（已有）                     │   └─ 球房审核 ← 新增
  ├─ 球房 ← 新增 tab                  ├─ 球房管理员（新角色）
  │   ├─ 球房列表 / 搜索              │   ├─ 我的球房（店铺信息/台桌）
  │   ├─ 球房主页（单店）             │   ├─ 赛事运营（发布/编辑/报名列表）
  │   └─ 扫码进赛事                   │   └─ 现场控台（开启赛事比赛）
  └─ 赛事 ← 新增 tab                  │
      ├─ 赛事列表（附近/进行中）      └─ 入驻申请（老板自助提交入口）
      ├─ 赛事详情（信息/赛程/排名）
      ├─ 报名
      └─ 对战中（复用 9球/中八联机页）
```

---

## 3. 球房入驻

### 3.1 流程

```
老板 → 打开 https://admin.zhuoqiu.xxx/apply
     → 手机号注册/登录（独立商家登录，非 C 端账号）
     → 填写店铺信息（店名、地址、联系人、台桌数、营业时间、封面图）
     → 上传营业执照（图片）+ 身份证（选填，合规需要时再加）
     → 提交申请 venue_application (status=pending)
     → 等待审核（通常 1-3 个工作日）

平台运营 → admin-web / 入驻审核
       → 查看申请详情（含营业执照图、店铺资料）
       → 通过：创建 venue 记录 + 绑定商家账号为 owner + 发站内信 + 短信通知
       → 驳回：填驳回原因 → 申请回到 draft 状态，老板可修改后重新提交
```

### 3.2 状态机

```
venue_application:
  draft ──submit──▶ pending ──approve──▶ approved (生成 venue)
                        │                    │
                        └───reject─▶ rejected (带 rejectReason)
  rejected ──edit+submit──▶ pending
  approved 不可再改（要改店铺资料走 venue 的更新流程）
```

### 3.3 字段

**venue**（球房主体）
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

**venue_account**（商家账号，与 C 端 users 表解耦）
| 字段 | 类型 | 备注 |
|---|---|---|
| id | uuid | |
| phone | string | 登录键，唯一 |
| nickname | string | |
| role | enum | owner / staff |
| venue_id | uuid? | staff 必填，owner 可以在 venue 表里反查 |
| state | enum | active / banned |

**venue_application**
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

**tournament**
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

**tournament_registration**（报名记录）
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

**tournament_bracket_match**（赛程对阵）
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

#### 流程

```
[商家]
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
  ```
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

## 10. 开放问题（留给用户 review）

1. **商家登录用同一个 admin-web，还是独立域名？** 默认方案：`admin.zhuoqiu.xxx` 同一个站，按角色路由。若想分离前端工程，单列 `venue-web/`。
2. **入驻申请能不能游客直接提交？** 默认要先手机号登录商家账号；可以改成"先填表+验证码验证手机号后提交申请，通过后创建账号"的反向流程。
3. **赛事 bracket 是一次性生成全部轮次，还是每轮打完生成下一轮？** 默认一次性生成全部空对阵（UI 画树更容易）；每轮动态生成则更灵活（处理弃权）。
4. **一个 C 端用户可以同时报多场赛事吗？** 默认允许，由用户自己管理时间冲突。
5. **bracket 对阵里一方弃权怎么处理？** v2.10 默认：商家在控台手动标 "winner=对方"（不新开 match，直接推进）。
