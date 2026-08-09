-- ============================================================
-- CS2 电竞赛事管理系统 数据库初始化脚本
-- 在 Supabase Dashboard -> SQL Editor 中整体执行
-- ============================================================

create extension if not exists pgcrypto;

-- ============================================================
-- 1. profiles：用户资料（由 auth.users 触发器自动创建）
--    role: admin(管理员) / caster(解说) / player(选手)
--    nickname / pw_username：个人选手注册时填写（完美 ID = 完美对战平台的用户名）
-- ============================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text,
  nickname text,                         -- 游戏昵称（个人选手注册）
  pw_username text,                      -- 完美 ID（完美对战平台用户名，后台按此记录数据）
  role text not null default 'player' check (role in ('admin', 'caster', 'player')),
  created_at timestamptz not null default now()
);

-- 兼容旧库：升级角色约束以支持解说（caster）角色
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('admin', 'caster', 'player'));

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  -- 新注册账号默认 account_status='pending'，需管理员在后台「账号审核」中通过后才解锁全部功能
  insert into public.profiles (id, username, email, account_status)
  values (new.id, new.raw_user_meta_data ->> 'username', new.email, 'pending');
  return new;
end;
$$;

-- 账号人工审核：account_status=pending(待审核)/approved(已通过)/rejected(已拒绝)
-- 兼容旧库：老用户默认 approved（不受审核影响）
alter table public.profiles add column if not exists account_status text not null default 'approved'
  check (account_status in ('pending', 'approved', 'rejected'));
alter table public.profiles add column if not exists email text;
-- 近 3 赛季最高段位（管理员审核选手注册时查看战绩截图后手动选择，记录在选手信息表）
alter table public.profiles add column if not exists highest_rank text;

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
  employment_status text check (employment_status in ('employed', 'unemployed')), -- 在职 / 离职
  location text,                          -- 驻地（在职时必填）
  employee_no text,                       -- 工号（在职时必填）
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  review_note text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewer_id uuid references public.profiles (id)
);

-- 兼容旧库：补充 display_name 列
alter table public.player_applications add column if not exists display_name text;

-- ============================================================
-- 1.5 Storage：个人注册赛季截图桶
--     桶需公开读（后台审核与前台展示），上传仅限已登录用户。
--     若已在 Dashboard 手动建过桶，以下语句幂等，不会报错。
-- ============================================================
insert into storage.buckets (id, name, public)
values ('player-screenshots', 'player-screenshots', true)
on conflict (id) do update set public = true;

-- storage.objects 表级权限（RLS 策略之外必须的 grant，否则上传 403）
grant select, insert, update, delete on storage.objects to authenticated;
grant select on storage.objects to anon;

-- 允许已登录用户上传到该桶
drop policy if exists "player-screenshots-upload" on storage.objects;
create policy "player-screenshots-upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'player-screenshots');

-- 允许所有人读取该桶（审核页与前台展示截图）
drop policy if exists "player-screenshots-public-read" on storage.objects;
create policy "player-screenshots-public-read" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'player-screenshots');

-- 兼容旧库：补充在职状态字段（在职需填驻地和工号）
alter table public.player_applications add column if not exists employment_status text check (employment_status in ('employed', 'unemployed'));
alter table public.player_applications add column if not exists location text;
alter table public.player_applications add column if not exists employee_no text;
-- 近 3 赛季最高段位（管理员审核时选择，随申请一并记录）
alter table public.player_applications add column if not exists highest_rank text;

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

-- 名册：灵活人数（≥5 参赛），一个选手在同一赛事内只能作为「正式队员」加入一支战队（唯一索引见下方兼容段）；替补(benched)可跨队临时参赛
create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  event_id uuid, -- 冗余战队所属赛事（正式队员「按赛事一人一队」约束依赖此列；外键在 events 建表后补充，见下方 events 段）
  is_captain boolean not null default false,
  status text not null default 'active' check (status in ('active', 'benched')),
  unique (team_id, profile_id)
);

-- 兼容旧库：名册约束从「全局一人一队」改为「同赛事正式队员一人一队」（替补可跨队，重复执行安全）
-- 注意：event_id 列不带外键声明，外键在下方 events 表建好后补充，保证脚本按顺序执行不报错
alter table public.team_members add column if not exists event_id uuid;
update public.team_members tm
set event_id = t.event_id
from public.teams t
where tm.team_id = t.id and tm.event_id is null;
alter table public.team_members drop constraint if exists team_members_profile_id_key;
-- 清理同赛事内同一人重复的正式队员记录（保留最新一条），避免部分唯一索引建立失败
delete from public.team_members a
using public.team_members b
where a.profile_id = b.profile_id
  and a.event_id is not distinct from b.event_id
  and a.status = 'active' and b.status = 'active'
  and a.id < b.id;
drop index if exists team_members_profile_event_active_key;
create unique index team_members_profile_event_active_key
  on public.team_members (profile_id, event_id)
  where status = 'active';

