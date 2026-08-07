-- ============================================================
-- HVV MAJOR 当前届：导入战队统计数据（26 支，源自完美对战平台）
-- 可重复执行（按 team_id+stage_id 幂等覆盖）
-- ============================================================
insert into public.team_stats (team_id, stage_id, group_id, win_rate, kd, matches, hs_rate, pistol_win_rate, first_five_win_rate, avg_kills, avg_deaths, avg_assists, total_kills, total_deaths, total_assists)
select ta.id, s.id, g.id, x.win_rate, x.kd, x.matches, x.hs_rate, x.pistol_win_rate, x.first_five_win_rate, x.avg_kills, x.avg_deaths, x.avg_assists, x.total_kills, x.total_deaths, x.total_assists
from (
  select '泥头车3.0' as team_name, 0 as win_rate, 0.86 as kd, 2 as matches, 48 as hs_rate, 0 as pistol_win_rate, 50 as first_five_win_rate, 85.5 as avg_kills, 99 as avg_deaths, 30 as avg_assists, 171 as total_kills, 198 as total_deaths, 60 as total_assists, '传奇组' as gname
union all
  select '离冠只差一把' as team_name, 0 as win_rate, 0.79 as kd, 4 as matches, 43.8 as hs_rate, 20 as pistol_win_rate, 0 as first_five_win_rate, 58.8 as avg_kills, 74 as avg_deaths, 17.5 as avg_assists, 235 as total_kills, 296 as total_deaths, 70 as total_assists, '挑战组' as gname
union all
  select 'Team Ten' as team_name, 0 as win_rate, 0.78 as kd, 3 as matches, 42.5 as hs_rate, 30 as pistol_win_rate, 0 as first_five_win_rate, 84 as avg_kills, 108.3 as avg_deaths, 24 as avg_assists, 252 as total_kills, 325 as total_deaths, 72 as total_assists, '挑战组' as gname
union all
  select 'HWmajor11_Team5' as team_name, 0 as win_rate, 0.75 as kd, 2 as matches, 43.8 as hs_rate, 50 as pistol_win_rate, 0 as first_five_win_rate, 65 as avg_kills, 86.5 as avg_deaths, 24.5 as avg_assists, 130 as total_kills, 173 as total_deaths, 49 as total_assists, '大师组' as gname
union all
  select '那个男人在这' as team_name, 20 as win_rate, 0.78 as kd, 4 as matches, 59.1 as hs_rate, 10 as pistol_win_rate, 50 as first_five_win_rate, 56.2 as avg_kills, 72 as avg_deaths, 23.5 as avg_assists, 225 as total_kills, 288 as total_deaths, 94 as total_assists, '大师组' as gname
union all
  select '打赢我们是给' as team_name, 20 as win_rate, 0.82 as kd, 4 as matches, 56.9 as hs_rate, 60 as pistol_win_rate, 20 as first_five_win_rate, 63.8 as avg_kills, 77.5 as avg_deaths, 16.5 as avg_assists, 255 as total_kills, 310 as total_deaths, 66 as total_assists, '传奇组' as gname
union all
  select '步枪大队' as team_name, 20 as win_rate, 0.88 as kd, 4 as matches, 45.5 as hs_rate, 20 as pistol_win_rate, 50 as first_five_win_rate, 71.5 as avg_kills, 81.2 as avg_deaths, 25 as avg_assists, 286 as total_kills, 325 as total_deaths, 100 as total_assists, '挑战组' as gname
union all
  select '传奇捕峰人' as team_name, 30 as win_rate, 0.83 as kd, 3 as matches, 46.5 as hs_rate, 20 as pistol_win_rate, 30 as first_five_win_rate, 71.7 as avg_kills, 86.7 as avg_deaths, 24.67 as avg_assists, 215 as total_kills, 260 as total_deaths, 74 as total_assists, '传奇组' as gname
union all
  select '蹬峰造极2.0' as team_name, 30 as win_rate, 0.91 as kd, 3 as matches, 43.7 as hs_rate, 50 as pistol_win_rate, 30 as first_five_win_rate, 76.3 as avg_kills, 84 as avg_deaths, 23.67 as avg_assists, 229 as total_kills, 252 as total_deaths, 71 as total_assists, '传奇组' as gname
union all
  select '华尔孔Hualcons' as team_name, 50 as win_rate, 0.93 as kd, 4 as matches, 40.5 as hs_rate, 40 as pistol_win_rate, 20 as first_five_win_rate, 92.5 as avg_kills, 99.8 as avg_deaths, 30.75 as avg_assists, 370 as total_kills, 399 as total_deaths, 123 as total_assists, '挑战组' as gname
union all
  select 'STORMGAME' as team_name, 50 as win_rate, 0.9 as kd, 4 as matches, 44.1 as hs_rate, 40 as pistol_win_rate, 50 as first_five_win_rate, 74.2 as avg_kills, 82.2 as avg_deaths, 26.5 as avg_assists, 297 as total_kills, 329 as total_deaths, 106 as total_assists, '大师组' as gname
union all
  select 'BackToBasic' as team_name, 50 as win_rate, 1.12 as kd, 2 as matches, 53.4 as hs_rate, 100 as pistol_win_rate, 50 as first_five_win_rate, 74 as avg_kills, 66 as avg_deaths, 18.5 as avg_assists, 148 as total_kills, 132 as total_deaths, 37 as total_assists, '大师组' as gname
union all
  select '打赢我的是向日葵' as team_name, 50 as win_rate, 1.08 as kd, 4 as matches, 40.7 as hs_rate, 60 as pistol_win_rate, 50 as first_five_win_rate, 83 as avg_kills, 76.5 as avg_deaths, 29 as avg_assists, 332 as total_kills, 306 as total_deaths, 116 as total_assists, '挑战组' as gname
union all
  select '没有队名' as team_name, 50 as win_rate, 1.14 as kd, 4 as matches, 48 as hs_rate, 80 as pistol_win_rate, 50 as first_five_win_rate, 69.8 as avg_kills, 61.2 as avg_deaths, 20.75 as avg_assists, 279 as total_kills, 245 as total_deaths, 83 as total_assists, '大师组' as gname
union all
  select '外包杀手' as team_name, 50 as win_rate, 1.14 as kd, 4 as matches, 44.3 as hs_rate, 50 as pistol_win_rate, 50 as first_five_win_rate, 81.8 as avg_kills, 71.5 as avg_deaths, 28 as avg_assists, 327 as total_kills, 286 as total_deaths, 112 as total_assists, '大师组' as gname
union all
  select '来杯好茶摇一摇' as team_name, 50 as win_rate, 0.89 as kd, 4 as matches, 41.5 as hs_rate, 40 as pistol_win_rate, 80 as first_five_win_rate, 72.2 as avg_kills, 81.2 as avg_deaths, 27.5 as avg_assists, 289 as total_kills, 325 as total_deaths, 110 as total_assists, '挑战组' as gname
union all
  select 'FAGMajor11' as team_name, 50 as win_rate, 0.99 as kd, 4 as matches, 46.2 as hs_rate, 50 as pistol_win_rate, 50 as first_five_win_rate, 68.2 as avg_kills, 69.2 as avg_deaths, 23 as avg_assists, 273 as total_kills, 277 as total_deaths, 92 as total_assists, '挑战组' as gname
union all
  select '打不过我的是GAY' as team_name, 70 as win_rate, 1.07 as kd, 3 as matches, 57.8 as hs_rate, 50 as pistol_win_rate, 70 as first_five_win_rate, 79 as avg_kills, 74 as avg_deaths, 26.67 as avg_assists, 237 as total_kills, 222 as total_deaths, 80 as total_assists, '传奇组' as gname
union all
  select '峰狂星期四' as team_name, 70 as win_rate, 1.19 as kd, 3 as matches, 58.3 as hs_rate, 80 as pistol_win_rate, 30 as first_five_win_rate, 84 as avg_kills, 70.7 as avg_deaths, 25.67 as avg_assists, 252 as total_kills, 212 as total_deaths, 77 as total_assists, '传奇组' as gname
union all
  select '本质好人' as team_name, 80 as win_rate, 1.16 as kd, 4 as matches, 39.9 as hs_rate, 80 as pistol_win_rate, 50 as first_five_win_rate, 73.2 as avg_kills, 63.2 as avg_deaths, 26.5 as avg_assists, 293 as total_kills, 253 as total_deaths, 106 as total_assists, '挑战组' as gname
union all
  select '五个外包' as team_name, 80 as win_rate, 1.15 as kd, 4 as matches, 53 as hs_rate, 50 as pistol_win_rate, 80 as first_five_win_rate, 80.2 as avg_kills, 69.5 as avg_deaths, 29.5 as avg_assists, 321 as total_kills, 278 as total_deaths, 118 as total_assists, '传奇组' as gname
union all
  select 'hw邱邱畅' as team_name, 100 as win_rate, 1.41 as kd, 3 as matches, 45.7 as hs_rate, 80 as pistol_win_rate, 100 as first_five_win_rate, 69.3 as avg_kills, 49.3 as avg_deaths, 27.33 as avg_assists, 208 as total_kills, 148 as total_deaths, 82 as total_assists, '挑战组' as gname
union all
  select 'Null Pressure' as team_name, 100 as win_rate, 1.39 as kd, 2 as matches, 53.9 as hs_rate, 80 as pistol_win_rate, 100 as first_five_win_rate, 77 as avg_kills, 55.5 as avg_deaths, 21.5 as avg_assists, 154 as total_kills, 111 as total_deaths, 43 as total_assists, '传奇组' as gname
union all
  select '六辣子夹馍' as team_name, 100 as win_rate, 1.13 as kd, 3 as matches, 44.9 as hs_rate, 30 as pistol_win_rate, 100 as first_five_win_rate, 91.3 as avg_kills, 81 as avg_deaths, 34.67 as avg_assists, 274 as total_kills, 243 as total_deaths, 104 as total_assists, '大师组' as gname
union all
  select 'but one day' as team_name, 100 as win_rate, 1.14 as kd, 1 as matches, 51.7 as hs_rate, 100 as pistol_win_rate, 0 as first_five_win_rate, 87 as avg_kills, 76 as avg_deaths, 30 as avg_assists, 87 as total_kills, 76 as total_deaths, 30 as total_assists, '大师组' as gname
union all
  select 'T2爆了' as team_name, 100 as win_rate, 1.58 as kd, 4 as matches, 50.5 as hs_rate, 80 as pistol_win_rate, 100 as first_five_win_rate, 71.8 as avg_kills, 45.5 as avg_deaths, 23 as avg_assists, 287 as total_kills, 182 as total_deaths, 92 as total_assists, '挑战组' as gname
) x
join public.groups g on g.name = x.gname
join public.stages s
  on s.name = '排位赛 · 4轮BO1'
 and s.event_id = (select id from public.events where status in ('signup','running') order by edition desc limit 1)
 and s.group_id = g.id
join public.teams ta on ta.name = x.team_name
on conflict (team_id, stage_id) do update
set win_rate = excluded.win_rate,
    kd = excluded.kd,
    matches = excluded.matches,
    hs_rate = excluded.hs_rate,
    pistol_win_rate = excluded.pistol_win_rate,
    first_five_win_rate = excluded.first_five_win_rate,
    avg_kills = excluded.avg_kills,
    avg_deaths = excluded.avg_deaths,
    avg_assists = excluded.avg_assists,
    total_kills = excluded.total_kills,
    total_deaths = excluded.total_deaths,
    total_assists = excluded.total_assists;
