-- 打入 N 个测试用户(仅供联机/赛事测试)。
-- 用法(在服务器仓库根目录,有 docker-compose.yml 处):
--   docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v num=16' < server/scripts/seed-test-users.sql
-- 说明:
--   :num        要创建多少个测试用户
--   id/手机号    固定前缀 u_test_ / 199xxxxxxxx,便于一键清理;重复执行安全(ON CONFLICT DO NOTHING)
INSERT INTO users (id, phone_number, nickname, avatar, primary_source, status, created_at, updated_at)
SELECT
  'u_test_' || lpad(gs::text, 4, '0'),
  '199' || lpad(gs::text, 8, '0'),
  '测试选手' || gs,
  '🎱',
  'phone'::"PrimarySource",
  'active'::"UserStatus",
  now(),
  now()
FROM generate_series(1, :num) AS gs
ON CONFLICT DO NOTHING;

SELECT count(*) AS test_users_total FROM users WHERE id LIKE 'u_test_%';
