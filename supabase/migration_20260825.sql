-- ============================================================
-- 待执行补丁 2026-08-25（请在 Supabase SQL Editor 中整段执行）
-- 全部幂等：add column if not exists / drop ... if exists，可重复执行
-- 主要修复：matches 表缺 bracket 列导致的 "column bracket does not exist" 报错
-- ============================================================

-- 1) matches 表补 bracket / sort_order 列（修复自动匹配下一轮报错）
alter table public.matches
  add column if not exists bracket text not null default 'wb'
    check (bracket in ('wb', 'lb', 'gf'));

alter table public.matches
  add column if not exists sort_order int not null default 0;

-- 老数据回填 sort_order（只处理仍为 0 的行，按创建顺序编号）
update public.matches m
set sort_order = sub.rn - 1
from (
  select id,
         row_number() over (
           partition by stage_id, round_number, bracket
           order by created_at, id
         ) as rn
  from public.matches
  where sort_order = 0
) sub
where m.id = sub.id;


-- 2) match_player_stats 表：map_name 列 + 唯一约束升级（按地图逐图录入 BO3 = 三张图三行）
alter table public.match_player_stats
  add column if not exists map_name text not null default '';

alter table public.match_player_stats
  drop constraint if exists match_player_stats_match_id_player_id_key;

alter table public.match_player_stats
  drop constraint if exists match_player_stats_match_id_map_name_player_id_key;

alter table public.match_player_stats
  add constraint match_player_stats_match_id_map_player_key
    unique (match_id, map_name, player_id);


-- 3) RPC：insert_playoff_matches（security definer，管理员/参赛队队长均可批量写入下一轮，幂等）
create or replace function public.insert_playoff_matches(p_stage_id uuid, p_matches jsonb)
returns int
language plpgsql security definer set search_path = public
as $$
declare
  v_item jsonb;
  v_br text;
  v_rn int;
  v_so int;
  v_a uuid;
  v_b uuid;
  v_bo int;
  v_inserted int := 0;
  v_fmt text;
  v_user uuid := auth.uid();
begin
  if v_user is null then raise exception '请先登录'; end if;
  if p_matches is null then return 0; end if;
  select format into v_fmt from public.stages where id = p_stage_id;
  if v_fmt not in ('single_elim', 'double_elim') then return 0; end if;
  -- 权限：管理员，或该阶段任一已完成比赛的参赛队队长
  if not (
    public.is_admin()
    or exists (
      select 1 from public.matches m
      where m.stage_id = p_stage_id and m.status = 'completed'
        and (
          exists (select 1 from public.teams t where t.id = m.team_a_id and t.captain_id = v_user)
          or exists (select 1 from public.teams t where t.id = m.team_b_id and t.captain_id = v_user)
        )
    )
  ) then
    raise exception '仅管理员或参赛队队长可自动匹配下一轮';
  end if;

  for v_item in select * from jsonb_array_elements(p_matches) loop
    v_br := coalesce(v_item->>'bracket', 'wb');
    v_rn := coalesce((v_item->>'round_number')::int, 1);
    v_so := coalesce((v_item->>'sort_order')::int, 0);
    v_a := (v_item->>'team_a_id')::uuid;
    v_b := (v_item->>'team_b_id')::uuid;
    v_bo := coalesce((v_item->>'best_of')::int, 3);
    if v_a is null or v_b is null or v_a = v_b then continue; end if;
    -- 幂等：同赛组同轮次且双方一致的对阵已存在则跳过
    if not exists (
      select 1 from public.matches
      where stage_id = p_stage_id and bracket = v_br and round_number = v_rn
        and ((team_a_id = v_a and team_b_id = v_b) or (team_a_id = v_b and team_b_id = v_a))
    ) then
      insert into public.matches (stage_id, round_number, bracket, sort_order, team_a_id, team_b_id, best_of, status)
      values (p_stage_id, v_rn, v_br, v_so, v_a, v_b, v_bo, 'scheduled');
      v_inserted := v_inserted + 1;
    end if;
  end loop;
  return v_inserted;
end;
$$;

grant execute on function public.insert_playoff_matches(uuid, jsonb) to authenticated;


-- 4) match_player_stats RLS：参赛队队长也可增删改（之前仅管理员可写）
alter table public.match_player_stats enable row level security;

drop policy if exists match_player_stats_select on public.match_player_stats;
create policy match_player_stats_select on public.match_player_stats
  for select using (true);

drop policy if exists match_player_stats_write on public.match_player_stats;
create policy match_player_stats_write on public.match_player_stats
  for all using (
    public.can_use_features()
    and (
      public.is_admin()
      or exists (
        select 1 from public.matches m
        join public.teams t on t.id in (m.team_a_id, m.team_b_id)
        where m.id = match_id and t.captain_id = auth.uid()
      )
    )
  ) with check (
    public.can_use_features()
    and (
      public.is_admin()
      or exists (
        select 1 from public.matches m
        join public.teams t on t.id in (m.team_a_id, m.team_b_id)
        where m.id = match_id and t.captain_id = auth.uid()
      )
    )
  );

grant insert, update, delete on public.match_player_stats to authenticated;
