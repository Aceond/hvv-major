-- ============================================================
-- 比赛队员数据 录入口径升级：
--   UI 改为 爆头率(整数%) + ADR(小数) 录入；后台按加权公式自动计算赛事期间的爆头率和 ADR。
--   爆头率 = Σ round(kills * headshot_rate_pct) / (Σ kills) （单位%等价于 ÷Σkills * 100）
--   ADR    = Σ round(adr * rounds) / Σ rounds
-- 兼容：旧 headshots / damage 列保留（由新列反算继续落盘），历史数据新列从旧列反推。
-- ============================================================

-- 0) player_stats 唯一约束对齐：从「每名选手一行」改为和 team_stats 一致的「选手 × 阶段」(profile_id, stage_id)，
--    这样下方 upsert 的 on conflict 才能命中，后台刷新触发器（按 stage 粒度）语义也才对齐。
alter table public.player_stats drop constraint if exists player_stats_profile_id_stage_id_key;
alter table public.player_stats drop constraint if exists player_stats_profile_id_key;
delete from public.player_stats a
using public.player_stats b
where a.profile_id = b.profile_id
  and a.stage_id is not distinct from b.stage_id
  and a.id < b.id;
alter table public.player_stats
  add constraint player_stats_profile_id_stage_id_key unique (profile_id, stage_id);

-- 1) match_player_stats 表加新列（幂等）
alter table public.match_player_stats
  add column if not exists headshot_rate_pct int not null default 0;   -- 0~100（整数%）
alter table public.match_player_stats
  add column if not exists adr numeric(6,2) not null default 0;       -- 每图平均伤害(小数)

-- 2) 已有数据按旧列反推 headshot_rate_pct / adr（一次回填）
update public.match_player_stats
set headshot_rate_pct =
      case when kills > 0 then round((headshots::numeric / nullif(kills, 0)) * 100)::int
           else 0 end,
    adr =
      case when rounds > 0 then round((damage::numeric / nullif(rounds, 0)) * 100)::numeric / 100
           else 0 end
where headshot_rate_pct = 0 and adr = 0;   -- 不覆盖手工可能已填过的新列

