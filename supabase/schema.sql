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
declare
  v_review boolean;
begin
  -- 新注册账号是否待审核由站点设置「账号注册审核」开关决定：
  -- 开（默认）→ account_status='pending'，管理员在后台「账号审核」通过后解锁全部功能；
  -- 关 → 直接 'approved'，注册即可使用全部功能
  select coalesce((select require_account_review from public.site_config where id = 1), true)
    into v_review;
  insert into public.profiles (id, username, email, account_status)
  values (
    new.id,
    new.raw_user_meta_data ->> 'username',
    new.email,
    case when v_review then 'pending' else 'approved' end
  );
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
--     胜负按比分判定（比分高者为胜），与赛程页一致，不依赖 winner_id
--     （历史数据 winner_id 曾与比分不一致导致积分错乱）
-- ============================================================
create or replace view public.standings as
with expanded as (
  select
    m.id as match_id,
    m.stage_id,
    t.id as team_id,
    case when t.id = m.team_a_id then m.team_a_score else m.team_b_score end as score_for,
    case when t.id = m.team_a_id then m.team_b_score else m.team_a_score end as score_against,
    case
      when t.id = m.team_a_id then (m.team_a_score > m.team_b_score)
      else (m.team_b_score > m.team_a_score)
    end as is_win
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

-- 账号注册审核开关：true=新注册账号需管理员审核后可用全部功能；false=注册即可直接用
alter table public.site_config add column if not exists require_account_review boolean not null default true;

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
-- 6.6 比赛队员数据（比分录入入口按场次登记：击杀/死亡/助攻/爆头/首杀/多杀/残局/伤害/局数/WE/Rating）
--     个人数据排行页按「所有比赛」自动聚合：场均=总量/地图数（map_count 合计），
--     爆头率=Σ爆头/Σ击杀，ADR=Σ伤害/Σ局数，WE/Rating 场均=Σ/场次数。
-- ============================================================
create table if not exists public.match_player_stats (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  player_id uuid not null references public.profiles (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  map_count int not null default 1,              -- 本场地图数（BO1=1，BO3=3，录入时自动带出）
  kills int not null default 0,                  -- 击杀（本场所有地图合计）
  deaths int not null default 0,                 -- 死亡
  assists int not null default 0,                -- 助攻
  headshots int not null default 0,              -- 爆头数
  first_kills int not null default 0,            -- 首杀
  multi_kills int not null default 0,            -- 多杀
  clutches int not null default 0,               -- 残局
  damage int not null default 0,                 -- 总伤害
  rounds int not null default 0,                 -- 总局数
  we numeric(5,2) not null default 0,            -- 本场 WE
  rating numeric(4,2) not null default 0,        -- 本场 Rating
  created_at timestamptz not null default now(),
  unique (match_id, player_id)                   -- 同一场比赛每名队员一行，重复保存覆盖
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

-- 登录用：根据用户名或邮箱解析出登录邮箱（security definer 以 postgres 身份读 auth.users，
-- 供「用户名登录」把用户名映射回邮箱；含 @ 直接视为邮箱返回原值）
create or replace function public.resolve_login_email(p_identifier text)
returns text
language sql security definer stable set search_path = public
as $$
  select u.email
  from auth.users u
  where u.email = p_identifier
     or exists (select 1 from public.profiles p where p.id = u.id and p.username = p_identifier)
  limit 1
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
alter table public.match_player_stats enable row level security;

-- profiles：公开可读（首页/赛程/排行榜展示选手昵称与完美 ID），仅本人/管理员可更新
-- 注意：匿名用户仅能读取公开展示列（不含 email/username），防邮箱与账号枚举泄露
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select using (true);
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update using (auth.uid() = id or public.is_admin())
  with check (
    public.is_admin()
    or (
      auth.uid() = id
      -- 普通用户只能更新自己的资料，禁止改动 role / account_status（防提权为管理员）
      and role = (select role from public.profiles where id = auth.uid())
      and account_status = (select account_status from public.profiles where id = auth.uid())
    )
  );

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

-- 比赛队员数据：公开可读（个人数据排行自动聚合），管理员/参赛队队长增删改
drop policy if exists match_player_stats_select on public.match_player_stats;
create policy match_player_stats_select on public.match_player_stats
  for select using (true);
drop policy if exists match_player_stats_write on public.match_player_stats;
create policy match_player_stats_write on public.match_player_stats
  for all using (
    public.is_admin()
    or exists (
      select 1 from public.matches m
      join public.teams t on t.id in (m.team_a_id, m.team_b_id)
      where m.id = match_id and t.captain_id = auth.uid()
    )
  ) with check (
    public.is_admin()
    or exists (
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

grant select on public.groups, public.teams, public.team_members,
  public.stages, public.matches, public.match_maps, public.match_casters, public.match_media,
  public.match_player_stats, public.standings, public.team_stats, public.player_stats,
  public.site_config, public.events
  to anon, authenticated;
-- profiles 列级授权：匿名用户仅能读公开展示列（不含 email/username，防隐私泄露）；已登录用户保留完整列（后台审核需邮箱）
grant select (id, username, nickname, pw_username, highest_rank, role) on public.profiles to anon;
grant select on public.profiles to authenticated;
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
-- 阶段管理：管理员在后台配置赛制/阶段（RLS 仅管理员可写，此处补齐表级权限）
grant insert, update, delete on public.stages to authenticated;
-- 比赛媒体：管理员登记/删除直播·录像链接（RLS 已限制仅管理员可写，此处补齐表级权限）
grant insert, delete on public.match_media to authenticated;
-- 地图明细 / 同步日志：RLS 仅管理员可写，此处补表级权限，避免出现「policy 允许但 table permission denied」
grant insert, update, delete on public.match_maps to authenticated;
grant insert, update, delete on public.sync_logs to authenticated;
-- 统计数据写权限：管理员在「数据录入」保存队伍/个人数据，以及审核通过时初始化个人数据（RLS 已限制仅管理员可写，此处补齐表级权限）
grant insert, update, delete on public.team_stats to authenticated;
grant insert, update, delete on public.player_stats to authenticated;
-- 比赛队员数据：管理员/参赛队队长按场次登记（RLS 已限制，此处补齐表级权限）
grant insert, update, delete on public.match_player_stats to authenticated;

grant execute on function public.upsert_match_result(uuid, int, int) to authenticated;
grant execute on function public.resolve_login_email(text) to anon, authenticated;

-- ============================================================
-- 10. 初始管理员
-- ============================================================
-- 1) 先在 Auth -> Users 中手动创建管理员账号
-- 2) 将下方 UUID 替换为该用户 id 后执行：
-- update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-000000000000';

-- ============================================================
-- 11. 拒绝战队自动释放名册（可重复执行）
-- ============================================================
-- 1) 清理历史已拒绝战队的名册（队长+队员），成员回到选手池可重新报名
delete from public.team_members tm
where tm.team_id in (select id from public.teams where status = 'rejected');

-- 2) 触发器：战队状态改为 rejected 时，自动删除该队名册（幂等，可重复创建）
create or replace function public.release_rejected_team_members()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.status = 'rejected' then
    delete from public.team_members where team_id = old.id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_team_status_rejected on public.teams;
create trigger trg_team_status_rejected
after update of status on public.teams
for each row
when (new.status = 'rejected')
execute function public.release_rejected_team_members();

-- ============================================================
-- 12. 竞猜系统（可重复执行）
--     每届赛事独立的竞猜项；积分跨赛事互通，账户初始 100 分。
--     赔率：比赛胜者由系统按双方战绩/胜率生成；组别冠军/阶段晋级/自定义由管理员发布时手动填写。
-- ============================================================

-- 竞猜项（选项与赔率内嵌 JSONB：[{id, label, team_id, odds}]）
create table if not exists public.bet_polls (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  title text not null,
  kind text not null default 'custom'
    check (kind in ('group_champion', 'match_winner', 'stage_advance', 'custom')),
  options jsonb not null default '[]'::jsonb,
  status text not null default 'open'
    check (status in ('open', 'closed', 'settled')),
  winning_option_id text,
  created_at timestamptz not null default now()
);

-- 积分账户（每用户一行，初始 100）
create table if not exists public.bet_accounts (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  points int not null default 100,
  updated_at timestamptz not null default now()
);

-- 投注记录（每人每个竞猜项仅可投一次；odds 为投注时赔率快照）
create table if not exists public.bet_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  poll_id uuid not null references public.bet_polls (id) on delete cascade,
  option_id text not null,
  option_label text not null,
  odds numeric not null,
  stake int not null,
  status text not null default 'pending'
    check (status in ('pending', 'won', 'lost')),
  created_at timestamptz not null default now(),
  unique (user_id, poll_id)
);
create index if not exists bet_records_user_idx on public.bet_records (user_id);
create index if not exists bet_records_poll_idx on public.bet_records (poll_id);

