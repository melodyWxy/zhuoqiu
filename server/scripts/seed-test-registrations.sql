-- 让测试用户报名指定赛事(状态 confirmed)。
-- 前置:先在后台建好赛事并“发布”(进入报名中),拿到赛事 id(后台赛事详情 URL 里的 t_xxxx)。
-- 用法:
--   docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v num=16 -v tid=t_xxxxxxxx' < server/scripts/seed-test-registrations.sql
-- 说明:
--   :num   报名人数(应 <= 已创建的测试用户数)
--   :tid   赛事 id
--   重复执行安全(同一赛事+用户唯一,ON CONFLICT DO NOTHING)
INSERT INTO tournament_registrations (id, tournament_id, user_id, display_name, phone, status, registered_at)
SELECT
  'regt_' || lpad(gs::text, 4, '0') || '_' || :'tid',
  :'tid',
  'u_test_' || lpad(gs::text, 4, '0'),
  '测试选手' || gs,
  '199' || lpad(gs::text, 8, '0'),
  'confirmed'::"TournamentRegistrationStatus",
  now()
FROM generate_series(1, :num) AS gs
ON CONFLICT DO NOTHING;

SELECT count(*) AS regs_in_tournament
FROM tournament_registrations
WHERE tournament_id = :'tid' AND user_id LIKE 'u_test_%';
