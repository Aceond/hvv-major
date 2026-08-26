-- ============================================================
-- 补丁 2026-08-26：比赛胜者竞猜「自动生成 + 自动结算」
-- 全部幂等（create or replace / drop ... if exists / if not exists），可重复执行。
--
-- 新增内容：
--   1) 结算内核函数 _settle_bet_internal（供 RPC 和触发器复用）
--   2) 比赛完成触发器 trg_close_or_settle_match_bets：
--        - completed 且 winner_id 有值 → 自动按 winner_id 结算
--        - cancelled → 仅截止 closed，不结算
--   3) settle_bet RPC 改为调用 _settle_bet_internal（保留权限+赛果校验）
--   4) 回填：已存在但还缺 match_id 的 bet_polls.match_id 列 / 已有 scheduled 比赛缺竞猜 / 已有 completed 比赛未结算的竞猜
-- ============================================================


-- 1) bet_polls.match_id 列 + 唯一索引（如果之前没执行过自动生成部分的 patch）
alter table public.bet_polls add column if not exists match_id uuid
  references public.matches (id) on delete set null;
drop index if exists bet_polls_match_key;
create unique index if not exists bet_polls_match_key
  on public.bet_polls (match_id) where match_id is not null;


-- 2) 队伍强度函数（赔率计算用）—— 如已存在则幂等覆盖
create or replace function public.team_win_rate(p_team uuid, p_event uuid)
returns numeric
language sql stable security definer set search_path = public
as $$
  select case when count(*) = 0 then 0
    else count(*) filter (
      where (m.team_a_id = p_team and m.team_a_score > m.team_b_score)
         or (m.team_b_id = p_team and m.team_b_score > m.team_a_score)
    )::numeric / count(*)::numeric
  end
  from public.matches m
  where m.status = 'completed' and (m.team_a_id = p_team or m.team_b_id = p_team)
    and exists (select 1 from public.stages s where s.id = m.stage_id and s.event_id = p_event);
$$;

create or replace function public.team_strength(p_team uuid, p_event uuid)
returns numeric
language plpgsql stable security definer set search_path = public
as $$
declare
  v_win_rate numeric := 0;
  v_net numeric := 0;
  v_net_rate numeric := 0;
  v_opp_rate numeric := 0;
begin
  select
    case when count(*) = 0 then 0
      else count(*) filter (
        where (m.team_a_id = p_team and m.team_a_score > m.team_b_score)
           or (m.team_b_id = p_team and m.team_b_score > m.team_a_score)
      )::numeric / count(*)::numeric
    end,
    case when count(*) = 0 then 0
      else avg(
        case when m.team_a_id = p_team then m.team_a_score - m.team_b_score
             else m.team_b_score - m.team_a_score end
      )::numeric
    end
  into v_win_rate, v_net
  from public.matches m
  where m.status = 'completed' and (m.team_a_id = p_team or m.team_b_id = p_team)
    and exists (select 1 from public.stages s where s.id = m.stage_id and s.event_id = p_event);
  v_net_rate := greatest(0, least(1, 0.5 + v_net / 12));
  select coalesce(avg(public.team_win_rate(x.opp, p_event)), 0) into v_opp_rate
  from (
    select case when m.team_a_id = p_team then m.team_b_id else m.team_a_id end as opp
    from public.matches m
    where m.status = 'completed' and (m.team_a_id = p_team or m.team_b_id = p_team)
      and exists (select 1 from public.stages s where s.id = m.stage_id and s.event_id = p_event)
  ) x;
  return round(0.5 * v_win_rate + 0.3 * v_net_rate + 0.2 * v_opp_rate, 4);
end;
$$;


-- 3) 自动生成竞猜触发器（matches.insert）：已存在则幂等覆盖
create or replace function public.auto_create_match_bet()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_event uuid;
  v_a_rate numeric;
  v_b_rate numeric;
  v_a_odds numeric;
  v_b_odds numeric;
  v_ta_name text;
  v_tb_name text;