-- 投注 RPC：原子扣减积分并写入投注记录（security definer，绕过 RLS）
create or replace function public.place_bet(p_poll_id uuid, p_option_id text, p_stake int)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_poll public.bet_polls%rowtype;
  v_opt jsonb;
  v_odds numeric;
  v_acc public.bet_accounts%rowtype;
begin
  if v_user is null then raise exception '请先登录'; end if;
  if p_stake < 1 then raise exception '投注积分至少为 1'; end if;
  select * into v_poll from public.bet_polls where id = p_poll_id;
  if v_poll.id is null then raise exception '竞猜项不存在'; end if;
  if v_poll.status <> 'open' then raise exception '该竞猜已截止，无法投注'; end if;
  select o into v_opt
  from jsonb_array_elements(v_poll.options) o
  where o ->> 'id' = p_option_id
  limit 1;
  if v_opt is null then raise exception '竞猜选项不存在'; end if;
  v_odds := (v_opt ->> 'odds')::numeric;
  if exists (select 1 from public.bet_records where poll_id = p_poll_id and user_id = v_user) then
    raise exception '你已参与过该竞猜，每人限投一次';
  end if;
  select * into v_acc from public.bet_accounts where user_id = v_user;
  if v_acc.user_id is null then
    insert into public.bet_accounts (user_id, points) values (v_user, 100)
    returning * into v_acc;
  end if;
  if v_acc.points < p_stake then raise exception '积分不足（当前 % 分）', v_acc.points; end if;
  update public.bet_accounts
  set points = points - p_stake, updated_at = now()
  where user_id = v_user;
  insert into public.bet_records (user_id, poll_id, option_id, option_label, odds, stake)
  values (v_user, p_poll_id, p_option_id, v_opt ->> 'label', v_odds, p_stake);
