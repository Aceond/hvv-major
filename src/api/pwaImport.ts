// 完美对战平台（PWA）战绩自动导入客户端
// 通路：
//   1. 拉「我的对局」列表 → 需服务端代理 supabase Edge Function `pwa-proxy`
//      （PWA list 接口要求自定义 steamid 请求头，浏览器跨域预检不放行，必须代理）；
//      若未部署代理，可退化为「粘贴 JSON」。
//   2. 拉单场 report → PWA report 接口支持浏览器直连（简单 GET + a/r/s/t 签名，无自定义头）。
// 依赖 src/lib/pwaCrypto.ts 的浏览器端签名实现（md5/sha1）。
import { buildSignedPwaParams } from '@/lib/pwaCrypto'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'

/** PWA report 接口（单场完整计分板，浏览器直连可用） */
export const PWA_REPORT_URL = 'https://pwaweblogin.wmpvp.com/match-api/report'

/** PWA 接口返回的顶层约定：code=0 成功 */
interface PwaResp<T> {
  code: number
  msg?: string
  data: T
}

/** 列表接口单条记录（「我」的视角，字段为字符串） */
export interface PwaListRecord {
  match: string
  user_id: string // Steam64 位 ID
  steam_nick?: string | null
  date?: string | null
  team_id?: string | null
  kill?: string | null
  death?: string | null
  rating?: string | null
  [k: string]: unknown
}

/** report 中单名选手战绩（已归一化为数字） */
export interface PwaPlayer {
  steam64: string // user_id（Steam64 位 ID）
  steamShortId: string // steam_id（短 ID，仅参考）
  nick: string | null
  teamId: string | null
  kills: number
  deaths: number
  assists: number
  headshots: number
  headshotRatePct: number // 整数 0~100
  firstKills: number
  multiKills: number
  clutches: number
  adr: number
  damage: number
  rounds: number
  rating: number
  we: number // PWA 无 WE 字段，固定 0（需人工补充）
  isWin: boolean
}

/** 归一化后的单场比赛（一场 = 一张地图） */
export interface PwaParsedMatch {
  matchId: string
  cupId: string | null
  cupName: string | null
  isThirdParty: boolean
  map: string // 原始地图名（de_mirage）
  mapLabel: string // 中文地图名（荒漠迷城…）
  rounds: number
  teams: Record<string, string> // PWA team_id -> 队名
  score: Record<string, number> // PWA team_id -> 本图回合胜数
  winnerTeamId: string | null
  players: PwaPlayer[]
}

/** 代理地址：优先 VITE_PWA_PROXY_URL；否则由 VITE_SUPABASE_URL 推导 Edge Function 地址 */
function proxyBase(): string {
  const explicit = import.meta.env.VITE_PWA_PROXY_URL as string | undefined
  if (explicit) return explicit.replace(/\/$/, '')
  const sbUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
  if (sbUrl) return `${sbUrl.replace(/\/$/, '')}/functions/v1/pwa-proxy`
  return ''
}

/** 是否有可用的列表代理（未配置则只能走粘贴 JSON） */
export function hasPwaProxy(): boolean {
  return proxyBase().length > 0
}

/**
 * 拉「我的对局」列表（走 Edge Function 代理，GET 简单请求避免预检）。
 * 返回原始记录数组（PwaListRecord）。代理不可用时抛错，UI 可提示改用粘贴 JSON。
 */
export async function fetchPwaMatchList(
  token: string,
  steam64: string,
  size = 30,
): Promise<PwaListRecord[]> {
  const base = proxyBase()
  if (!base) throw new Error('未配置 PWA 代理（VITE_PWA_PROXY_URL 或 Supabase 未配置）')
  const params = buildSignedPwaParams({ access_token: token, size: String(size), uid: steam64 })
  const qs = new URLSearchParams({ url: 'list', steamid: steam64, ...params })
  const resp = await fetch(`${base}?${qs.toString()}`, { method: 'GET' })
  if (!resp.ok) throw new Error(`代理请求失败（HTTP ${resp.status}），可改用「粘贴 JSON」导入`)
  const json = (await resp.json()) as PwaResp<PwaListRecord[]>
  if (json.code !== 0) throw new Error(`PWA 返回错误 ${json.code}：${json.msg ?? ''}（token/Steam64 可能不匹配）`)
  return json.data ?? []
}

