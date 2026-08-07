// 由完美对战平台 HTML 生成「排位赛结果导入 SQL」（matches + 比赛录像 match_media）
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'

const files = [
  'C:/Users/Aceond Wong/Downloads/完美对战-赛事开放平台1.html',
  'C:/Users/Aceond Wong/Downloads/完美对战-赛事开放平台2.html',
]

// 平台队名 → 系统队名（修正拼写/别名）
const nameMap = {
  'HW Major TEAM 1': '传奇捕峰人',
  战队ffd04b: '离冠只差一把',
}

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

const rows = []
for (const f of files) {
  const html = readFileSync(f, 'utf8')
  const ddRe = /<dd>([\s\S]*?)<\/dd>/g
  let m
  while ((m = ddRe.exec(html)) !== null) {
    const block = m[1]
    const creator = (block.match(/class="j-nickname"[^>]*>([^<]*)<\/a>/) || [])[1]?.trim() ?? ''
    const texts = [...block.matchAll(/<span class="text">(.*?)<\/span>/g)].map((x) => x[1].trim())
    const clean = texts.filter((t) => t !== creator && !t.includes('j-nickname'))
    const time = (block.match(/<span class="state">\s*([\d.]+ [\d:]+)/) || [])[1]?.trim() ?? ''
    const demo = (block.match(/href="(https:[^"]*\.dem[^"]*)"/) || [])[1]?.trim() ?? ''
    rows.push({
      team1: clean[0] ?? '',
      score: clean[1] ?? '',
      team2: clean[2] ?? '',
      map: clean[3] ?? '',
      time: time.replace(/\./g, '-'),
      demo,
    })
  }
}

// 过滤无时间的比赛
const valid = rows.filter((r) => r.time)
const skipped = rows.length - valid.length

const norm = (name) => nameMap[name] ?? name
const lines = []
const mediaLines = []
let crossGroup = 0
let unmapped = 0

for (const r of valid) {
  const [a, b] = r.score.split(':').map((v) => parseInt(v, 10) || 0)
  const aName = norm(r.team1)
  const bName = norm(r.team2)
  if (!groupMap[aName] || !groupMap[bName]) {
    unmapped++
    console.log(`!! 无法映射: ${r.team1}(${aName}) / ${r.team2}(${bName})`)
    continue
  }
  const ga = groupMap[aName]
  const gb = groupMap[bName]
  if (ga !== gb) {
    crossGroup++
    console.log(`!! 跨组: ${aName}[${ga}] vs ${bName}[${gb}] @ ${r.time}`)
  }
  const gname = ga // 使用 A 队组别
  const t = r.time.slice(0, 10) // 比赛时间只保留日期
  const mp = r.map
  lines.push(
    `  select '${aName}' as a_name, '${bName}' as b_name, ${a} as a_score, ${b} as b_score, '${mp}' as map, '${t}' as scheduled_at, '${gname}' as gname`,
  )
  if (r.demo) {
    mediaLines.push(
      `  select '${aName}' as a_name, '${bName}' as b_name, '${mp}' as map, '${t}' as scheduled_at, '${r.demo}' as demo_url`,
    )
  }
}

// 诊断查询用的数据行（全部加注释前缀，避免破坏主脚本）
const diagBody = lines
  .flatMap((l, i) => (i > 0 ? ['-- union all', `-- ${l}`] : [`-- ${l}`]))
  .join('\n')

const eventSub = `(select id from public.events where status in ('signup','running') order by edition desc limit 1)`

