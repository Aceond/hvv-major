-- ============================================================
-- CS2 电竞赛事管理系统 数据库初始化脚本
-- 在 Supabase Dashboard -> SQL Editor 中整体执行
-- ============================================================

create extension if not exists pgcrypto;

-- ============================================================
-- 1. profiles：用户资料（由 auth.users 触发器自动创建）
--    role: admin(管理员) / player(选手)
--    nickname / pw_username：个人选手注册时填写（完美 ID = 完美对战平台的用户名）
-- ============================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text,
  nickname text,                         -- 游戏昵称（个人选手注册）
  pw_username text,                      -- 完美 ID（完美对战平台用户名，后台按此记录数据）
  role text not null default 'player' check (role in ('admin', 'player')),
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, username)
  values (new.id, new.raw_user_meta_data ->> 'username');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- 1.5 个人选手注册申请（提交选手姓名 + 完美 ID + 最近 3-5 个赛季截图，管理员审核后进入选手池）
--     截图上传到 Storage 的 player-screenshots 桶（公开读），screenshots 存其 URL
-- ============================================================
create table if not exists public.player_applications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  display_name text,                      -- 选手姓名（真实姓名，审核通过后回填 profiles.nickname）
  pw_username text not null,              -- 完美 ID（完美对战平台用户名）
  nickname text,                          -- 预留昵称（本次注册不再单独采集）
  screenshots jsonb not null default '[]'::jsonb, -- 最近 3-5 个赛季截图 URL
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  review_note text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewer_id uuid references public.profiles (id)
);

-- 兼容旧库：补充 display_name 列
alter table public.player_applications add column if not exists display_name text;

-- ============================================================
-- 2. 组别（传奇组 / 大师组 / 挑战组，三个组别相互独立）
-- ============================================================
create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,             -- 传奇组 / 大师组 / 挑战组
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

insert into public.groups (name, sort_order) values
  ('传奇组', 1), ('大师组', 2), ('挑战组', 3)
on conflict (name) do nothing;

-- ============================================================
-- 3. 战队与名册（灵活人数，要求至少 5 名队员参赛）
-- ============================================================
create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  tag text,                              -- 队标缩写，如 "NV"
  captain_id uuid not null references public.profiles (id),
  group_id uuid references public.groups (id), -- 所属组别（审核时分配）
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);

-- 名册：灵活人数（≥5 参赛），一个选手只能属于一支战队（unique profile_id）
create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  is_captain boolean not null default false,
  status text not null default 'active' check (status in ('active', 'benched')),
  unique (team_id, profile_id),
  unique (profile_id)                    -- 一人一队
);

-- ============================================================
-- 3. 阶段（多阶段混合赛制：海选 / 预选赛 / 正赛，格式可不同）
-- ============================================================
create table if not exists public.stages (
  id uuid primary key default gen_random_uuid(),
  name text not null,                    -- 海选 / 预选赛 / 正赛
  format text not null default 'round_robin'
    check (format in ('round_robin', 'single_elim', 'double_elim', 'swiss')),
  status text not null default 'upcoming'
    check (status in ('upcoming', 'running', 'ended')),
  sort_order int not null default 0,     -- 阶段顺序
  start_at timestamptz,
  end_at timestamptz,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 4. 对阵（比赛）
--    team_b_id 为 NULL 表示该队轮空（BYE）
-- ============================================================
create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  stage_id uuid not null references public.stages (id) on delete cascade,
  group_id uuid references public.groups (id), -- 所属组别（淘汰赛跨组可空）
  round_number int not null default 1,   -- 第几轮
  team_a_id uuid references public.teams (id),
  team_b_id uuid references public.teams (id),
  best_of int not null default 1,        -- BO1 / BO3
  map text,                              -- BO1 时的地图
  team_a_score int not null default 0,
  team_b_score int not null default 0,
  winner_id uuid references public.teams (id),
  status text not null default 'scheduled'
    check (status in ('scheduled', 'completed', 'cancelled')),
  scheduled_at timestamptz,
  created_at timestamptz not null default now(),
  check (team_a_id is null or team_b_id is null or team_a_id <> team_b_id)
);

-- 地图详情（BO3 逐图比分）
create table if not exists public.match_maps (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  map_name text not null,                -- Mirage / Inferno / Anubis ...
  team_a_score int not null default 0,
  team_b_score int not null default 0,
  winner_id uuid references public.teams (id)
);

-- ============================================================
-- 5. 自动同步记录（第三方平台 API，如完美对战平台 / 5E / FACEIT）
-- ============================================================
create table if not exists public.sync_logs (
  id uuid primary key default gen_random_uuid(),
  source text not null,                  -- perfect_world / 5e / faceit / manual
  match_id uuid references public.matches (id),
  status text not null default 'pending' check (status in ('pending', 'success', 'failed')),
  payload jsonb,                         -- 平台原始数据
  created_at timestamptz not null default now()
);

