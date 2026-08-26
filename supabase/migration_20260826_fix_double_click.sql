-- ============================================================
-- 1) 先补 map_count + 唯一约束（已在 schema.sql 里；重复执行安全）
-- ============================================================
alter table public.match_maps
  add column if not exists map_count int not null default 1;

-- 回填已有数据：重复提交的 6 局按 match_id 分组建序 1..6
update public.match_maps mm
set map_count = sub.rn
from (
  select id,
         row_number() over (
           partition by match_id
           order by (created_at is not null) desc, created_at asc, id asc
         ) as rn
  from public.match_maps
  where true
) sub
where mm.id = sub.id;

alter table public.match_maps
  drop constraint if exists match_maps_match_id_map_count_key;
alter table public.match_maps
  add constraint match_maps_match_id_map_count_key unique (match_id, map_count);

-- ============================================================
-- 2) 清理「double click 导致 BO3 变 6 局」的脏数据：
--    对每个 match_id，只保留 map_count 最小的 BO 值条记录
--    （matches.best_of 没取到则保守用 3）
-- ============================================================
with keepers as (
  select mm.id,
         mm.match_id,
         mm.map_count,
         coalesce(
           nullif(m.best_of, 0),
           (select count(*) from public.match_maps x where x.match_id = mm.match_id) / 2,
           3
         ) as bo
  from public.match_maps mm
  left join public.matches m on m.id = mm.match_id
),
to_delete as (
  select k.id
  from keepers k
  where k.map_count > greatest(1, least(k.bo, 5))   -- BO1/3/5 封顶，防止 BO 异常
    and exists (
      select 1
      from public.match_maps x
      where x.match_id = k.match_id
      group by x.match_id
      having count(*) > greatest(1, least(k.bo, 5))
    )
)
delete from public.match_maps d
using to_delete t
where d.id = t.id;

-- ============================================================
-- 3) 清完再强制把剩下的 map_count 重排为 1,2,3…（避免跳号/同号）
-- ============================================================
update public.match_maps mm
set map_count = sub.rn
from (
  select id,
         row_number() over (
           partition by match_id
           order by map_count asc, (created_at is not null) desc, created_at asc, id asc
         ) as rn
  from public.match_maps
  where true
) sub
where mm.id = sub.id;

-- ============================================================
-- 4) 重建唯一约束（上一步重排后理论上唯一，兜底）
-- ============================================================
alter table public.match_maps
  drop constraint if exists match_maps_match_id_map_count_key;
alter table public.match_maps
  add constraint match_maps_match_id_map_count_key unique (match_id, map_count);

-- ============================================================
-- 5) 重置 upsert_match_result（扩展 p_maps jsonb，事务内原子删插逐图）
-- ============================================================
create or replace function public.upsert_match_result(
  p_match_id uuid,
  p_team_a_score int,
  p_team_b_score int,
  p_maps jsonb default null
) returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_winner uuid;
  v_match public.matches%rowtype;
  v_item jsonb;
  v_mc int;
  v_mn text;
  v_ts int;
  v_bs int;
  v_w uuid;
begin
  select * into v_match from public.matches where id = p_match_id;
  if v_match.id is null then
    raise exception 'match not found';
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

  v_winner := case
    when p_team_a_score > p_team_b_score then v_match.team_a_id
    when p_team_b_score > p_team_a_score then v_match.team_b_id
    else null
  end;

  update public.matches
  set team_a_score = p_team_a_score,
      team_b_score = p_team_b_score,
      winner_id   = v_winner,
      status      = 'completed'
  where id = p_match_id;

  -- 逐图比分：有 p_maps 就事务内先删该 match_id 全部旧记录，再插入新记录
  -- 配合 (match_id, map_count) 唯一约束，double click 不会追加出 6 局
  if p_maps is not null and jsonb_array_length(p_maps) > 0 then
    delete from public.match_maps where match_id = p_match_id;

    for v_item in select * from jsonb_array_elements(p_maps) loop
      v_mc := coalesce((v_item->>'map_count')::int, 1);
      v_mn := coalesce(v_item->>'map_name', '');
      v_ts := coalesce((v_item->>'team_a_score')::int, 0);
      v_bs := coalesce((v_item->>'team_b_score')::int, 0);
      v_w  := case
        when v_ts > v_bs then v_match.team_a_id
        when v_bs > v_ts then v_match.team_b_id
        else null
      end;

      insert into public.match_maps (match_id, map_count, map_name, team_a_score, team_b_score, winner_id)
      values (p_match_id, v_mc, v_mn, v_ts, v_bs, v_w)
      on conflict (match_id, map_count) do update
        set map_name     = excluded.map_name,
            team_a_score = excluded.team_a_score,
            team_b_score = excluded.team_b_score,
            winner_id    = excluded.winner_id;
    end loop;
  end if;
end;
$$;