begin
  if new.team_a_id is null or new.team_b_id is null or new.status <> 'scheduled' then
    return new;
  end if;
  if exists (select 1 from public.bet_polls bp where bp.match_id = new.id) then
    return new;
  end if;
  select event_id into v_event from public.stages where id = new.stage_id;
  if v_event is null then
    return new;
  end if;
  v_a_rate := public.team_strength(new.team_a_id, v_event);
  v_b_rate := public.team_strength(new.team_b_id, v_event);
  v_a_odds := least(2, greatest(1.2, (greatest(v_a_rate, 0.001) + v_b_rate) / greatest(v_a_rate, 0.001)));
  v_b_odds := least(2, greatest(1.2, (greatest(v_b_rate, 0.001) + v_a_rate) / greatest(v_b_rate, 0.001)));
  select name into v_ta_name from public.teams where id = new.team_a_id;
  select name into v_tb_name from public.teams where id = new.team_b_id;
  insert into public.bet_polls (event_id, title, kind, options, match_id)
  values (
    v_event,
    '比赛胜者：' || coalesce(v_ta_name, 'A 队') || ' vs ' || coalesce(v_tb_name, 'B 队'),
    'match_winner',
    jsonb_build_array(
      jsonb_build_object(
        'id', gen_random_uuid()::text,
        'label', coalesce(v_ta_name, 'A 队') || ' 胜',
        'team_id', new.team_a_id,
        'odds', round(v_a_odds, 2)
      ),
      jsonb_build_object(
        'id', gen_random_uuid()::text,
        'label', coalesce(v_tb_name, 'B 队') || ' 胜',
        'team_id', new.team_b_id,
        'odds', round(v_b_odds, 2)
      )
    ),
    new.id
  )
  on conflict (match_id) where match_id is not null do nothing;
  return new;
end;
$$;

drop trigger if exists trg_match_auto_bet on public.matches;
create trigger trg_match_auto_bet
after insert on public.matches
for each row
execute function public.auto_create_match_bet();


-- 4) 回填：为已存在但尚未生成竞猜的待赛对阵补生成（可重复执行）
insert into public.bet_polls (event_id, title, kind, options, match_id)
select
  s.event_id,
  '比赛胜者：' || ta.name || ' vs ' || tb.name,
  'match_winner',
  jsonb_build_array(
    jsonb_build_object(
      'id', gen_random_uuid()::text,
      'label', ta.name || ' 胜',
      'team_id', m.team_a_id,
      'odds', round(least(2, greatest(1.2, (greatest(public.team_strength(m.team_a_id, s.event_id), 0.001) + public.team_strength(m.team_b_id, s.event_id)) / greatest(public.team_strength(m.team_a_id, s.event_id), 0.001))), 2)
    ),
    jsonb_build_object(
      'id', gen_random_uuid()::text,
      'label', tb.name || ' 胜',
      'team_id', m.team_b_id,
      'odds', round(least(2, greatest(1.2, (greatest(public.team_strength(m.team_b_id, s.event_id), 0.001) + public.team_strength(m.team_a_id, s.event_id)) / greatest(public.team_strength(m.team_b_id, s.event_id), 0.001))), 2)
    )
  ),
  m.id
from public.matches m
join public.stages s on s.id = m.stage_id
join public.teams ta on ta.id = m.team_a_id
join public.teams tb on tb.id = m.team_b_id
where m.status = 'scheduled'
  and not exists (select 1 from public.bet_polls bp where bp.match_id = m.id)
on conflict (match_id) where match_id is not null do nothing;


-- 5) 自动结算内核函数（无权限校验）—— 供触发器和 settle_bet RPC 复用
create or replace function public._settle_bet_internal(
  p_poll_id uuid,
  p_winning_option_id text
) returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_poll public.bet_polls%rowtype;
  v_rec record;
begin
  select * into v_poll from public.bet_polls where id = p_poll_id;
  if v_poll.id is null then return; end if;
  if v_poll.status = 'settled' then return; end if;
  if not exists (
    select 1 from jsonb_array_elements(v_poll.options) o where o ->> 'id' = p_winning_option_id
  ) then return; end if;
  update public.bet_polls
  set status = 'settled', winning_option_id = p_winning_option_id
  where id = p_poll_id;
  for v_rec in
    select * from public.bet_records where poll_id = p_poll_id and status = 'pending'
  loop
    if v_rec.option_id = p_winning_option_id then
      update public.bet_records set status = 'won' where id = v_rec.id;
      update public.bet_accounts
      set points = points + round(v_rec.stake * v_rec.odds), updated_at = now()
      where user_id = v_rec.user_id;
    else
      update public.bet_records set status = 'lost' where id = v_rec.id;
    end if;
  end loop;
end;
$$;


