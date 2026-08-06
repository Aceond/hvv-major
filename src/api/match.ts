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