-- ============================================================
-- 6. 积分榜视图（按阶段 + 组别：胜=3分，参考胜场/地图差排序）
-- ============================================================
create or replace view public.standings as
with expanded as (
  select
    m.id as match_id,
    m.stage_id,
    t.id as team_id,
    case when t.id = m.team_a_id then m.team_a_score else m.team_b_score end as score_for,
    case when t.id = m.team_a_id then m.team_b_score else m.team_a_score end as score_against,
    (m.winner_id = t.id) as is_win
  from public.matches m
  join public.teams t on t.id in (m.team_a_id, m.team_b_id)
  where m.status = 'completed' and m.team_b_id is not null
)
select
  e.stage_id,
  t.group_id,
  g.name as group_name,
  e.team_id,
  t.name as team_name,
  t.tag,
  count(*) as played,
  count(*) filter (where e.is_win) as wins,
  count(*) filter (where not e.is_win) as losses,
  sum(e.score_for) as maps_won,
  sum(e.score_against) as maps_lost,
  (sum(e.score_for) - sum(e.score_against)) as map_diff,
  (count(*) filter (where e.is_win)) * 3 as points
from expanded e
join public.teams t on t.id = e.team_id
left join public.groups g on g.id = t.group_id
group by e.stage_id, e.team_id, t.name, t.tag, t.group_id, g.name;

-- ============================================================
-- 6.5 站点配置（单行：首页 hero 标题等，后台可修改）
-- ============================================================
create table if not exists public.site_config (
  id int primary key default 1 check (id = 1),  -- 仅允许单行
  brand_title text not null default 'HVV MAJOR 11',
  brand_overline text not null default 'HVV MAJOR 2026 · COUNTER-STRIKE 2',
  brand_slogan text not null default '战队报名 · 赛程赛制 · 积分排名 — 一站式 CS2 赛事平台',
  notice text not null default '',
  updated_at timestamptz not null default now()
);

insert into public.site_config (id, brand_title, brand_overline, brand_slogan, notice)
values (
  1,
  'HVV MAJOR 11',
  'HVV MAJOR 2026 · COUNTER-STRIKE 2',
  '战队报名 · 赛程赛制 · 积分排名 — 一站式 CS2 赛事平台',
  '本系统为框架阶段骨架，赛程、比分与统计由管理员在后台录入维护。'
)
on conflict (id) do nothing;

-- ============================================================
-- 6.5 数据统计表（个人 / 队伍排行，数据由管理员在后台手动录入）
-- 字段对应完美对战平台统计维度
-- 注意：若已按旧版本建过库，需 drop 这两张表后重新执行本段。
-- ============================================================
create table if not exists public.team_stats (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  stage_id uuid references public.stages (id),
  group_id uuid references public.groups (id),
  win_rate numeric(5,2) not null default 0,      -- 胜率 %
  kd numeric(5,2) not null default 0,           -- K/D
  matches int not null default 0,               -- 比赛数
  hs_rate numeric(5,2) not null default 0,      -- 爆头率 %
  pistol_win_rate numeric(5,2) not null default 0,     -- 手枪局胜率 %
  first_five_win_rate numeric(5,2) not null default 0, -- 先胜 5 回合胜率 %
  avg_kills numeric(6,2) not null default 0,    -- 场均击杀
  avg_deaths numeric(6,2) not null default 0,   -- 场均死亡
  avg_assists numeric(6,2) not null default 0,  -- 场均助攻
  total_kills int not null default 0,           -- 总击杀
  total_deaths int not null default 0,          -- 总死亡
  total_assists int not null default 0,         -- 总助攻
  updated_at timestamptz not null default now(),
  unique (team_id, stage_id)
);

create table if not exists public.player_stats (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  team_id uuid references public.teams (id),
  stage_id uuid references public.stages (id),
  group_id uuid references public.groups (id),
  we numeric(5,2) not null default 0,           -- WE（获胜效率）
  rating_pro numeric(4,2) not null default 0,   -- Rating PRO
  win_rate numeric(5,2) not null default 0,     -- 胜率 %
  kd numeric(5,2) not null default 0,           -- K/D
  matches int not null default 0,               -- 比赛数
  hs_rate numeric(5,2) not null default 0,      -- 爆头率 %
  kpr numeric(6,2) not null default 0,          -- 击杀/回合
  dpr numeric(6,2) not null default 0,          -- 死亡/回合
  adr numeric(6,2) not null default 0,          -- ADR
  total_kills int not null default 0,           -- 总击杀
  total_deaths int not null default 0,          -- 总死亡
  total_assists int not null default 0,         -- 总助攻
  fpr numeric(6,2) not null default 0,          -- 首杀/回合
  awp_kpr numeric(6,2) not null default 0,      -- AWP 击杀/回合
  updated_at timestamptz not null default now(),
  unique (profile_id, stage_id)
);