/**
 * 拉单场 report（浏览器直连，签名由 pwaCrypto.ts 在本地生成）。
 * 返回归一化的 PwaParsedMatch；失败抛错。
 */
export async function fetchPwaReport(matchId: string, token: string): Promise<PwaParsedMatch> {
  const params = buildSignedPwaParams({ access_token: token, match_id: matchId })
  const qs = new URLSearchParams(params)
  const resp = await fetch(`${PWA_REPORT_URL}?${qs.toString()}`, { method: 'GET' })
  if (!resp.ok) throw new Error(`PWA report 请求失败（HTTP ${resp.status}）`)
  const json = (await resp.json()) as PwaResp<Record<string, unknown>>
  if (json.code !== 0) throw new Error(`PWA 返回错误 ${json.code}：${json.msg ?? ''}（token/Steam64 可能不匹配）`)
  return normalizeReportToMatch(json.data ?? {})
}

// ============ 解析 ============

/** 数字安全转换（PWA 字段常为字符串） */
function num(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}
function str(v: unknown): string {
  return v == null ? '' : String(v)
}

/** 地图名归一化：de_mirage → 荒漠迷城（HVV 录入用中文名） */
const MAP_LABEL: Record<string, string> = {
  de_mirage: '荒漠迷城',
  de_dust2: '炙热沙城Ⅱ',
  de_inferno: '炼狱小镇',
  de_nuke: '核子危机',
  de_ancient: '远古遗迹',
  de_anubis: '阿努比斯',
  de_overpass: '死城之谜',
  de_train: '列车停放站',
  de_vertigo: '眩晕大厦',
}
export function mapLabel(raw: string): string {
  return MAP_LABEL[raw] ?? raw.replace(/^de_/, '')
}

/**
 * 把 PWA report 的顶层 data 归一化为 PwaParsedMatch。
 * data 结构（实测）：
 *   match_id, match_winner_id, cup: [...]/{} , teams: [...]/{} ,
 *   report: { map, win_team_id, players[], results[], teamData[] }
 */
export function normalizeReportToMatch(data: Record<string, unknown>): PwaParsedMatch {
  const report = (data.report && typeof data.report === 'object' ? data.report : {}) as Record<string, unknown>
  const inner = report.report && typeof report.report === 'object' ? (report.report as Record<string, unknown>) : report

  // cup 可能是数组（[ {id,name} ]）或对象（{id,name}）
  const cupRaw = data.cup
  const cup = Array.isArray(cupRaw) ? (cupRaw[0] as Record<string, unknown> | undefined) ?? {} : (cupRaw as Record<string, unknown> | undefined) ?? {}
  const cupId = cup.id != null ? String(cup.id) : null
  const cupName = cup.name != null ? String(cup.name) : null

  // teams 可能是 { teamId: {id,name} } 或 [ {id,name} ]
  const teamMap: Record<string, string> = {}
  const teamsRaw = data.teams
  if (Array.isArray(teamsRaw)) {
    for (const t of teamsRaw as Array<Record<string, unknown>>) {
      const id = str(t.id ?? t.team_id)
      if (id) teamMap[id] = str(t.name ?? t.team_name)
    }
  } else if (teamsRaw && typeof teamsRaw === 'object') {
    for (const [k, v] of Object.entries(teamsRaw as Record<string, unknown>)) {
      if (v && typeof v === 'object') {
        const o = v as Record<string, unknown>
        teamMap[k] = str(o.name ?? o.team_name)
      } else {
        teamMap[k] = str(v)
      }
    }
  }

  // 每队回合胜数：从 results 汇总 win_team_id
  const score: Record<string, number> = {}
  const results = (inner.results as Array<Record<string, unknown>> | undefined) ?? []
  for (const r of results) {
    const tid = str(r.win_team_id)
    if (tid) score[tid] = (score[tid] ?? 0) + 1
  }
  const rounds = results.length

  // 胜方：优先 report.win_team_id，其次顶层 match_winner_id
  const winnerTeamId = str(inner.win_team_id || data.match_winner_id || null) || null

  // 选手
  const players: PwaPlayer[] = []
  for (const p of (inner.players as Array<Record<string, unknown>> | undefined) ?? []) {
    const kills = Math.round(num(p.kill))
    const headshots = Math.round(num(p.headshot_kill_count))
    const adr = Math.round(num(p.adpr) * 100) / 100
    const multiKills = Math.round(num(p.two_kill) + num(p.three_kill) + num(p.four_kill) + num(p.five_kill))
    const clutches = Math.round(num(p['1v1']) + num(p['1v2']) + num(p['1v3']) + num(p['1v4']) + num(p['1v5']))
    players.push({
      steam64: str(p.user_id),
      steamShortId: str(p.steam_id),
      nick: p.steam_nick != null ? String(p.steam_nick) : null,
      teamId: str(p.team_id) || null,
      kills,
      deaths: Math.round(num(p.death)),
      assists: Math.round(num(p.assist)),
      headshots,
      headshotRatePct: kills > 0 ? Math.round((headshots / kills) * 100) : 0,
      firstKills: Math.round(num(p.first_kill)),
      multiKills,
      clutches,
      adr,
      damage: Math.round(adr * rounds),
      rounds,
      rating: Math.round(num(p.rating) * 100) / 100,
      we: 0, // PWA report 无 WE 字段，留待人工补充
      isWin: num(p.is_win) === 1,
    })
  }

  const matchId = str(data.match_id || data.match)
  const gameType = str(report.game_type ?? inner.game_type)
  const isThirdParty = gameType === '16' || (cupId !== null && cupId !== '0')

  return {
    matchId,
    cupId,
    cupName,
    isThirdParty,
    map: str(inner.map),
    mapLabel: mapLabel(str(inner.map)),
    rounds,
    teams: teamMap,
    score,
    winnerTeamId,
    players,
  }
}

