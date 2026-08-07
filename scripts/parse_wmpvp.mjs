// 解析完美对战赛事开放平台导出的 HTML（团队赛列表），生成 CSV 与 Markdown 表格
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'

const files = [
  'C:/Users/Aceond Wong/Downloads/完美对战-赛事开放平台1.html',
  'C:/Users/Aceond Wong/Downloads/完美对战-赛事开放平台2.html',
]

const rows = []
for (const f of files) {
  const html = readFileSync(f, 'utf8')
  const ddRe = /<dd>([\s\S]*?)<\/dd>/g
  let m
  while ((m = ddRe.exec(html)) !== null) {
    const block = m[1]
    const room = (block.match(/<span class="room">([^<]*)<\/span>/) || [])[1]?.trim() ?? ''
    const creator = (block.match(/class="j-nickname"[^>]*>([^<]*)<\/a>/) || [])[1]?.trim() ?? ''
    const texts = [...block.matchAll(/<span class="text">(.*?)<\/span>/g)].map((x) => x[1].trim())
    // texts[0] 为创建者（含链接），其余依次为 TEAM1、比分、TEAM2、地图、大区
    const clean = texts.filter((t) => t !== creator && !t.includes('j-nickname'))
    const time = (block.match(/<span class="state">\s*([\d.]+ [\d:]+)/) || [])[1]?.trim() ?? ''
    const demo = (block.match(/href="(https:[^"]*\.dem[^"]*)"/) || [])[1]?.trim() ?? ''
    rows.push({
      room,
      creator,
      team1: clean[0] ?? '',
      score: clean[1] ?? '',
      team2: clean[2] ?? '',
      map: clean[3] ?? '',
      region: clean[4] ?? '',
      time: time.replace(/\./g, '-'),
      demo,
    })
  }
}

// 按时间排序
rows.sort((a, b) => a.time.localeCompare(b.time))

// CSV（带 BOM，Excel 打开不乱码）
const header = ['TEAM1', '比分', 'TEAM2', '地图', '比赛日期', 'DEMO链接']
const csv = [header.join(','), ...rows.map((r) =>
  [r.team1, r.score, r.team2, r.map, r.time.slice(0, 10), r.demo]
    .map((v) => `"${(v ?? '').replace(/"/g, '""')}"`)
    .join(','),
)].join('\n')

// Markdown 表格
const md = [
  '| TEAM1 | 比分 | TEAM2 | 地图 | 比赛日期 | DEMO |',
  '|---|---|---|---|---|---|',
  ...rows.map((r) =>
    `| ${r.team1} | ${r.score} | ${r.team2} | ${r.map} | ${r.time.slice(0, 10)} | ${r.demo ? '[下载](https://' + r.demo.replace('https://', '') + ')' : '-'} |`,
  ),
].join('\n')

mkdirSync('e:/projects/hvv-major/data', { recursive: true })
writeFileSync('e:/projects/hvv-major/data/wmpvp_matches.csv', '\ufeff' + csv, 'utf8')
writeFileSync('e:/projects/hvv-major/data/wmpvp_matches.md', md, 'utf8')

console.log(`共解析 ${rows.length} 场比赛`)
console.log('输出: e:/projects/hvv-major/data/wmpvp_matches.csv')
console.log('输出: e:/projects/hvv-major/data/wmpvp_matches.md')
