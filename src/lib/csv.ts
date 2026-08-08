// 通用 CSV 解析与统计字段映射工具
// 用于从外部平台（如完美对战平台 wmpvp）导出的 CSV 批量导入统计数据。

/** 解析 CSV 文本为二维数组（支持 BOM、引号包裹字段、字段内含逗号/换行、"" 转义） */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  // 去掉 BOM 与结尾多余换行
  const src = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      row.push(field)
      field = ''
    } else if (ch === '\n') {
      row.push(field)
      field = ''
      if (row.some((c) => c.trim() !== '')) rows.push(row)
      row = []
    } else {
      field += ch
    }
  }
  row.push(field)
  if (row.some((c) => c.trim() !== '')) rows.push(row)
  return rows
}

/** 百分比/数字字符串转数字："0.0%" → 0，"85.5" → 85.5，空串 → 0 */
export function toNum(v: string | undefined): number {
  if (v === undefined || v === null) return 0
  const s = String(v).replace(/%/g, '').replace(/[^\d.-]/g, '').trim()
  if (!s) return 0
  const n = Number(s)
  return Number.isFinite(n) ? n : 0
}

/** 规范化列名：去空格、全角空格、括号后缀（如 胜率(↓) → 胜率） */
export function normalizeHeader(h: string): string {
  return h
    .trim()
    .replace(/[（(][^）)]*[）)]/g, '')
    .replace(/[\s\u3000]/g, '')
    .toLowerCase()
}

/** 在表头里找目标列（多个别名任一命中即返回列下标），找不到返回 -1 */
export function findColumn(header: string[], aliases: string[]): number {
  const norm = header.map(normalizeHeader)
  for (let i = 0; i < norm.length; i++) {
    if (aliases.some((a) => normalizeHeader(a) === norm[i])) return i
  }
  return -1
}

// ---------------- 队伍统计列别名（wmpvp_teams.csv 等） ----------------
export const TEAM_HEADER_ALIASES: Record<string, string[]> = {
  team_name: ['战队', '队伍', '队名', 'team', 'name'],
  win_rate: ['胜率', 'winrate', 'win_rate'],
  kd: ['k/d', 'kd'],
  matches: ['比赛数', '场次', 'matches'],
  hs_rate: ['爆头率', 'hsrate', 'hs_rate', 'headshot'],
  pistol_win_rate: ['手枪局胜率', 'pistolwinrate', 'pistol_win_rate'],
  first_five_win_rate: ['先胜5回合胜率', 'first5winrate', 'first_five_win_rate'],
  avg_kills: ['场均击杀', 'avgkills', 'avg_kills'],
  avg_deaths: ['场均死亡', 'avgdeaths', 'avg_deaths'],
  avg_assists: ['场均助攻', 'avgassists', 'avg_assists'],
  total_kills: ['总击杀', 'totalkills', 'total_kills'],
  total_deaths: ['总死亡', 'totaldeaths', 'total_deaths'],
  total_assists: ['总助攻', 'totalassists', 'total_assists'],
}

// ---------------- 个人统计列别名 ----------------
export const PLAYER_HEADER_ALIASES: Record<string, string[]> = {
  player_name: ['选手', '昵称', '玩家', 'player', 'name', 'nickname'],
  we: ['we'],
  rating_pro: ['ratingpro', 'rating_pro', 'rating'],
  win_rate: ['胜率', 'winrate', 'win_rate'],
  kd: ['k/d', 'kd'],
  matches: ['比赛数', '场次', 'matches'],
  hs_rate: ['爆头率', 'hsrate', 'hs_rate', 'headshot'],
  kpr: ['击杀/回合', 'kpr', 'killsperround'],
  dpr: ['死亡/回合', 'dpr', 'deathsperround'],
  adr: ['adr', '平均伤害'],
  total_kills: ['总击杀', 'totalkills', 'total_kills'],
  total_deaths: ['总死亡', 'totaldeaths', 'total_deaths'],
  total_assists: ['总助攻', 'totalassists', 'total_assists'],
  fpr: ['首杀/回合', 'fpr', 'firstkills'],
  awp_kpr: ['awp击杀/回合', 'awpkpr', 'awp_kpr'],
}

/** 从 CSV 表头解析出一行对象：aliasKey -> 单元格原始字符串（未命中列为 undefined） */
export function rowToObject(
  header: string[],
  row: string[],
  aliases: Record<string, string[]>,
): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {}
  for (const key of Object.keys(aliases)) {
    const idx = findColumn(header, aliases[key])
    out[key] = idx >= 0 ? row[idx] : undefined
  }
  return out
}
