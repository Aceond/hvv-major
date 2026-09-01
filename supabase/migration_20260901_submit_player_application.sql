-- ============================================================
-- 迁移：个人选手注册「覆盖更新 + 自动通过」
-- 在 Supabase SQL Editor 中执行本脚本（幂等，可重复执行）。
-- ============================================================

-- 个人选手注册提交（覆盖更新 + 自动通过）
-- 规则：同一选手(profile_id) + 同一赛事(event_id) 若已有待审(pending)申请，
--   再次提交时覆盖更新该条，而非新增重复申请。
-- 自动通过：仅当该选手该赛事此前已有过 approved 记录，且本次相对原待审申请
--   「只补齐了原为空的字段、其余已填字段完全未变」时，才直接置为 approved 并回填资料。
-- 由于普通用户受 player_applications update RLS(仅管理员)限制，本函数以 security definer 执行。
create or replace function public.submit_player_application(
  p_event_id uuid,
  p_pw_username text,
  p_display_name text,
  p_steam_id text,
  p_highest_rank text,
  p_highest_rating numeric,
  p_screenshots jsonb,
  p_employment_status text,
  p_location text,
  p_employee_no text
)
returns public.player_applications
language plpgsql security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_existing public.player_applications;
  v_result public.player_applications;
  v_prev_approved boolean := false;
  v_auto_pass boolean := true;   -- 默认本可自动通过，发现任一已填字段被改动则置 false
  v_pw text := btrim(coalesce(p_pw_username, ''));
  v_display text := btrim(coalesce(p_display_name, ''));
  v_steam text := btrim(coalesce(p_steam_id, ''));
  v_rank text := btrim(coalesce(p_highest_rank, ''));
  v_rating numeric := case when p_highest_rating is null then null else p_highest_rating end;
  v_emp text := coalesce(p_employment_status, '');
  v_loc text := case when p_employment_status = 'employed' then btrim(coalesce(p_location, '')) else null end;
  v_no text := case when p_employment_status = 'employed' then btrim(coalesce(p_employee_no, '')) else null end;
  v_screens jsonb := coalesce(p_screenshots, '[]'::jsonb);
  v_stage_id uuid;
  v_group_id uuid;
  v_old_pw_empty boolean;
  v_old_display_empty boolean;
  v_old_steam_empty boolean;
  v_old_rank_empty boolean;
  v_old_rating_empty boolean;
  v_old_emp_empty boolean;
  v_old_loc_empty boolean;
  v_old_no_empty boolean;
  v_old_screens_empty boolean;
  v_keep_role boolean;
