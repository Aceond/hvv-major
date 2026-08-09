// 赛程与积分数据访问层
// 未配置 Supabase（演示模式）时返回 mock 数据。
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import {
  getGroupName,
  getTeamName,
  mockGroups,
  mockMatchMaps,
  mockMatches,
  mockStages,
  mockStandings,
} from '@/mock/data'
import type { Group, Match, MatchMap, Stage, StandingsRow } from './types'

/** 组别列表（传奇组 / 大师组 / 挑战组） */
export async function listGroups(): Promise<Group[]> {
  if (!isSupabaseConfigured || !supabase) return mockGroups
  const { data } = await supabase.from('groups').select('*').order('sort_order')
  return (data as Group[]) ?? []
}

/** 阶段列表（可按赛事 + 组别过滤：每届赛事每个组别的赛程单独管理；选组别时包含跨组/决赛阶段；不传则返回全部） */
export async function listStages(eventId?: string, groupId?: string): Promise<Stage[]> {
  if (!isSupabaseConfigured || !supabase) {
    return mockStages
      .filter((s) => !eventId || s.event_id === eventId)
      .filter((s) => !groupId || s.group_id === groupId || s.group_id === null)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((s) => ({
        ...s,
        // 演示模式补组别名：阶段带组别（传奇组/大师组/挑战组），与真实环境返回一致
        group_name: s.group_id ? mockGroups.find((g) => g.id === s.group_id)?.name ?? null : null,
      }))
  }
  let query = supabase.from('stages').select('*, group:groups(name)').order('sort_order')
  if (eventId) query = query.eq('event_id', eventId)
  if (groupId) query = query.or(`group_id.eq.${groupId},group_id.is.null`)
  const { data } = await query
  return ((data ?? []) as any[]).map((s) => ({ ...s, group_name: s.group?.name ?? null }))
}

/** 阶段展示名：阶段名 + 组别名（跨组/决赛阶段无组别则不拼接），赛程相关位置统一使用 */
export function stageDisplayName(s: Pick<Stage, 'name' | 'group_name'>): string {
  const g = s.group_name ? ` · ${s.group_name}` : ''
  return `${s.name}${g}`
}

/** 演示模式下补全联表展示字段 */
function decorate(matches: Match[]): Match[] {
  return matches.map((m) => ({
    ...m,
    team_a_name: m.team_a_name ?? getTeamName(m.team_a_id),
    team_b_name: m.team_b_name ?? getTeamName(m.team_b_id),
    stage_name: m.stage_name ?? mockStages.find((s) => s.id === m.stage_id)?.name,
    group_name: m.group_name ?? getGroupName(m.group_id),
  }))
}

/** 本周区间（周一 00:00:00 ~ 周日 23:59:59），返回 'YYYY-MM-DD' 起止 */
export function thisWeekRange(): { start: string; end: string } {
  const now = new Date()
  const day = now.getDay() // 0=周日
  const diffToMonday = day === 0 ? -6 : 1 - day
  const start = new Date(now)
  start.setDate(now.getDate() + diffToMonday)
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  end.setHours(23, 59, 59, 999)
  const pad = (n: number) => String(n).padStart(2, '0')
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  return { start: fmt(start), end: fmt(end) }
}

/** 本周赛程（首页"最近比赛"用，按开赛时间升序） */
export async function listThisWeekMatches(): Promise<Match[]> {
  const { start, end } = thisWeekRange()
  if (!isSupabaseConfigured || !supabase) {
    const inWeek = mockMatches.filter(
      (m) => m.scheduled_at && m.scheduled_at >= start && m.scheduled_at <= end,
    )
    // 演示兜底：本周无静态数据时，生成一组示例对阵便于预览
    const list = inWeek.length > 0 ? inWeek : buildDemoWeekMatches(start)
    return decorate(list).sort((a, b) =>
      (a.scheduled_at ?? '').localeCompare(b.scheduled_at ?? ''),
    )
  }
  const { data } = await supabase
    .from('matches')
    .select(
      '*, stage:stages(name), group:groups(name), team_a:teams!matches_team_a_id_fkey(name), team_b:teams!matches_team_b_id_fkey(name)',
    )
    .gte('scheduled_at', start)
    .lte('scheduled_at', `${end} 23:59:59`)
    .order('scheduled_at')
  return ((data ?? []) as any[]).map((m) => ({
    ...m,
    stage_name: m.stage?.name,
    group_name: m.group?.name,
    team_a_name: m.team_a?.name,
    team_b_name: m.team_b?.name,
  }))
}