-- 6) 比赛完成/取消 联动：completed → 自动结算；cancelled → 仅截止
create or replace function public.close_or_settle_match_bets()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_poll public.bet_polls%rowtype;
  v_win_opt jsonb;
begin
  for v_poll in
    select * from public.bet_polls
    where match_id = new.id and kind = 'match_winner' and status <> 'settled'
  loop
    if new.status = 'completed' and new.winner_id is not null then
      select o into v_win_opt
      from jsonb_array_elements(v_poll.options) o
      where (o ->> 'team_id')::uuid = new.winner_id
      limit 1;
      if v_win_opt is not null then
        perform public._settle_bet_internal(v_poll.id, v_win_opt ->> 'id');
        continue;
      end if;
    end if;
    update public.bet_polls set status = 'closed' where id = v_poll.id;
  end loop;
  return new;
end;
$$;

drop trigger if exists trg_close_match_bets on public.matches;
drop trigger if exists trg_close_or_settle_match_bets on public.matches;
create trigger trg_close_or_settle_match_bets
after update on public.matches
for each row
when (old.status = 'scheduled' and new.status in ('completed', 'cancelled'))
execute function public.close_or_settle_match_bets();


-- 7) settle_bet RPC 重写：调用 _settle_bet_internal，保留管理员权限校验 + 赛果一致性校验
create or replace function public.settle_bet(p_poll_id uuid, p_winning_option_id text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_poll public.bet_polls%rowtype;
  v_match public.matches%rowtype;
  v_win_opt jsonb;
begin
  if not public.is_admin() then
    raise exception '仅管理员可手动结算竞猜';
  end if;
  select * into v_poll from public.bet_polls where id = p_poll_id;
  if v_poll.id is null then raise exception '竞猜项不存在'; end if;
  if v_poll.status = 'settled' then raise exception '该竞猜已结算'; end if;
  if not exists (
    select 1 from jsonb_array_elements(v_poll.options) o where o ->> 'id' = p_winning_option_id
  ) then raise exception '中奖选项不存在'; end if;
  if v_poll.kind = 'match_winner' and v_poll.match_id is not null then
    select * into v_match from public.matches where id = v_poll.match_id;
    if v_match.id is not null and v_match.status = 'scheduled' then
      raise exception '比赛尚未结束，请先录入比分';
    end if;
    if v_match.id is not null and v_match.status = 'completed' and v_match.winner_id is not null then
      select o into v_win_opt
      from jsonb_array_elements(v_poll.options) o
      where o ->> 'id' = p_winning_option_id
      limit 1;
      if (v_win_opt ->> 'team_id')::uuid is distinct from v_match.winner_id then
        raise exception '所选胜者与实际比赛结果不符，请核对后结算';
      end if;
    end if;
  end if;
  perform public._settle_bet_internal(p_poll_id, p_winning_option_id);
end;
$$;

grant execute on function public.settle_bet(uuid, text) to authenticated;
grant execute on function public._settle_bet_internal(uuid, text) to authenticated;
grant execute on function public.close_or_settle_match_bets() to authenticated;


-- 8) 回填 A：把所有 status = 'completed' 且 winner_id 不为空 的比赛，其 match_winner 竞猜一次性结算
--    （如果竞猜已经 settled 或 status != 'open'/'closed'，内部函数会幂等跳过或根据当前 winner 结算）
do $$
declare
  v_poll record;
  v_win_opt jsonb;
begin
  for v_poll in
    select bp.id as poll_id, bp.options, m.winner_id
    from public.bet_polls bp
    join public.matches m on m.id = bp.match_id
    where bp.kind = 'match_winner'
      and bp.status <> 'settled'
      and m.status = 'completed'
      and m.winner_id is not null
  loop
    select o into v_win_opt
    from jsonb_array_elements(v_poll.options) o
    where (o ->> 'team_id')::uuid = v_poll.winner_id
    limit 1;
    if v_win_opt is not null then
      perform public._settle_bet_internal(v_poll.poll_id, v_win_opt ->> 'id');
    end if;
  end loop;
end;
$$;

-- 9) 回填 B：status != 'completed' 但比赛被取消 / 已 closed 的竞猜，将其置为 closed（避免用户还能继续投注）
update public.bet_polls bp
set status = 'closed'
from public.matches m
where bp.match_id = m.id
  and bp.kind = 'match_winner'
  and bp.status = 'open'
  and m.status in ('completed', 'cancelled');