/** 赛事名匹配：去除非字母数字并小写后做子串匹配（hwcs-major11 / HWCS MAJOR 11 等价） */
export function cupNameMatches(cupName: string | null | undefined, filter: string): boolean {
  const normalize = (s: string) => (s || '').toLowerCase().replace(/[^0-9a-z]/g, '')
  const t = normalize(filter)
  if (!t) return true
  return normalize(cupName ?? '').includes(t)
}

/** 判断单条列表记录是否可能是第三方局（列表层字段有限，最终以 report 的 cup 为准） */
export function isThirdPartyRecord(r: PwaListRecord): boolean {
  const mr = (r.match_result ?? {}) as Record<string, unknown>
  const gt = str(mr.game_type)
  const cup = mr.cup_id
  return gt === '16' || (cup !== undefined && cup !== null && String(cup) !== '0' && String(cup) !== '')
}

// ============ 粘贴 JSON 回退 ============

/** 解析粘贴的「对局列表」JSON（支持 {data:[...]} 或裸数组），返回 PwaListRecord[] */
export function parsePwaListJson(text: string): PwaListRecord[] {
  const j = JSON.parse(text)
  const arr = Array.isArray(j) ? j : j?.data
  if (!Array.isArray(arr)) throw new Error('列表 JSON 结构无法识别（应为 {data:[...]} 或裸数组）')
  return arr as PwaListRecord[]
}

/** 解析粘贴的「单场 report」JSON（顶层 data 对象或直接 report data），返回 PwaParsedMatch */
export function parsePwaReportJson(text: string): PwaParsedMatch {
  const j = JSON.parse(text) as Record<string, unknown>
  // 兼容 { code, data } 包装
  const data = (j.code !== undefined && j.data && typeof j.data === 'object' ? j.data : j) as Record<string, unknown>
  return normalizeReportToMatch(data)
}

/** 自动识别粘贴 JSON 是列表还是 report（列表顶层有 data 数组 / 裸数组；report 有 match_id + report 键） */
export function detectPastedKind(text: string): 'list' | 'report' | null {
  try {
    const j = JSON.parse(text)
    const arr = Array.isArray(j) ? j : j?.data
    if (Array.isArray(arr)) return 'list'
    if (j && typeof j === 'object' && (j.match_id || (j.data && typeof j.data === 'object' && j.data.match_id))) return 'report'
    return null
  } catch {
    return null
  }
}

/** 读当前登录用户自己报名表里的 Steam64 位 ID（RLS 允许读自己的申请），用于预填 */
export async function fetchMySteam64(): Promise<string | null> {
  if (!isSupabaseConfigured || !supabase) return null
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase
    .from('player_applications')
    .select('steam_id')
    .eq('profile_id', user.id)
    .not('steam_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
  const row = (data ?? [])[0] as { steam_id?: string | null } | undefined
  return row?.steam_id ? String(row.steam_id) : null
}