/** 生成本周的示例对阵（周一 ~ 周四各一场） */
function buildDemoWeekMatches(start: string): Match[] {
  const pairs: Array<[string, string, string | null]> = [
    ['team-1', 'team-6', 'g1'],
    ['team-3', 'team-9', 'g2'],
    ['team-2', 'team-8', 'g3'],
    ['team-12', 'team-5', null],
  ]
  const times = ['19:00', '20:30']
  const pad = (n: number) => String(n).padStart(2, '0')
  const base = new Date(`${start}T00:00:00`)
  return pairs.map(([a, b, g], i) => {
    const d = new Date(base)
    d.setDate(base.getDate() + i)
    const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    return {
      id: `week-${date}-${i}`,
      stage_id: 'stage-1',
      group_id: g,
      round_number: 1,
      team_a_id: a,
      team_b_id: b,
      best_of: 1,
      map: null,
      team_a_score: 0,
      team_b_score: 0,
      winner_id: null,
      status: 'scheduled' as const,
      scheduled_at: `${date} ${times[i % 2]}`,
    }
  })
}

/** 赛程/对阵列表（可按阶段、组别过滤） */
export async function listMatches(stageId?: string, groupId?: string): Promise<Match[]> {
  if (!isSupabaseConfigured || !supabase) {
    return mockMatches
      .filter((m) => !stageId || m.stage_id === stageId)
      .filter((m) => !groupId || m.group_id === groupId)
      .map((m) => ({
        ...m,
        team_a_name: m.team_a_name ?? getTeamName(m.team_a_id),
        team_b_name: m.team_b_name ?? getTeamName(m.team_b_id),
        stage_name: m.stage_name ?? mockStages.find((s) => s.id === m.stage_id)?.name,
        group_name: m.group_name ?? getGroupName(m.group_id),
      }))
  }
  let query = supabase
    .from('matches')
    .select(
      '*, stage:stages(name), group:groups(name), team_a:teams!matches_team_a_id_fkey(name), team_b:teams!matches_team_b_id_fkey(name)',
    )
    .order('round_number')
  if (stageId) query = query.eq('stage_id', stageId)
  if (groupId) query = query.eq('group_id', groupId)
  const { data } = await query
  return ((data ?? []) as any[]).map((m) => ({
    ...m,
    stage_name: m.stage?.name,
    group_name: m.group?.name,
    team_a_name: m.team_a?.name,
    team_b_name: m.team_b?.name,
  }))
}

/** 我所在战队参与的比赛（个人中心用，按开赛时间倒序） */
export async function listMyMatches(teamIds: string[]): Promise<Match[]> {
  if (!isSupabaseConfigured || !supabase) {
    return decorate(
      mockMatches.filter(
        (m) =>
          teamIds.includes(m.team_a_id ?? '') || teamIds.includes(m.team_b_id ?? ''),
      ),
    ).sort((a, b) => (b.scheduled_at ?? '').localeCompare(a.scheduled_at ?? ''))
  }
  if (teamIds.length === 0) return []
  const ids = teamIds.join(',')
  const { data } = await supabase
    .from('matches')
    .select(
      '*, stage:stages(name), group:groups(name), team_a:teams!matches_team_a_id_fkey(name), team_b:teams!matches_team_b_id_fkey(name)',
    )
    .or(`team_a_id.in.(${ids}),team_b_id.in.(${ids})`)
    .order('scheduled_at', { ascending: false })
  return ((data ?? []) as any[]).map((m) => ({
    ...m,
    stage_name: m.stage?.name,
    group_name: m.group?.name,
    team_a_name: m.team_a?.name,
    team_b_name: m.team_b?.name,
  }))
}

/** 指定赛事（可叠加组别）下全部阶段的对阵（「全部比赛」页签用）：按阶段列表聚合查询 */
export async function listAllStageMatches(
  eventId?: string,
  groupId?: string,
): Promise<Match[]> {
  const stages = await listStages(eventId, groupId)
  const stageIds = stages.map((s) => s.id)
  if (stageIds.length === 0) return []
  if (!isSupabaseConfigured || !supabase) {
    return decorate(mockMatches.filter((m) => stageIds.includes(m.stage_id))).sort(
      (a, b) => a.round_number - b.round_number,
    )
  }
  let query = supabase
    .from('matches')
    .select(
      '*, stage:stages(name), group:groups(name), team_a:teams!matches_team_a_id_fkey(name), team_b:teams!matches_team_b_id_fkey(name)',
    )
    .in('stage_id', stageIds)
    .order('round_number')
  const { data } = await query
  return ((data ?? []) as any[]).map((m) => ({
    ...m,
    stage_name: m.stage?.name,
    group_name: m.group?.name,
    team_a_name: m.team_a?.name,
    team_b_name: m.team_b?.name,
  }))
}