begin
  if uid is null then
    raise exception '登录状态已失效，请重新登录后再提交';
  end if;
  if v_pw = '' or v_display = '' or p_event_id is null then
    raise exception '请填写完美 ID、姓名并选择报名的赛事';
  end if;
  if p_employment_status = 'employed' and (v_loc = '' or v_no = '') then
    raise exception '在职状态请填写驻地和工号';
  end if;

  -- 该选手该赛事最新一条待审申请
  select * into v_existing
  from public.player_applications
  where profile_id = uid and event_id = p_event_id and status = 'pending'
  order by created_at desc
  limit 1;

  -- 该选手该赛事是否已有通过记录（自动通过的前提）
  select exists(
    select 1 from public.player_applications
    where profile_id = uid and event_id = p_event_id and status = 'approved'
  ) into v_prev_approved;

  if v_existing.id is null then
    -- 无待审：直接新增
    insert into public.player_applications (
      profile_id, event_id, pw_username, steam_id, display_name,
      highest_rank, highest_rating, screenshots, employment_status, location, employee_no, status
    ) values (
      uid, p_event_id, v_pw, nullif(v_steam, ''), v_display,
      nullif(v_rank, ''), v_rating, v_screens, p_employment_status, v_loc, v_no, 'pending'
    )
    returning * into v_result;
    return v_result;
  end if;

  -- 已有待审：对比字段，判定本次是否「只补空字段、其余未变」
  v_old_pw_empty := v_existing.pw_username is null or v_existing.pw_username = '';
  v_old_display_empty := v_existing.display_name is null or v_existing.display_name = '';
  v_old_steam_empty := v_existing.steam_id is null or v_existing.steam_id = '';
  v_old_rank_empty := v_existing.highest_rank is null or v_existing.highest_rank = '';
  v_old_rating_empty := v_existing.highest_rating is null;
  v_old_emp_empty := v_existing.employment_status is null or v_existing.employment_status = '';
  v_old_loc_empty := v_existing.location is null or v_existing.location = '';
  v_old_no_empty := v_existing.employee_no is null or v_existing.employee_no = '';
  v_old_screens_empty := v_existing.screenshots is null
    or jsonb_array_length(coalesce(v_existing.screenshots, '[]'::jsonb)) = 0;

  -- 旧值非空且本次新值不同 → 视为「改动」，禁止自动通过（只允许空→有值）
  if not v_old_pw_empty and v_existing.pw_username <> v_pw then v_auto_pass := false; end if;
  if not v_old_display_empty and v_existing.display_name <> v_display then v_auto_pass := false; end if;
  if not v_old_steam_empty and v_existing.steam_id <> nullif(v_steam, '') then v_auto_pass := false; end if;
  if not v_old_rank_empty and v_existing.highest_rank <> nullif(v_rank, '') then v_auto_pass := false; end if;
  if not v_old_rating_empty and v_existing.highest_rating is distinct from v_rating then v_auto_pass := false; end if;
  if not v_old_emp_empty and v_existing.employment_status <> p_employment_status then v_auto_pass := false; end if;
  if not v_old_loc_empty and v_existing.location is distinct from v_loc then v_auto_pass := false; end if;
  if not v_old_no_empty and v_existing.employee_no is distinct from v_no then v_auto_pass := false; end if;
  if not v_old_screens_empty
     and jsonb_array_length(coalesce(v_existing.screenshots, '[]'::jsonb)) <> jsonb_array_length(v_screens)
  then v_auto_pass := false; end if;

  -- 自动通过 = 此前已通过过 且 仅补空字段
  v_auto_pass := v_auto_pass and v_prev_approved;

  -- 覆盖更新（字段一律按本次提交刷新；status 据 auto_pass 决定）
  update public.player_applications
  set pw_username = v_pw,
      steam_id = nullif(v_steam, ''),
      display_name = v_display,
      highest_rank = nullif(v_rank, ''),
      highest_rating = v_rating,
      screenshots = v_screens,
      employment_status = p_employment_status,
      location = v_loc,
      employee_no = v_no,
      status = case when v_auto_pass then 'approved' else 'pending' end,
      review_note = case when v_auto_pass then null else v_existing.review_note end,
      reviewed_at = case when v_auto_pass then now() else v_existing.reviewed_at end
  where id = v_existing.id
  returning * into v_result;

  if v_auto_pass then
    -- 自动通过：回填选手资料（完美 ID / 昵称 / Steam64 / 段位 / rating）
    select (prof.role = 'admin' or prof.role = 'caster')
    into v_keep_role
    from public.profiles prof where prof.id = uid;
    update public.profiles
    set pw_username = v_pw,
        nickname = v_display,
        steam_id = nullif(v_steam, ''),
        highest_rank = nullif(v_rank, ''),
        highest_rating = v_rating,
        role = case when v_keep_role then role else 'player' end
    where id = uid;
    -- 初始化个人数据：在其报名赛事的首个阶段补一行全 0 统计
    select s.id, s.group_id into v_stage_id, v_group_id
    from public.stages s
    where s.event_id = p_event_id
    order by s.sort_order asc, s.created_at asc
    limit 1;
    if v_stage_id is not null then
      insert into public.player_stats (profile_id, stage_id, group_id, we, rating_pro, win_rate, kd,
        matches, hs_rate, kpr, dpr, adr, total_kills, total_deaths, total_assists, fpr, awp_kpr)
      values (uid, v_stage_id, v_group_id, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0)
      on conflict (profile_id, stage_id) do nothing;
    end if;
  end if;

  return v_result;
end;
$$;

grant execute on function public.submit_player_application(uuid, text, text, text, text, numeric, jsonb, text, text, text) to authenticated;