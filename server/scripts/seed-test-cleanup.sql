-- 清理所有测试数据(测试用户 + 其报名 + 其参与/创建的比赛事件)。
-- 用法:
--   docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < server/scripts/seed-test-cleanup.sql
--
-- 顺序很重要:对阵图(tournament_bracket_matches)以 Restrict 外键引用 registration,
-- 所以测试赛事一旦“开赛”生成了对阵图,必须先把整场测试赛事删掉(级联删 registration+bracket),
-- 才能再删测试用户。下面用 DO 块自动处理:删掉所有“报名者全是测试用户”的赛事。

-- 1) 删掉“参赛者全部是测试用户”的赛事(级联删除其 registrations + bracket_matches)
DELETE FROM tournaments t
WHERE EXISTS (
        SELECT 1 FROM tournament_registrations r
        WHERE r.tournament_id = t.id AND r.user_id LIKE 'u_test_%'
      )
  AND NOT EXISTS (
        SELECT 1 FROM tournament_registrations r
        WHERE r.tournament_id = t.id AND r.user_id NOT LIKE 'u_test_%'
      );

-- 2) 删掉残留的测试报名(用于真实赛事里混入了测试用户、赛事未被上面删掉的情况;
--    若该 registration 已被对阵图引用会因 FK 报错 —— 那说明它在真实赛事里,应手动处理)
DELETE FROM tournament_registrations WHERE user_id LIKE 'u_test_%';

-- 3) 删掉测试用户参与/创建的比赛(避免 match_player / match_event 外键残留挡住删用户)
DELETE FROM matches m
WHERE m.owner_user_id LIKE 'u_test_%'
   OR EXISTS (
        SELECT 1 FROM match_players mp
        WHERE mp.match_id = m.id AND mp.user_id LIKE 'u_test_%'
      );

-- 4) 删测试用户
DELETE FROM users WHERE id LIKE 'u_test_%';

-- 核对(都应为 0)
SELECT
  (SELECT count(*) FROM users WHERE id LIKE 'u_test_%')                        AS users_left,
  (SELECT count(*) FROM tournament_registrations WHERE user_id LIKE 'u_test_%') AS regs_left;
