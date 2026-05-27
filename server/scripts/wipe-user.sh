#!/usr/bin/env bash
#
# 清空指定手机号的用户信息。两档：
#
#   ./wipe-user.sh +8613800138000              # 默认软重置：释放手机号 + 删微信/抖音绑定 + 删验证码，保留 user 行与历史比赛
#   ./wipe-user.sh +8613800138000 --hard       # 硬删：把 ownedMatches 里 owner_user_id 转给"系统占位用户"，再 delete user
#
# 软重置后，用户用同一手机号再登录会被识别为"新账号"（新 user.id），历史比赛仍按旧 user.id 留存。
# 硬删后 ownedMatches 仍存在，但 owner 指向 SYSTEM_USER（一个 id=u_system 的占位账号；不存在则脚本会创建）。
#
# 默认连本机 docker compose 里的 postgres 容器，env 由 .env 提供。
# 跨机器跑：导出 PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE 即可绕过 docker。

set -euo pipefail

PHONE="${1:-}"
MODE="${2:-soft}"

if [[ -z "$PHONE" ]]; then
  echo "用法: $0 <phone> [--hard]"
  echo "  phone 形如 +8613800138000（含国际区号）"
  exit 1
fi

if [[ ! "$PHONE" =~ ^\+?[0-9]{8,15}$ ]]; then
  echo "❌ 手机号格式错: $PHONE"
  exit 1
fi

# psql 入口：本地 docker 优先，否则透传 PG* 环境变量
if [[ -z "${PGHOST:-}" ]] && command -v docker >/dev/null 2>&1 && docker compose ps postgres 2>/dev/null | grep -q postgres; then
  PSQL="docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -U ${POSTGRES_USER:-zhuoqiu} -d ${POSTGRES_DB:-zhuoqiu}"
else
  PSQL="psql -v ON_ERROR_STOP=1"
fi

run_sql() {
  echo "$1" | $PSQL
}

echo "🔍 查找用户 phone=$PHONE ..."
SUMMARY=$(run_sql "
SELECT
  u.id AS user_id,
  u.nickname,
  u.primary_source,
  u.created_at,
  (SELECT COUNT(*) FROM wechat_bindings WHERE user_id = u.id) AS wechat_bindings,
  (SELECT COUNT(*) FROM douyin_bindings WHERE user_id = u.id) AS douyin_bindings,
  (SELECT COUNT(*) FROM matches WHERE owner_user_id = u.id) AS owned_matches,
  (SELECT COUNT(*) FROM match_players WHERE user_id = u.id) AS match_seat_occupancies,
  (SELECT COUNT(*) FROM match_events WHERE actor_user_id = u.id) AS match_events_authored,
  (SELECT COUNT(*) FROM tournament_registrations WHERE user_id = u.id) AS tournament_registrations,
  (SELECT COUNT(*) FROM phone_verify_codes WHERE phone_number = u.phone_number) AS phone_verify_codes
FROM users u
WHERE u.phone_number = '$PHONE';
")

echo "$SUMMARY"

if ! echo "$SUMMARY" | grep -qE '^\s*u_'; then
  echo "❌ 没找到用户，phone=$PHONE"
  exit 1
fi

echo ""
echo "⚠️  即将执行：[$MODE] 模式"
if [[ "$MODE" == "--hard" ]]; then
  echo "    · 删除 wechat_bindings / douyin_bindings（cascade）"
  echo "    · match_players.user_id / match_events.actor_user_id → NULL（匿名化）"
  echo "    · matches.owner_user_id → 系统占位用户 u_system"
  echo "    · 删除 tournament_registrations"
  echo "    · 删除 phone_verify_codes（同号）"
  echo "    · 删除 users 行"
else
  echo "    · 删除 wechat_bindings / douyin_bindings"
  echo "    · 删除 phone_verify_codes（同号）"
  echo "    · 删除 tournament_registrations（避免唯一键冲突）"
  echo "    · users.phone_number → NULL（释放手机号占用）"
  echo "    · users.nickname / avatar 保留，用 email/wechat 还能查到老账号"
fi

read -r -p "确认继续？(yes/no) " ANS
if [[ "$ANS" != "yes" ]]; then
  echo "已取消"
  exit 0
fi

if [[ "$MODE" == "--hard" ]]; then
  run_sql "
BEGIN;

-- 确保系统占位用户存在
INSERT INTO users (id, nickname, avatar, primary_source, status, created_at, updated_at)
SELECT 'u_system', '系统', '🤖', 'phone', 'banned', NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM users WHERE id = 'u_system');

-- 拿到目标 user_id
WITH target AS (SELECT id FROM users WHERE phone_number = '$PHONE')
DELETE FROM phone_verify_codes WHERE phone_number = '$PHONE';

WITH target AS (SELECT id FROM users WHERE phone_number = '$PHONE')
DELETE FROM tournament_registrations WHERE user_id IN (SELECT id FROM target);

WITH target AS (SELECT id FROM users WHERE phone_number = '$PHONE')
UPDATE match_events SET actor_user_id = NULL WHERE actor_user_id IN (SELECT id FROM target);

WITH target AS (SELECT id FROM users WHERE phone_number = '$PHONE')
UPDATE match_players SET user_id = NULL WHERE user_id IN (SELECT id FROM target);

WITH target AS (SELECT id FROM users WHERE phone_number = '$PHONE')
UPDATE matches SET owner_user_id = 'u_system' WHERE owner_user_id IN (SELECT id FROM target);

-- wechat/douyin bindings 走 onDelete: Cascade，下面的 DELETE users 会自动带走
DELETE FROM users WHERE phone_number = '$PHONE';

COMMIT;
"
  echo "✅ 硬删完成。同手机号可重新注册。"
else
  run_sql "
BEGIN;

DELETE FROM phone_verify_codes WHERE phone_number = '$PHONE';

WITH target AS (SELECT id FROM users WHERE phone_number = '$PHONE')
DELETE FROM tournament_registrations WHERE user_id IN (SELECT id FROM target);

WITH target AS (SELECT id FROM users WHERE phone_number = '$PHONE')
DELETE FROM wechat_bindings WHERE user_id IN (SELECT id FROM target);

WITH target AS (SELECT id FROM users WHERE phone_number = '$PHONE')
DELETE FROM douyin_bindings WHERE user_id IN (SELECT id FROM target);

UPDATE users SET phone_number = NULL WHERE phone_number = '$PHONE';

COMMIT;
"
  echo "✅ 软重置完成。同手机号可重新注册（会建新 user 行，老账号 id 仍在但已脱钩）。"
fi