/** 积分榜（可按阶段、组别过滤；三组相互独立） */
export async function getStandings(stageId?: string, groupId?: string): Promise<StandingsRow[]> {
  if (!isSupabaseConfigured || !supabase) {
    return mockStandings
      .filter((s) => !stageId || s.stage_id === stageId)
      .filter((s) => !groupId || s.group_id === groupId)
      .sort((a, b) => b.points - a.points || b.map_diff - a.map_diff)
  }
  let query = supabase.from('standings').select('*')
  if (stageId) query = query.eq('stage_id', stageId)
  if (groupId) query = query.eq('group_id', groupId)
  const { data } = await query
  return ((data ?? []) as StandingsRow[]).sort(
    (a, b) => b.points - a.points || b.map_diff - a.map_diff,
  )
}

/** 逐图比分（BO3 明细）：按比赛 ID 批量查询 match_maps */
export async function listMatchMaps(matchIds: string[]): Promise<MatchMap[]> {
  if (matchIds.length === 0) return []
  if (!isSupabaseConfigured || !supabase) {
    return mockMatchMaps.filter((m) => matchIds.includes(m.match_id))
  }
  const { data } = await supabase.from('match_maps').select('*').in('match_id', matchIds)
  return (data as MatchMap[]) ?? []
}

/** 录入的逐图比分输入（BO3 每张图） */
export interface MatchMapInput {
  map_name: string
  team_a_score: number
  team_b_score: number
}

/**
 * 提交比赛结果（管理员或参赛队队长）：总比分自动判定胜者并置为已结束；
 * BO3 可附带逐图比分（match_maps，先删后插）。
 * 真实环境走 upsert_match_result RPC（security definer，函数内校验身份）。
 */
export async function submitMatchScore(
  matchId: string,
  aScore: number,
  bScore: number,
  opts?: { map?: string | null; scheduledAt?: string | null; maps?: MatchMapInput[] },
): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase) {
    const m = mockMatches.find((x) => x.id === matchId)
    if (!m) return false
    m.team_a_score = aScore
    m.team_b_score = bScore
    m.winner_id = aScore > bScore ? m.team_a_id : bScore > aScore ? m.team_b_id : null
    m.status = 'completed'
    if (opts?.map !== undefined) m.map = opts.map || null
    if (opts?.scheduledAt !== undefined) m.scheduled_at = opts.scheduledAt || null
    if (opts?.maps && opts.maps.length) {
      for (let i = mockMatchMaps.length - 1; i >= 0; i--) {
        if (mockMatchMaps[i].match_id === matchId) mockMatchMaps.splice(i, 1)
      }
      opts.maps.forEach((mp, i) => {
        mockMatchMaps.push({
          id: `mm-${matchId}-${Date.now()}-${i}`,
          match_id: matchId,
          map_name: mp.map_name,
          team_a_score: mp.team_a_score,
          team_b_score: mp.team_b_score,
          winner_id: mp.team_a_score > mp.team_b_score ? m.team_a_id : mp.team_b_score > mp.team_a_score ? m.team_b_id : null,
        })
      })
    }
    return true
  }
  const { error } = await supabase.rpc('upsert_match_result', {
    p_match_id: matchId,
    p_team_a_score: aScore,
    p_team_b_score: bScore,
  })
  if (error) throw new Error(error.message)
  const patch: Record<string, unknown> = {}
  if (opts?.map !== undefined) patch.map = opts.map || null
  if (opts?.scheduledAt !== undefined) patch.scheduled_at = opts.scheduledAt || null
  if (Object.keys(patch).length > 0) {
    const { error: e2 } = await supabase.from('matches').update(patch).eq('id', matchId)
    if (e2) throw new Error(e2.message)
  }
  if (opts?.maps && opts.maps.length) {
    const { error: e3 } = await supabase.from('match_maps').delete().eq('match_id', matchId)
    if (e3) throw new Error(e3.message)
    const { error: e4 } = await supabase
      .from('match_maps')
      .insert(opts.maps.map((mp) => ({ match_id: matchId, ...mp })))
    if (e4) throw new Error(e4.message)
  }
  return true
}

/** 订阅赛程数据变更（比赛新增/修改/删除时通知前端刷新查看） */
export function subscribeMatchChanges(onChange: () => void): () => void {
  if (!isSupabaseConfigured || !supabase) return () => {}
  const client = supabase
  const channel = client
    .channel('matches-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, onChange)
    .subscribe()
  return () => {
    client.removeChannel(channel)
  }
}

/** 订阅积分榜实时更新（比赛结果变更时自动刷新） */
export function subscribeStandings(onUpdate: () => void): () => void {
  if (!isSupabaseConfigured || !supabase) return () => {}
  // 闭包内无法保留 null 收窄，先取出非空引用
  const client = supabase
  const channel = client
    .channel('standings-live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, onUpdate)
    .subscribe()
  return () => {
    client.removeChannel(channel)
  }
}
