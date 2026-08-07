// 赛程与积分数据访问层
// 未配置 Supabase（演示模式）时返回 mock 数据。
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import {
  getGroupName,
  getTeamName,
  mockGroups,
  mockMatches,
  mockStages,
  mockStandings,
} from '@/mock/data'
import type { Group, Match, Stage, StandingsRow } from './types'

/** 组别列表（传奇组 / 大师组 / 挑战组） */
export async function listGroups(): Promise<Group[]> {
  if (!isSupabaseConfigured || !supabase) return mockGroups
  const { data } = await supabase.from('groups').select('*').order('sort_order')
  return (data as Group[]) ?? []
}

/** 阶段列表（多阶段混合赛制） */
export async function listStages(): Promise<Stage[]> {
  if (!isSupabaseConfigured || !supabase) return mockStages
  const { data } = await supabase.from('stages').select('*').order('sort_order')
  return (data as Stage[]) ?? []
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