-- ============================================================
-- 3. 阶段（多阶段混合赛制：海选 / 预选赛 / 正赛，格式可不同）
-- ============================================================
create table if not exists public.stages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references public.groups (id), -- 所属组别（跨组/决赛阶段可空；所属赛事见下方兼容列）
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

-- 比赛媒体链接（每场比赛的直播 / 录像等，管理员登记，观众可查看）
create table if not exists public.match_media (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  kind text not null default 'live' check (kind in ('live', 'vod', 'other')), -- 直播 / 录像 / 其他
  label text not null default '',        -- 备注，如 "B站第一视角" / "官方直播间"
  url text not null,                     -- 链接地址
  created_at timestamptz not null default now()
);

-- 每场比赛的解说人员（管理员 / 解说添加，观众可查看）
create table if not exists public.match_casters (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  caster_name text not null,             -- 解说人员姓名 / 平台昵称
  created_at timestamptz not null default now()
);

-- ============================================================
-- 5. 自动同步记录（第三方平台 API，如完美对战平台 / 5E / FACEIT）
-- ============================================================
create table if not exists public.sync_logs (
  id uuid primary key default gen_random_uuid(),
  source text not null,                  -- perfect_world / 5e / faceit / manual
  match_id uuid references public.matches (id) on delete cascade, -- 随对阵删除，避免阻断阶段级联删除
  status text not null default 'pending' check (status in ('pending', 'success', 'failed')),
  payload jsonb,                         -- 平台原始数据
  created_at timestamptz not null default now()
);

-- 兼容旧库：sync_logs.match_id 补级联删除（老库已建表，create if not exists 不会重建 FK）
alter table public.sync_logs drop constraint if exists sync_logs_match_id_fkey;
alter table public.sync_logs add constraint sync_logs_match_id_fkey
  foreign key (match_id) references public.matches (id) on delete cascade;

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
  stage_id uuid references public.stages (id) on delete cascade, -- 阶段删除时统计随删，避免阻断 stages→matches 级联链
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
  team_id uuid references public.teams (id) on delete set null, -- 队伍删除后保留个人数据，仅清空所属队伍
  stage_id uuid references public.stages (id) on delete cascade, -- 阶段删除时个人统计随删，避免阻断级联链
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
  updated_at timestamptz not null default now()
  -- 个人数据每名选手一行（profile_id 唯一）；唯一约束在下方兼容段统一管理
);

-- 兼容旧库：个人数据由「按阶段多行」改为「每名选手一行」。
-- 旧库中同人按阶段拆出的多行先清理（保留一行），再建立 profile_id 唯一约束；可重复执行。
alter table public.player_stats drop constraint if exists player_stats_profile_id_stage_id_key;
alter table public.player_stats drop constraint if exists player_stats_profile_id_key;
delete from public.player_stats a
using public.player_stats b
where a.profile_id = b.profile_id and a.id < b.id;
alter table public.player_stats add constraint player_stats_profile_id_key unique (profile_id);

-- 兼容旧库：统计表级联关系修复（可重复执行）。
-- 1) 阶段删除时统计随删（否则删除阶段会被 team_stats / player_stats 的 RESTRICT 阻断）；
-- 2) 队伍删除后保留个人数据、team_id 置空。
alter table public.team_stats drop constraint if exists team_stats_stage_id_fkey;
alter table public.team_stats add constraint team_stats_stage_id_fkey
  foreign key (stage_id) references public.stages (id) on delete cascade;
alter table public.player_stats drop constraint if exists player_stats_stage_id_fkey;
alter table public.player_stats add constraint player_stats_stage_id_fkey
  foreign key (stage_id) references public.stages (id) on delete cascade;
alter table public.player_stats drop constraint if exists player_stats_team_id_fkey;
alter table public.player_stats add constraint player_stats_team_id_fkey
  foreign key (team_id) references public.teams (id) on delete set null;

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

-- 录入/更新比赛结果：自动判定胜者并置为 completed（管理员或参赛队伍队长）
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

  -- 权限：仅管理员或参赛队伍队长可录入比分
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
alter table public.match_media    enable row level security;
alter table public.match_casters  enable row level security;
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
  for update using (auth.uid() = id or public.is_admin()) with check (auth.uid() = id or public.is_admin());

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

-- match_media：公开可读，管理员登记/管理
drop policy if exists match_media_select on public.match_media;
create policy match_media_select on public.match_media
  for select using (true);
drop policy if exists match_media_admin_all on public.match_media;
create policy match_media_admin_all on public.match_media
  for all using (public.is_admin()) with check (public.is_admin());

-- match_casters：公开可读；管理员 / 解说角色可添加、移除解说
drop policy if exists match_casters_select on public.match_casters;
create policy match_casters_select on public.match_casters
  for select using (true);
drop policy if exists match_casters_write on public.match_casters;
create policy match_casters_write on public.match_casters
  for all using (
    public.is_admin()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'caster')
  )
  with check (
    public.is_admin()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'caster')
  );
