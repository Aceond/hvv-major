-- ============================================================
-- HVV Major · PWA 战绩自动导入（2026-09-01）
-- 在 Supabase SQL Editor 执行本脚本即可（幂等，可重复执行）。
-- 1) 开放 authenticated 读取 profiles.steam_id（战绩导入按 Steam64 匹配队员用）
-- 2) 新增 upsert_match_map RPC：单图比分 upsert + 自动重算总比分
-- ============================================================

-- ---------- 1. profiles.steam_id 读权限（authenticated） ----------
-- 原授权仅含（id, username, email, nickname, pw_username, role, highest_rank,
--   highest_rating, account_status, created_at）；这里按新列集重发一次，
-- 使队长/管理员能读到双方队员的 steam_id，供 PWA 自动导入匹配。
grant select (id, username, email, nickname, pw_username, role, highest_rank,
  highest_rating, account_status, created_at, steam_id)
  on public.profiles to authenticated;

-- ---------- 2. upsert_match_map：单图比分 upsert + 总比分重算 ----------
-- 按 (match_id, map_count) 覆盖/插入一张图比分，并根据 match_maps 全量重算
-- 总比分与胜者（BO3 逐图导入互不覆盖，不会变成 6 局）。
create or replace function public.upsert_match_map(
  p_match_id uuid,
  p_map_count int,
  p_map_name text,
  p_team_a_score int,
  p_team_b_score int
) returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_match public.matches%rowtype;
  v_w uuid;
  v_a_wins int;
  v_b_wins int;
  v_total_winner uuid;
begin
  select * into v_match from public.matches where id = p_match_id;
  if v_match.id is null then
    raise exception 'match not found';
  end if;

  -- 权限：管理员，或参赛队队长（账号需审核通过）
  if not public.is_admin() and not exists (
    select 1 from public.teams t
    where (t.id = v_match.team_a_id or t.id = v_match.team_b_id)
      and t.captain_id = auth.uid()
  ) and not public.can_use_features() then
    raise exception 'permission denied: only admin or team captain';
  end if;
  if not public.is_admin() and not public.can_use_features() then
    raise exception 'permission denied: account not approved';
  end if;
  if not public.is_admin() and not exists (
    select 1 from public.teams t
    where (t.id = v_match.team_a_id or t.id = v_match.team_b_id)
      and t.captain_id = auth.uid()
  ) then
    raise exception 'permission denied: only admin or team captain';
  end if;

  v_w := case
    when p_team_a_score > p_team_b_score then v_match.team_a_id
    when p_team_b_score > p_team_a_score then v_match.team_b_id
    else null
  end;

  insert into public.match_maps (match_id, map_count, map_name, team_a_score, team_b_score, winner_id)
  values (p_match_id, p_map_count, p_map_name, p_team_a_score, p_team_b_score, v_w)
  on conflict (match_id, map_count) do update
    set map_name = excluded.map_name,
        team_a_score = excluded.team_a_score,
        team_b_score = excluded.team_b_score,
        winner_id = excluded.winner_id;

  -- 按已录地图重算总比分（每张图按 winner 计 1 分）
  select
    count(*) filter (where winner_id = v_match.team_a_id),
    count(*) filter (where winner_id = v_match.team_b_id)
  into v_a_wins, v_b_wins
  from public.match_maps
  where match_id = p_match_id;

  v_total_winner := case
    when v_a_wins > v_b_wins then v_match.team_a_id
    when v_b_wins > v_a_wins then v_match.team_b_id
    else null
  end;

  update public.matches
  set team_a_score = v_a_wins,
      team_b_score = v_b_wins,
      winner_id = v_total_winner,
      status = 'completed'
  where id = p_match_id;
end;
$$;

grant execute on function public.upsert_match_map(uuid, int, text, int, int) to authenticated;