const sql = `-- ============================================================
-- HVV MAJOR 当前届：将排位赛比赛结果（${lines.length} 场，源自完美对战平台）更新到已有对阵
-- 说明：忽略无时间记录 ${skipped} 场；只更新比分/地图/时间，轮次保持原位不动
-- 可重复执行（重复更新结果一致）
-- ============================================================

-- ① 清理上次误导入的记录（全部挤在第 1 轮、带比分和时间的排位赛记录）
--    注意：若你已手动维护了第 1 轮比分，请跳过这条 DELETE
delete from public.matches m
using public.stages s
where m.stage_id = s.id
  and s.name = '排位赛 · 4轮BO1'
  and m.round_number = 1
  and m.status = 'completed'
  and m.map is not null
  and m.scheduled_at is not null;

-- ② 更新已有对阵的比分/地图/时间（round_number 不动，保持原位）
update public.matches m
set team_a_score = case when m.team_a_id = ta.id then x.a_score else x.b_score end,
    team_b_score = case when m.team_a_id = ta.id then x.b_score else x.a_score end,
    winner_id = case
      when x.a_score > x.b_score and m.team_a_id = ta.id then ta.id
      when x.a_score > x.b_score and m.team_a_id = tb.id then tb.id
      when x.b_score > x.a_score and m.team_a_id = ta.id then tb.id
      when x.b_score > x.a_score and m.team_a_id = tb.id then ta.id
      else null end,
    map = x.map,
    scheduled_at = x.scheduled_at::timestamptz,
    best_of = 1,
    status = 'completed'
from (
${lines.join('\nunion all\n')}
) x
join public.groups g on g.name = x.gname
join public.stages s
  on s.name = '排位赛 · 4轮BO1'
 and s.event_id = ${eventSub}
 and s.group_id = g.id
join public.teams ta on ta.name = x.a_name
join public.teams tb on tb.name = x.b_name
where m.stage_id = s.id
  and ((m.team_a_id = ta.id and m.team_b_id = tb.id)
    or (m.team_a_id = tb.id and m.team_b_id = ta.id));

-- ============ 比赛录像（完美对战 DEMO 链接 → match_media） ============
insert into public.match_media (match_id, kind, label, url)
select m.id, 'vod', '完美对战DEMO', x.demo_url
from (
${mediaLines.join('\nunion all\n')}
) x
join public.teams ta on ta.name = x.a_name
join public.teams tb on tb.name = x.b_name
join public.matches m
  on ((m.team_a_id = ta.id and m.team_b_id = tb.id)
    or (m.team_a_id = tb.id and m.team_b_id = ta.id))
 and m.map = x.map
 and m.scheduled_at = x.scheduled_at::timestamptz
where not exists (
  select 1 from public.match_media mm
  where mm.match_id = m.id and mm.kind = 'vod' and mm.url = x.demo_url
);

-- ※ 可选诊断：若上方 UPDATE 影响的记录数少于 ${lines.length}，
--    说明部分比赛在系统已有对阵中匹配不到（缺对阵或队名有出入）。
--    取消注释运行下面查询，即可查看哪些比赛未匹配上：
-- select x.a_name as 队A, x.b_name as 队B, x.map as 地图, x.scheduled_at as 日期, x.gname as 组别
-- from (
${diagBody}
-- ) x
-- join public.groups g on g.name = x.gname
-- join public.stages s
--   on s.name = '排位赛 · 4轮BO1'
--  and s.event_id = ${eventSub}
--  and s.group_id = g.id
-- join public.teams ta on ta.name = x.a_name
-- join public.teams tb on tb.name = x.b_name
-- where not exists (
--   select 1 from public.matches m
--   where m.stage_id = s.id
--     and ((m.team_a_id = ta.id and m.team_b_id = tb.id)
--       or (m.team_a_id = tb.id and m.team_b_id = ta.id))
-- );
`

mkdirSync('e:/projects/hvv-major/data', { recursive: true })
writeFileSync('e:/projects/hvv-major/data/wmpvp_import.sql', sql, 'utf8')

console.log(`总记录 ${rows.length}，忽略无时间 ${skipped}，更新 ${lines.length} 场已有对阵`)
console.log(`录像登记 ${mediaLines.length} 条，跨组 ${crossGroup}，未映射 ${unmapped}`)
console.log('输出: e:/projects/hvv-major/data/wmpvp_import.sql')
