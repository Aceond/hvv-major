// 解析完美对战赛事开放平台导出的「战队数据」HTML，生成 CSV 与 Markdown 表格
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'

const src = 'C:/Users/Aceond Wong/Downloads/完美对战-赛事开放平台-战队数据.html'

const html = readFileSync(src, 'utf8')

// 只取「战队」页签的静态表格
const table = html.match(/<table[^>]*id="mcont-table"[\s\S]*?<\/table>/)?.[0] ?? ''
if (!table) {
  console.error('未找到战队数据表格')
  process.exit(1)
}

// 清理单元格内的 HTML 标签与空白
const clean = (s) =>
  s
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()

// 表头
const headers = [...table.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((m) => clean(m[1]))

// 数据行
const rows = [...table.matchAll(/<tr>([\s\S]*?)<\/tr>/g)]
  .map((m) => m[1])
  .filter((block) => block.includes('<td')) // 跳过表头行
  .map((block) => [...block.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((x) => clean(x[1])))

// CSV（带 BOM，Excel 打开不乱码）
const csv = [headers.join(','), ...rows.map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(','))].join('\n')

// Markdown 表格
const md = [
  `| ${headers.join(' | ')} |`,
  `| ${headers.map(() => '---').join(' | ')} |`,
  ...rows.map((r) => `| ${r.join(' | ')} |`),
].join('\n')

mkdirSync('e:/projects/hvv-major/data', { recursive: true })
writeFileSync('e:/projects/hvv-major/data/wmpvp_teams.csv', '\ufeff' + csv, 'utf8')
writeFileSync('e:/projects/hvv-major/data/wmpvp_teams.md', md, 'utf8')

console.log(`表头 ${headers.length} 列，战队 ${rows.length} 支`)
console.log('输出: e:/projects/hvv-major/data/wmpvp_teams.csv')
console.log('输出: e:/projects/hvv-major/data/wmpvp_teams.md')