-- ============================================================
-- 7. 辅助函数
-- ============================================================
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;

-- 录入/更新比赛结果：自动判定胜者并置为 completed（仅管理员）
create or replace function public.upsert_match_result(
  p_match_id uuid,
  p_team_a_score int,
  p_team_b_score int
) returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_winner uuid;
  v_match public.matches%rowtype;
begin
  select * into v_match from public.matches where id = p_match_id;
  if v_match.id is null then
    raise exception 'match not found';
  end if;

  v_winner := case
    when p_team_a_score > p_team_b_score then v_match.team_a_id
    when p_team_b_score > p_team_a_score then v_match.team_b_id
    else null
  end;

  update public.matches
  set team_a_score = p_team_a_score,
      team_b_score = p_team_b_score,
      winner_id = v_winner,
      status = 'completed'
  where id = p_match_id;
end;
$$;

-- ============================================================
-- 8. 行级安全（RLS）
-- ============================================================
alter table public.profiles       enable row level security;
alter table public.player_applications enable row level security;
alter table public.groups         enable row level security;
alter table public.teams          enable row level security;
alter table public.team_members   enable row level security;
alter table public.stages         enable row level security;
alter table public.matches        enable row level security;
alter table public.match_maps     enable row level security;
alter table public.team_stats     enable row level security;
alter table public.player_stats   enable row level security;
alter table public.sync_logs      enable row level security;
alter table public.site_config     enable row level security;

-- profiles：本人读写，管理员可读全部
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select using (auth.uid() = id or public.is_admin());
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- player_applications：本人可提交/查看自己的申请，管理员全量审核
drop policy if exists player_applications_select on public.player_applications;
create policy player_applications_select on public.player_applications
  for select using (auth.uid() = profile_id or public.is_admin());
drop policy if exists player_applications_insert on public.player_applications;
create policy player_applications_insert on public.player_applications
  for insert with check (auth.uid() = profile_id);
drop policy if exists player_applications_update on public.player_applications;
create policy player_applications_update on public.player_applications
  for update using (public.is_admin()) with check (public.is_admin());

-- teams：公开可读（含待审核状态需管理员/本人可见）；创建者建队；管理员全量
drop policy if exists teams_select on public.teams;
create policy teams_select on public.teams
  for select using (true);
drop policy if exists teams_insert on public.teams;
create policy teams_insert on public.teams
  for insert with check (captain_id = auth.uid() or public.is_admin());
drop policy if exists teams_update on public.teams;
create policy teams_update on public.teams
  for update using (public.is_admin() or captain_id = auth.uid());

-- team_members：本人可读自己的队员记录；队长/管理员管理
drop policy if exists team_members_select on public.team_members;
create policy team_members_select on public.team_members
  for select using (
    profile_id = auth.uid()
    or public.is_admin()
    or exists (
      select 1 from public.teams t where t.id = team_id and t.captain_id = auth.uid()
    )
  );
drop policy if exists team_members_insert on public.team_members;
create policy team_members_insert on public.team_members
  for insert with check (
    public.is_admin()
    or exists (select 1 from public.teams t where t.id = team_id and t.captain_id = auth.uid())
  );
-- 后台选人：管理员可调整战队名册（队员添加/移除由管理员在「战队报名审核」中操作）
drop policy if exists team_members_update on public.team_members;
create policy team_members_update on public.team_members
  for update using (
    public.is_admin()
    or exists (select 1 from public.teams t where t.id = team_id and t.captain_id = auth.uid())
  ) with check (
    public.is_admin()
    or exists (select 1 from public.teams t where t.id = team_id and t.captain_id = auth.uid())
  );
drop policy if exists team_members_delete on public.team_members;
create policy team_members_delete on public.team_members
  for delete using (
    public.is_admin()
    or exists (select 1 from public.teams t where t.id = team_id and t.captain_id = auth.uid())
  );

-- stages / matches / match_maps：公开可读，仅管理员写
drop policy if exists stages_select on public.stages;
create policy stages_select on public.stages
  for select using (true);
drop policy if exists stages_admin_all on public.stages;
create policy stages_admin_all on public.stages
  for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists matches_select on public.matches;
create policy matches_select on public.matches
  for select using (true);
drop policy if exists matches_admin_all on public.matches;
create policy matches_admin_all on public.matches
  for all using (public.is_admin()) with check (public.is_admin());