-- ============================================================
-- 3) 后台汇总函数：match_player_stats 或 matches 变化时按阶段+组别
--    自动 upsert 到 player_stats / team_stats（hs_rate / adr / 击杀等），
--    其余统计维度(胜率/pistol_win_rate 等)仍由后台手工录入互不覆盖。
-- ============================================================
create or replace function public.refresh_stage_stats_from_match_player_stats(p_stage_id uuid default null, p_group_id uuid default null)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  -- 3.1 player_stats（与前端 aggregatePlayerRows 严格对齐）
  --   matches：逐行"row_stat_sum>0=有效参赛"→ match 级别 played 汇总（按比赛数展示）
  --   win_rate：按图口径 = 赢的图数 ÷ 有效参赛的图数（match_maps.winner_id 逐图胜负，回退比赛 winner_id；BO3 2:1 = 66.67%）
  --   we / rating_pro = Σ / 图数（与 avg_kills/avg_deaths 一致）
  with all_rows as (
    select mps.player_id,
           mps.team_id,
           m.stage_id,
           m.group_id,
           mps.match_id,
           m.winner_id as match_winner_id,
           mps.map_name,
           mps.map_count,
           mps.kills,
           mps.deaths,
           mps.assists,
           mps.headshot_rate_pct,
           mps.adr,
           mps.first_kills,
           mps.multi_kills,
           mps.clutches,
           mps.rounds,
           mps.we,
           mps.rating,
           coalesce((
             select mm.winner_id from public.match_maps mm
             where mm.match_id = mps.match_id
               and mm.map_name = mps.map_name
             limit 1
           ), m.winner_id) as map_winner_id,
           (mps.kills + mps.deaths + mps.assists +
            mps.headshot_rate_pct + coalesce(abs(mps.adr), 0) +
            mps.first_kills + mps.multi_kills + mps.clutches +
            coalesce(abs(mps.we), 0) + coalesce(abs(mps.rating), 0)) as row_stat_sum
    from public.match_player_stats mps
    join public.matches m on m.id = mps.match_id and m.status = 'completed'
    where (p_stage_id is null or m.stage_id = p_stage_id)
      and (p_group_id is null or m.group_id = p_group_id)
  ),
  match_level as (
    select player_id, team_id, stage_id, group_id, match_id,
           bool_or(row_stat_sum > 0) as played
    from all_rows
    group by player_id, team_id, stage_id, group_id, match_id
  ),
  per_match_agg as (
    select player_id, team_id, stage_id, group_id,
           count(*) filter (where played) as matches
    from match_level
    group by player_id, team_id, stage_id, group_id
  ),
  base as (
    select r.player_id,
           r.team_id,
           r.stage_id,
           r.group_id,
           coalesce(pm.matches, 0) as matches,
           sum(r.kills) as kills,
           sum(r.deaths) as deaths,
           sum(r.assists) as assists,
           sum(r.map_count) as maps,
           sum(r.map_count) filter (where r.row_stat_sum > 0) as played_maps,
           sum(r.map_count) filter (where r.row_stat_sum > 0 and r.map_winner_id is not null and r.map_winner_id = r.team_id) as win_maps,
           round(coalesce(sum(round(r.kills * nullif(r.headshot_rate_pct, 0)::numeric)), 0)) as wghs_num,
           sum(r.kills) as wghs_den,
           sum(round((r.adr * r.rounds)::numeric)) as wadr_num,
           sum(r.rounds) as wadr_den,
           sum(r.we::numeric) as we_sum,
           sum(r.rating::numeric) as rating_sum
    from all_rows r
    left join per_match_agg pm
      on  pm.player_id = r.player_id
      and pm.team_id is not distinct from r.team_id
      and pm.stage_id is not distinct from r.stage_id
      and pm.group_id is not distinct from r.group_id
    group by r.player_id, r.team_id, r.stage_id, r.group_id, pm.matches
  ),
  agg as (
    select b.player_id,
           b.team_id,
           b.stage_id,
           b.group_id,
           b.matches,
           b.kills as total_kills,
           b.deaths as total_deaths,
           b.assists as total_assists,
           round(coalesce(b.wghs_num::numeric / nullif(b.wghs_den, 0), 0), 2)::numeric(5,2) as hs_rate,
           round(coalesce(b.wadr_num::numeric / nullif(b.wadr_den, 0), 0), 2)::numeric(6,2) as adr,
           round(coalesce(b.kills::numeric / nullif(b.deaths, 0), 0), 2)::numeric(5,2) as kd,
           round(coalesce(b.win_maps::numeric / nullif(b.played_maps, 0) * 100, 0), 2)::numeric(5,2) as win_rate,
           round(coalesce(b.we_sum / nullif(b.maps, 0), 0), 2)::numeric(5,2) as we,
           round(coalesce(b.rating_sum / nullif(b.maps, 0), 0), 2)::numeric(4,2) as rating_pro
    from base b
  )
  insert into public.player_stats (profile_id, team_id, stage_id, group_id, matches, total_kills, total_deaths, total_assists, hs_rate, adr, kd, win_rate, we, rating_pro)
  select a.player_id, a.team_id, a.stage_id, a.group_id, a.matches, a.total_kills, a.total_deaths, a.total_assists, a.hs_rate, a.adr, a.kd, a.win_rate, a.we, a.rating_pro
  from agg a
  on conflict (profile_id, stage_id) do update
  set team_id = excluded.team_id,
      group_id = excluded.group_id,
      matches  = excluded.matches,
      total_kills = excluded.total_kills,
      total_deaths = excluded.total_deaths,
      total_assists = excluded.total_assists,
      hs_rate  = excluded.hs_rate,
      adr      = excluded.adr,
      kd       = excluded.kd,
      win_rate = excluded.win_rate,
      we       = excluded.we,
      rating_pro = excluded.rating_pro;

  -- 3.2 team_stats（注：team_stats 现表无 adr 列，前后台也不展示战队 ADR，这里只写该表现有列）
  with tbase as (
    select mps.team_id,
           m.stage_id,
           m.group_id,
           count(distinct mps.match_id) as matches,
           sum(mps.kills) as kills,
           sum(mps.deaths) as deaths,
           sum(mps.assists) as assists,
           round(coalesce(sum(round(mps.kills * nullif(mps.headshot_rate_pct, 0)::numeric)), 0)) as wghs_num,
           sum(mps.kills) as wghs_den
    from public.match_player_stats mps
    join public.matches m on m.id = mps.match_id and m.status = 'completed'
    where (p_stage_id is null or m.stage_id = p_stage_id)
      and (p_group_id is null or m.group_id = p_group_id)
    group by mps.team_id, m.stage_id, m.group_id
  ),
  tagg as (
    select b.team_id, b.stage_id, b.group_id, b.matches,
           b.kills as total_kills, b.deaths as total_deaths, b.assists as total_assists,
           round(coalesce(b.kills::numeric / nullif(b.deaths, 0), 0), 2)::numeric(5,2) as kd,
           -- 爆头率 = Σ(kills × 每图爆头率整数%) ÷ Σkills，单位百分比 0~100
           round(coalesce(b.wghs_num::numeric / nullif(b.wghs_den, 0), 0), 2)::numeric(5,2) as hs_rate,
           round(coalesce(b.kills::numeric  / nullif(nullif(b.matches, 0), 1), 0), 2)::numeric(6,2) as avg_kills,
           round(coalesce(b.deaths::numeric / nullif(nullif(b.matches, 0), 1), 0), 2)::numeric(6,2) as avg_deaths,
           round(coalesce(b.assists::numeric / nullif(nullif(b.matches, 0), 1), 0), 2)::numeric(6,2) as avg_assists
    from tbase b
  )
  insert into public.team_stats (team_id, stage_id, group_id, matches, total_kills, total_deaths, total_assists, kd, hs_rate, avg_kills, avg_deaths, avg_assists)
  select t.team_id, t.stage_id, t.group_id, t.matches, t.total_kills, t.total_deaths, t.total_assists, t.kd, t.hs_rate, t.avg_kills, t.avg_deaths, t.avg_assists
  from tagg t
  on conflict (team_id, stage_id) do update
  set group_id = excluded.group_id,
      matches  = excluded.matches,
      total_kills = excluded.total_kills,
      total_deaths = excluded.total_deaths,
      total_assists = excluded.total_assists,
      kd       = excluded.kd,
      hs_rate  = excluded.hs_rate,
      avg_kills  = excluded.avg_kills,
      avg_deaths = excluded.avg_deaths,
      avg_assists = excluded.avg_assists;
