# v2.10 数据模型（Prisma 增量）

> 配套 PRD：`prd/billiards-match-app-prd-v2.10.md` §3-§6
> 这里只列新增/改动的 schema 片段，不重复已有模型。

---

## 1. 新增 enum

```prisma
enum VenueAccountRole {
  owner
  staff
}

enum VenueAccountState {
  active
  banned
}

enum VenueState {
  active
  suspended
}

enum VenueApplicationState {
  draft
  pending
  approved
  rejected
}

enum TournamentFormat {
  single_elim
  double_elim   // 占位，v2.11+
  round_robin   // 占位
  swiss         // 占位
}

enum TournamentState {
  draft
  published
  registering
  registration_closed
  in_progress
  completed
  cancelled
}

enum TournamentRegistrationState {
  confirmed
  withdrawn
  disqualified
}

enum BracketMatchState {
  pending    // 一方或双方未定
  ready      // 双方已定，等开赛
  in_progress
  completed
  walkover   // 一方弃权直接推进
}
```

---

## 2. 商家体系

```prisma
model VenueAccount {
  id           String            @id @default(uuid()) @db.Uuid
  phone        String            @unique
  nickname     String
  role         VenueAccountRole
  venueId      String?           @db.Uuid            // staff 用；owner 通过 Venue.ownerAccountId 反查
  venue        Venue?            @relation("VenueStaff", fields: [venueId], references: [id])
  state        VenueAccountState @default(active)
  lastLoginAt  DateTime?
  createdAt    DateTime          @default(now())
  updatedAt    DateTime          @updatedAt

  ownedVenue   Venue?            @relation("VenueOwner")
  applications VenueApplication[] @relation("VenueApplicationApplicant")

  @@map("venue_accounts")
}

model Venue {
  id            String      @id @default(uuid()) @db.Uuid
  name          String
  slug          String?     @unique
  address       String
  lat           Float?
  lng           Float?
  phone         String
  coverImage    String?
  tablesCount   Int         @default(0)
  openHours     Json?                                  // {mon:"10:00-02:00",...}
  description   String?     @db.Text

  ownerAccountId String     @unique @db.Uuid
  owner         VenueAccount @relation("VenueOwner", fields: [ownerAccountId], references: [id])

  staff         VenueAccount[] @relation("VenueStaff")

  state         VenueState  @default(active)
  createdAt     DateTime    @default(now())
  updatedAt     DateTime    @updatedAt

  tournaments   Tournament[]
  matches       Match[]     @relation("MatchVenue")

  @@map("venues")
  @@index([name])
}

model VenueApplication {
  id                String                 @id @default(uuid()) @db.Uuid
  applicantAccountId String                @db.Uuid
  applicant         VenueAccount           @relation("VenueApplicationApplicant", fields: [applicantAccountId], references: [id])

  payload           Json                                           // 所有字段快照
  licenseImage      String?
  idCardImage       String?

  state             VenueApplicationState  @default(draft)
  rejectReason      String?                @db.Text
  reviewedByAdminId String?                @db.Uuid
  reviewedAt        DateTime?

  venueId           String?                @db.Uuid                // approved 后写入
  createdAt         DateTime               @default(now())
  updatedAt         DateTime               @updatedAt

  @@map("venue_applications")
  @@index([applicantAccountId])
  @@index([state])
}
```

---

## 3. 赛事

```prisma
model Tournament {
  id                    String           @id @default(uuid()) @db.Uuid
  venueId               String           @db.Uuid
  venue                 Venue            @relation(fields: [venueId], references: [id])

  title                 String
  gameType              MatchType                                // nine_ball / eight_ball
  format                TournamentFormat @default(single_elim)
  rulesJson             Json                                     // 规则快照
  maxPlayers            Int
  minPlayers            Int              @default(4)
  entryFeeCents         Int              @default(0)             // 记录用，平台不经手
  prizePoolText         String?          @db.Text
  registrationStartsAt  DateTime
  registrationEndsAt    DateTime
  matchStartsAt         DateTime
  coverImage            String?
  noticeText            String?          @db.Text

  state                 TournamentState  @default(draft)
  createdByAccountId    String           @db.Uuid                // VenueAccount.id
  createdAt             DateTime         @default(now())
  updatedAt             DateTime         @updatedAt

  registrations         TournamentRegistration[]
  bracketMatches        TournamentBracketMatch[]

  @@map("tournaments")
  @@index([venueId, state])
  @@index([state, registrationEndsAt])
}

model TournamentRegistration {
  id             String                       @id @default(uuid()) @db.Uuid
  tournamentId   String                       @db.Uuid
  tournament     Tournament                   @relation(fields: [tournamentId], references: [id])

  userId         String                       @db.Uuid           // C 端 User
  displayName    String
  phone          String

  seed           Int?
  state          TournamentRegistrationState  @default(confirmed)
  registeredAt   DateTime                     @default(now())

  bracketEntriesA TournamentBracketMatch[]    @relation("BracketPlayerA")
  bracketEntriesB TournamentBracketMatch[]    @relation("BracketPlayerB")
  bracketWins     TournamentBracketMatch[]    @relation("BracketWinner")

  @@map("tournament_registrations")
  @@unique([tournamentId, userId])
  @@index([userId])
}

model TournamentBracketMatch {
  id                       String              @id @default(uuid()) @db.Uuid
  tournamentId             String              @db.Uuid
  tournament               Tournament          @relation(fields: [tournamentId], references: [id])

  round                    Int                                   // 1 = 首轮
  slotInRound              Int                                   // 该轮内序号

  playerARegistrationId    String?             @db.Uuid
  playerA                  TournamentRegistration? @relation("BracketPlayerA", fields: [playerARegistrationId], references: [id])
  playerBRegistrationId    String?             @db.Uuid
  playerB                  TournamentRegistration? @relation("BracketPlayerB", fields: [playerBRegistrationId], references: [id])

  matchId                  String?             @unique @db.Uuid   // 关联到 matches
  match                    Match?              @relation("BracketMatchRef", fields: [matchId], references: [id])

  winnerRegistrationId     String?             @db.Uuid
  winner                   TournamentRegistration? @relation("BracketWinner", fields: [winnerRegistrationId], references: [id])

  state                    BracketMatchState   @default(pending)
  scheduledAt              DateTime?

  createdAt                DateTime            @default(now())
  updatedAt                DateTime            @updatedAt

  @@map("tournament_bracket_matches")
  @@index([tournamentId, round])
}
```

