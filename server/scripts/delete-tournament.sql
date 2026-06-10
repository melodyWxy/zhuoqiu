-- 删除某个球房赛事的全部数据:赛事本体 + 报名 + 对阵图,以及该赛事打过的实际比赛(含计分事件)。
-- ⚠️ 不可逆!整事务执行,出错自动回滚。
--   默认会连同该赛事产生的「实际比赛记录(matches)」一起删除;
--   若只想删赛事/对阵图、保留比赛记录(选手的对局历史/战绩),把下面第 2 步注释掉。
-- 用法(服务器仓库根目录):
--   docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v tid=t_xxxxxxxx' < server/scripts/delete-tournament.sql

\set ON_ERROR_STOP on
BEGIN;

-- 删除前预览(确认 tid 没填错;若 tournament=0 说明 id 不对,本次什么都不会删)
SELECT
  (SELECT count(*) FROM tournaments                WHERE id = :'tid')                                        AS tournament,
  (SELECT count(*) FROM tournament_registrations   WHERE tournament_id = :'tid')                             AS registrations,
  (SELECT count(*) FROM tournament_bracket_matches WHERE tournament_id = :'tid')                             AS bracket_matches,
  (SELECT count(*) FROM tournament_bracket_matches WHERE tournament_id = :'tid' AND match_id IS NOT NULL)    AS games;

-- 先存下该赛事对阵图关联的实际比赛 id(删赛事会级联删 bracket,之后就查不到了)
CREATE TEMP TABLE _t_games ON COMMIT DROP AS
  SELECT match_id FROM tournament_bracket_matches
  WHERE tournament_id = :'tid' AND match_id IS NOT NULL;

-- 1) 删赛事 → 级联删 tournament_registrations + tournament_bracket_matches
DELETE FROM tournaments WHERE id = :'tid';

-- 2) 删该赛事打过的实际比赛 → 级联删 match_players / match_events
--    （想保留比赛记录就把这一句连同上面临时表一起注释掉）
DELETE FROM matches WHERE id IN (SELECT match_id FROM _t_games);

-- 删除后核对(都应为 0)
SELECT
  (SELECT count(*) FROM tournaments              WHERE id = :'tid')              AS tournament_left,
  (SELECT count(*) FROM tournament_registrations WHERE tournament_id = :'tid')   AS registrations_left;

COMMIT;