end;
$$;

-- 结算 RPC：标记中奖选项并按投注赔率发放积分（security definer）
create or replace function public.settle_bet(p_poll_id uuid, p_winning_option_id text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_poll public.bet_polls%rowtype;
  v_rec record;
begin
  select * into v_poll from public.bet_polls where id = p_poll_id;
  if v_poll.id is null then raise exception '竞猜项不存在'; end if;
  if v_poll.status = 'settled' then raise exception '该竞猜已结算'; end if;
  if not exists (
    select 1 from jsonb_array_elements(v_poll.options) o where o ->> 'id' = p_winning_option_id
  ) then raise exception '中奖选项不存在'; end if;
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

-- 行级安全
alter table public.bet_polls enable row level security;
alter table public.bet_accounts enable row level security;
alter table public.bet_records enable row level security;

drop policy if exists bet_polls_select on public.bet_polls;
create policy bet_polls_select on public.bet_polls
  for select using (true);
drop policy if exists bet_polls_admin_all on public.bet_polls;
create policy bet_polls_admin_all on public.bet_polls
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists bet_accounts_select on public.bet_accounts;
create policy bet_accounts_select on public.bet_accounts
  for select using (auth.uid() = user_id);
drop policy if exists bet_records_select on public.bet_records;
create policy bet_records_select on public.bet_records
  for select using (auth.uid() = user_id);

-- 权限授予：竞猜仅注册用户可见（bet_polls 只授 authenticated，anon 无权限）
grant select on public.bet_polls, public.bet_accounts, public.bet_records to authenticated;
grant insert, update, delete on public.bet_polls to authenticated;
grant execute on function public.place_bet(uuid, text, int) to authenticated;
grant execute on function public.settle_bet(uuid, text) to authenticated;

-- ============================================================
-- 13. 比赛胜者竞猜自动生成（可重复执行）
--     排了对阵（matches 插入且双方确定、状态 scheduled）时，
--     触发器自动生成「比赛胜者」竞猜，赔率按两队历史胜率自动计算。
-- ============================================================

-- 1) bet_polls 增加比赛关联列（同一场比赛只生成一次竞猜）
alter table public.bet_polls add column if not exists match_id uuid
  references public.matches (id) on delete set null;
drop index if exists bet_polls_match_key;
create unique index bet_polls_match_key
  on public.bet_polls (match_id) where match_id is not null;

-- 2) 队伍历史胜率（0-1）：已完成比赛中胜场 / 总场次，无记录返回 0
create or replace function public.team_win_rate(p_team uuid)
returns numeric
language sql stable security definer set search_path = public
as $$
  select case when count(*) = 0 then 0
    else count(*) filter (
      where (team_a_id = p_team and team_a_score > team_b_score)
         or (team_b_id = p_team and team_b_score > team_a_score)
    )::numeric / count(*)::numeric
  end
  from public.matches
  where status = 'completed' and (team_a_id = p_team or team_b_id = p_team);
$$;

-- 3) 触发器：插入待赛对阵后自动生成竞猜（幂等，同场比赛不重复）
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
  -- 赛事由阶段关联（matches 无 event_id 列）
  select event_id into v_event from public.stages where id = new.stage_id;
  if v_event is null then
    return new;
  end if;
  v_a_rate := public.team_win_rate(new.team_a_id);
  v_b_rate := public.team_win_rate(new.team_b_id);
  v_a_odds := least(20, greatest(1.05, (greatest(v_a_rate, 0.001) + v_b_rate) / greatest(v_a_rate, 0.001)));
  v_b_odds := least(20, greatest(1.05, (greatest(v_b_rate, 0.001) + v_a_rate) / greatest(v_b_rate, 0.001)));
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
      'odds', round(least(20, greatest(1.05, (greatest(public.team_win_rate(m.team_a_id), 0.001) + public.team_win_rate(m.team_b_id)) / greatest(public.team_win_rate(m.team_a_id), 0.001))), 2)
    ),
    jsonb_build_object(
      'id', gen_random_uuid()::text,
      'label', tb.name || ' 胜',
      'team_id', m.team_b_id,
      'odds', round(least(20, greatest(1.05, (greatest(public.team_win_rate(m.team_b_id), 0.001) + public.team_win_rate(m.team_a_id)) / greatest(public.team_win_rate(m.team_b_id), 0.001))), 2)
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