---

## 4. Match 表扩展

```prisma
// 在现有 model Match 里增加：
model Match {
  // ... 现有字段 ...
  venueId                   String?                 @db.Uuid
  venue                     Venue?                  @relation("MatchVenue", fields: [venueId], references: [id])

  tournamentBracketMatchId  String?                 @db.Uuid
  tournamentBracketMatch    TournamentBracketMatch? @relation("BracketMatchRef")
  // ...
}
```

注意：`Match` 与 `TournamentBracketMatch` 的 1:1 关系由 `BracketMatch.matchId` 单独持有 `@unique`，Match 侧不用外键字段，只靠反向关系即可（若确有前置 SQL 约束需要，可在 Match 上加 `tournamentBracketMatchId @unique`；这里选后一种更直观）。

---

## 5. Migration 顺序

```
1) add_venue_account_and_venue
   - venue_accounts
   - venues
   - venue_applications
2) add_tournament
   - tournaments
   - tournament_registrations
   - tournament_bracket_matches
3) extend_match
   - matches.venueId
   - matches.tournamentBracketMatchId
```

三次 migration 分开做，避免一次失败整体 rollback。

---

## 6. Seed 数据（开发用）

```
seed.ts 新增：
- 1 个 VenueAccount（phone=13900000001, role=owner）
- 1 个 Venue（"开发测试球房"，owner 指向上面）
- 1 个 Tournament（registering 状态，演示用）
- 0 个 registration（由测试本人报名）
```

---

## 7. 写入侧排行榜（v2.10 只做写入，不算榜）

- 从 v2.10 起，任何 Match 在创建时如果来自赛事或商家现场 → 写 `venueId`
- `TournamentBracketMatch.state=completed` → 触发器/业务层把 bracket 最终结果写到 `TournamentRegistration`（名次字段可在 v2.11 加）
- v2.11 会加 `LeaderboardSnapshot` 表做日/周/月快照

---

## 8. 权限矩阵（要落到 NestJS Guard）

| 资源 | C 端 User | VenueAccount owner | VenueAccount staff | Platform admin |
|------|-----------|--------------------|--------------------|--------------- |
| 读 venue（公开字段） | ✓ | ✓ | ✓ | ✓ |
| 改 venue 资料 | ✗ | 仅自家 | ✗ | ✓ |
| 创建 venue（审核） | 不走此路径 | 提交申请 | ✗ | 直接创建 |
| 审核 venue_application | ✗ | ✗ | ✗ | ✓ |
| 发布 tournament | ✗ | 仅自家 venue | 仅自家 venue | ✓ |
| 报名 tournament | ✓ | ✓（自己也能参赛） | ✓ | 不建议（但可） |
| 创建赛事 match（开赛） | ✗ | 仅自家 | 仅自家 | ✓ |
| 读 tournament 公开信息 | ✓ | ✓ | ✓ | ✓ |

新增 JWT type：
- 现有 `type: user | admin`
- 新增 `type: venue_account`（payload 额外带 `accountId`, `role`, `venueId?`）

---

## 9. 不变量 / 一致性约束

1. `Venue.ownerAccountId` 必须指向 `VenueAccount.role=owner` 的记录
2. `VenueAccount.role=staff` 必须有 `venueId`
3. `TournamentRegistration (tournamentId, userId)` 唯一；`state=withdrawn` 后可重新 insert？—— **不可以**，走状态字段，不 delete
4. `Tournament.state` 转移必须单向（禁止 `completed → in_progress`）
5. `TournamentBracketMatch.matchId` 只能设置一次；设置时创建对应 `Match` 并写 `tournamentBracketMatchId`
6. 赛事 `completed` 时必须存在一条 `round = max_round, winnerRegistrationId != null` 的 bracket