-- 约战录入：本队队长可录入本队参与的待开赛比赛（自由约战制，仅队长约对手、定时间）
drop policy if exists matches_insert on public.matches;
create policy matches_insert on public.matches
  for insert with check (
    public.is_admin()
    or exists (
      select 1 from public.teams t
      where t.id = team_a_id and t.captain_id = auth.uid()
    )
    or exists (
      select 1 from public.teams t
      where t.id = team_b_id and t.captain_id = auth.uid()
    )
  );
-- 约战删除：本队队长可删除本队参与的待开赛比赛（已开赛/已结束的不允许删）
drop policy if exists matches_team_delete on public.matches;
create policy matches_team_delete on public.matches
  for delete using (
    status = 'scheduled'
    and (
      public.is_admin()
      or exists (
        select 1 from public.teams t
        where t.id = team_a_id and t.captain_id = auth.uid()
      )
      or exists (
        select 1 from public.teams t
        where t.id = team_b_id and t.captain_id = auth.uid()
      )
    )
  );
drop policy if exists match_maps_select on public.match_maps;
create policy match_maps_select on public.match_maps
  for select using (true);
drop policy if exists match_maps_admin_all on public.match_maps;
create policy match_maps_admin_all on public.match_maps
  for all using (public.is_admin()) with check (public.is_admin());
-- 比分录入：参赛队伍队长可更新自己参与的比赛比分/地图/时间（管理员全量见 matches_admin_all）
drop policy if exists matches_captain_update on public.matches;
create policy matches_captain_update on public.matches
  for update using (
    exists (
      select 1 from public.teams t
      where (t.id = team_a_id or t.id = team_b_id) and t.captain_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.teams t
      where (t.id = team_a_id or t.id = team_b_id) and t.captain_id = auth.uid()
    )
  );
-- 逐图比分：参赛队伍队长可管理自己参与比赛的 match_maps（管理员全量见 match_maps_admin_all）
drop policy if exists match_maps_captain_all on public.match_maps;
create policy match_maps_captain_all on public.match_maps
  for all using (
    exists (
      select 1 from public.matches m
      join public.teams t on t.id in (m.team_a_id, m.team_b_id)
      where m.id = match_id and t.captain_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.matches m
      join public.teams t on t.id in (m.team_a_id, m.team_b_id)
      where m.id = match_id and t.captain_id = auth.uid()
    )
  );

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
-- 名册 event_id 外键：events 表建好后补充（否则建表时引用不存在的 events 会报错；可重复执行）
alter table public.team_members drop constraint if exists team_members_event_id_fkey;
alter table public.team_members add constraint team_members_event_id_fkey
  foreign key (event_id) references public.events (id);
-- 战队报名关联赛事（兼容旧库：补充 event_id 列）
alter table public.teams add column if not exists event_id uuid references public.events (id);
-- 赛程阶段关联赛事（兼容旧库：每届赛事可自定义各自的赛制与阶段列表）
alter table public.stages add column if not exists event_id uuid references public.events (id);
-- 赛程阶段关联组别（兼容旧库：每个组别的赛程单独管理，跨组/决赛阶段为空）
alter table public.stages add column if not exists group_id uuid references public.groups (id);

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
  public.stages, public.matches, public.match_maps, public.match_casters, public.standings,
  public.team_stats, public.player_stats, public.site_config, public.events
  to anon, authenticated;
-- 审核通过时回填选手资料（pw_username/nickname/角色）需要 profiles 的 UPDATE 权限，否则选手池为空
grant update on public.profiles to authenticated;
grant select on public.sync_logs to authenticated;
grant select on public.player_applications to authenticated;

grant insert, update on public.teams to authenticated;
grant insert, update, delete on public.team_members to authenticated;
grant insert, update on public.site_config to authenticated;
grant insert, update on public.events to authenticated;
grant insert, update on public.player_applications to authenticated;
grant insert, update, delete on public.matches to authenticated;
grant insert, delete on public.match_casters to authenticated;
-- 地图明细 / 同步日志：RLS 仅管理员可写，此处补表级权限，避免出现「policy 允许但 table permission denied」
grant insert, update, delete on public.match_maps to authenticated;
grant insert, update, delete on public.sync_logs to authenticated;
-- 统计数据写权限：管理员在「数据录入」保存队伍/个人数据，以及审核通过时初始化个人数据（RLS 已限制仅管理员可写，此处补齐表级权限）
grant insert, update, delete on public.team_stats to authenticated;
grant insert, update, delete on public.player_stats to authenticated;

grant execute on function public.upsert_match_result(uuid, int, int) to authenticated;

-- ============================================================
-- 10. 初始管理员
-- ============================================================
-- 1) 先在 Auth -> Users 中手动创建管理员账号
-- 2) 将下方 UUID 替换为该用户 id 后执行：
-- update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-000000000000';