-- 约战录入：本队成员可录入本队参与的待开赛比赛（自由约战制，战队自行约对手、定时间）
drop policy if exists matches_insert on public.matches;
create policy matches_insert on public.matches
  for insert with check (
    public.is_admin()
    or exists (
      select 1 from public.team_members m
      where m.profile_id = auth.uid()
        and m.status = 'active'
        and (m.team_id = team_a_id or m.team_id = team_b_id)
    )
  );
-- 约战删除：本队成员可删除本队参与的待开赛比赛（已开赛/已结束的不允许删）
drop policy if exists matches_team_delete on public.matches;
create policy matches_team_delete on public.matches
  for delete using (
    status = 'scheduled'
    and (
      public.is_admin()
      or exists (
        select 1 from public.team_members m
        where m.profile_id = auth.uid()
          and m.status = 'active'
          and (m.team_id = team_a_id or m.team_id = team_b_id)
      )
    )
  );
drop policy if exists match_maps_select on public.match_maps;
create policy match_maps_select on public.match_maps
  for select using (true);
drop policy if exists match_maps_admin_all on public.match_maps;
create policy match_maps_admin_all on public.match_maps
  for all using (public.is_admin()) with check (public.is_admin());

-- groups / team_stats / player_stats：公开可读，仅管理员写
drop policy if exists groups_select on public.groups;
create policy groups_select on public.groups
  for select using (true);
drop policy if exists groups_admin_all on public.groups;
create policy groups_admin_all on public.groups
  for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists team_stats_select on public.team_stats;
create policy team_stats_select on public.team_stats
  for select using (true);
drop policy if exists team_stats_admin_all on public.team_stats;
create policy team_stats_admin_all on public.team_stats
  for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists player_stats_select on public.player_stats;
create policy player_stats_select on public.player_stats
  for select using (true);
drop policy if exists player_stats_admin_all on public.player_stats;
create policy player_stats_admin_all on public.player_stats
  for all using (public.is_admin()) with check (public.is_admin());

-- sync_logs：仅管理员可见
drop policy if exists sync_logs_admin_all on public.sync_logs;
create policy sync_logs_admin_all on public.sync_logs
  for all using (public.is_admin()) with check (public.is_admin());

-- ============================================================
-- 6.5 赛事（一届一届持续举办，选手按赛事报名，管理员发布赛事）
-- ============================================================
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  name text not null,                     -- 赛事名称，如 HVV MAJOR 11
  edition int,                            -- 届数（第几届，用于排序展示）
  status text not null default 'signup' check (status in ('signup', 'running', 'ended')),
  signup_start timestamptz,               -- 报名开始
  signup_end timestamptz,                 -- 报名截止
  start_at timestamptz,                   -- 开赛时间
  end_at timestamptz,                     -- 结束时间
  description text,                       -- 赛事简介
  created_at timestamptz not null default now()
);

-- 个人注册申请关联报名赛事（兼容旧库：补充 event_id 列）
alter table public.player_applications add column if not exists event_id uuid references public.events (id);
-- 战队报名关联赛事（兼容旧库：补充 event_id 列）
alter table public.teams add column if not exists event_id uuid references public.events (id);

-- events：公开可读（前台赛事入口），仅管理员写
drop policy if exists events_select on public.events;
create policy events_select on public.events
  for select using (true);
drop policy if exists events_admin_all on public.events;
create policy events_admin_all on public.events
  for all using (public.is_admin()) with check (public.is_admin());

-- site_config：公开可读（首页展示），仅管理员可写
drop policy if exists site_config_select on public.site_config;
create policy site_config_select on public.site_config
  for select using (true);
drop policy if exists site_config_admin_all on public.site_config;
create policy site_config_admin_all on public.site_config
  for all using (public.is_admin()) with check (public.is_admin());

-- ============================================================
-- 9. 权限授予
-- ============================================================
grant usage on schema public to anon, authenticated;

grant select on public.profiles, public.groups, public.teams, public.team_members,
  public.stages, public.matches, public.match_maps, public.standings,
  public.team_stats, public.player_stats, public.site_config, public.events
  to anon, authenticated;
grant select on public.sync_logs to authenticated;
grant select on public.player_applications to authenticated;

grant insert, update on public.teams to authenticated;
grant insert, update, delete on public.team_members to authenticated;
grant insert, update on public.site_config to authenticated;
grant insert, update on public.events to authenticated;
grant insert, update on public.player_applications to authenticated;
grant insert, delete on public.matches to authenticated;

grant execute on function public.upsert_match_result(uuid, int, int) to authenticated;

-- ============================================================
-- 10. 初始管理员
-- ============================================================
-- 1) 先在 Auth -> Users 中手动创建管理员账号
-- 2) 将下方 UUID 替换为该用户 id 后执行：
-- update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-000000000000';