end;
$$;

-- 4) match_player_stats I/U/D → 重算
drop trigger if exists trg_auto_refresh_stage_stats on public.match_player_stats;
drop function if exists public.on_match_player_stats_changed();
create or replace function public.on_match_player_stats_changed() returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_match public.matches%rowtype;
begin
  if tg_op = 'DELETE' then
    select * into v_match from public.matches where id = old.match_id;
  else
    select * into v_match from public.matches where id = new.match_id;
  end if;
  if v_match.id is not null then
    perform public.refresh_stage_stats_from_match_player_stats(v_match.stage_id, v_match.group_id);
  end if;
  return null;
end;
$$;
create trigger trg_auto_refresh_stage_stats
after insert or update or delete on public.match_player_stats
for each statement
execute function public.on_match_player_stats_changed();

-- 5) matches status 切换到 completed 时 → 重算（确保状态变化时汇总表也同步）
drop trigger if exists trg_auto_refresh_stage_stats_matches on public.matches;
drop function if exists public.on_match_status_completed_changed();
create or replace function public.on_match_status_completed_changed() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if (old.status <> 'completed' and new.status = 'completed')
    or (new.status <> old.status and (new.status = 'completed' or old.status = 'completed')) then
    perform public.refresh_stage_stats_from_match_player_stats(new.stage_id, new.group_id);
  end if;
  return null;
end;
$$;
create trigger trg_auto_refresh_stage_stats_matches
after update of status on public.matches
for each row
execute function public.on_match_status_completed_changed();

-- 6) 初次部署：全量刷新一次 player_stats / team_stats（把现存已录入队员统计数据的阶段立刻汇总出来）
select public.refresh_stage_stats_from_match_player_stats(null, null);
