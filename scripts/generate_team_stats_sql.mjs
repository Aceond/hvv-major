// 由「完美对战-战队数据」HTML 生成「战队统计导入 SQL」（写入 team_stats 表）
// 复用与比赛导入一致的组别映射；stage 取该组「排位赛 · 4轮BO1」阶段，按 (team_id, stage_id) 幂等 upsert
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'

const src = 'C:/Users/Aceond Wong/Downloads/完美对战-赛事开放平台-战队数据.html'

// 系统队名 → 组别
const groupMap = {
  '来杯好茶摇一摇': '挑战组', 'T2爆了': '挑战组', '离冠只差一把': '挑战组', 'hw邱邱畅': '挑战组',
  '打赢我的是向日葵': '挑战组', '步枪大队': '挑战组', '华尔孔Hualcons': '挑战组', '本质好人': '挑战组',
  'FAGMajor11': '挑战组', 'Team Ten': '挑战组',
  'STORMGAME': '大师组', 'but one day': '大师组', 'BackToBasic': '大师组', '那个男人在这': '大师组',
  'HWmajor11_Team5': '大师组', '六辣子夹馍': '大师组', '没有队名': '大师组', '外包杀手': '大师组',
  '传奇捕峰人': '传奇组', '五个外包': '传奇组', 'Null Pressure': '传奇组', '峰狂星期四': '传奇组',
  '泥头车3.0': '传奇组', '打赢我们是给': '传奇组', '蹬峰造极2.0': '传奇组', '打不过我的是GAY': '传奇组',
}

const html = readFileSync(src, 'utf8')
const table = html.match(/<table[^>]*id="mcont-table"[\s\S]*?<\/table>/)?.[0] ?? ''
const clean = (s) => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
const rows = [...table.matchAll(/<tr>([\s\S]*?)<\/tr>/g)]
  .map((m) => m[1])
  .filter((block) => block.includes('<td'))
  .map((block) => [...block.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((x) => clean(x[1])))

const num = (s) => parseFloat(s.replace('%', '')) || 0

const lines = []
let unmapped = 0
for (const r of rows) {
  const name = r[1]
  const gname = groupMap[name]
  if (!gname) {
    unmapped++
    console.log(`!! 无法映射组别: ${name}`)
    continue
  }
  // 列序：排名 战队 胜率 K/D 比赛数 爆头率 手枪局胜率 先胜5回合 场均击杀 场均死亡 场均助攻 总击杀 总死亡 总助攻
  lines.push(
    `  select '${name}' as team_name, ${num(r[2])} as win_rate, ${num(r[3])} as kd, ${num(r[4])} as matches, ` +
      `${num(r[5])} as hs_rate, ${num(r[6])} as pistol_win_rate, ${num(r[7])} as first_five_win_rate, ` +
      `${num(r[8])} as avg_kills, ${num(r[9])} as avg_deaths, ${num(r[10])} as avg_assists, ` +
      `${num(r[11])} as total_kills, ${num(r[12])} as total_deaths, ${num(r[13])} as total_assists, '${gname}' as gname`,
  )
}

const eventSub = `(select id from public.events where status in ('signup','running') order by edition desc limit 1)`

const sql = `-- ============================================================
-- HVV MAJOR 当前届：导入战队统计数据（${lines.length} 支，源自完美对战平台）
-- 可重复执行（按 team_id+stage_id 幂等覆盖）
-- ============================================================
insert into public.team_stats (team_id, stage_id, group_id, win_rate, kd, matches, hs_rate, pistol_win_rate, first_five_win_rate, avg_kills, avg_deaths, avg_assists, total_kills, total_deaths, total_assists)
select ta.id, s.id, g.id, x.win_rate, x.kd, x.matches, x.hs_rate, x.pistol_win_rate, x.first_five_win_rate, x.avg_kills, x.avg_deaths, x.avg_assists, x.total_kills, x.total_deaths, x.total_assists
from (
${lines.join('\nunion all\n')}
) x
join public.groups g on g.name = x.gname
join public.stages s
  on s.name = '排位赛 · 4轮BO1'
 and s.event_id = ${eventSub}
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
`

mkdirSync('e:/projects/hvv-major/data', { recursive: true })
writeFileSync('e:/projects/hvv-major/data/wmpvp_team_stats_import.sql', sql, 'utf8')

console.log(`战队 ${lines.length} 支，未映射 ${unmapped}`)
console.log('输出: e:/projects/hvv-major/data/wmpvp_team_stats_import.sql')
