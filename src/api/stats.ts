// 数据排行访问层（队伍排行 + 个人排行）
// 数据来源：管理员在后台手动录入（比赛结果录入后也可人工维护统计数据）。
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import { mockPlayerStats, mockTeamStats } from '@/mock/data'
import type { PlayerStatRow, TeamStatRow } from './types'

/** 队伍数据排行（可按组别、阶段筛选；stageId 为空 = 总阶段汇总） */
export async function getTeamStats(groupId?: string, stageId?: string): Promise<TeamStatRow[]> {
  if (!isSupabaseConfigured || !supabase) {
    return mockTeamStats
      .filter((s) => !groupId || s.group_id === groupId)
      .filter((s) => !stageId || s.stage_id === stageId)
      .sort((a, b) => b.win_rate - a.win_rate || b.kd - a.kd)
  }
  let query = supabase
    .from('team_stats')
    .select('*, team:teams(name, tag), group:groups(name), stage:stages(name)')
  if (groupId) query = query.eq('group_id', groupId)
  if (stageId) query = query.eq('stage_id', stageId)
  const { data } = await query
  return ((data ?? []) as any[]).map((s) => ({
    ...s,
    team_name: s.team?.name ?? null,
    tag: s.team?.tag ?? null,
    group_name: s.group?.name ?? null,
    stage_name: s.stage?.name ?? null,
  })).sort((a, b) => b.win_rate - a.win_rate || b.kd - a.kd)
}

/** 个人数据排行（可按组别、阶段筛选；stageId 为空 = 总阶段汇总） */
export async function getPlayerStats(groupId?: string, stageId?: string): Promise<PlayerStatRow[]> {
  if (!isSupabaseConfigured || !supabase) {
    return mockPlayerStats
      .filter((s) => !groupId || s.group_id === groupId)
      .filter((s) => !stageId || s.stage_id === stageId)
      .sort((a, b) => b.rating_pro - a.rating_pro)
  }
  let query = supabase
    .from('player_stats')
    .select('*, player:profiles(nickname, pw_username), team:teams(name), group:groups(name), stage:stages(name)')
  if (groupId) query = query.eq('group_id', groupId)
  if (stageId) query = query.eq('stage_id', stageId)
  const { data } = await query
  return ((data ?? []) as any[]).map((s) => ({
    ...s,
    player_name: s.player?.nickname ?? s.player?.pw_username ?? null,
    team_name: s.team?.name ?? null,
    group_name: s.group?.name ?? null,
    stage_name: s.stage?.name ?? null,
  })).sort((a, b) => b.rating_pro - a.rating_pro)
}

/** 保存/更新队伍统计数据（按 team_id + stage_id 覆盖） */
export async function saveTeamStat(row: TeamStatRow) {
  if (!isSupabaseConfigured || !supabase) {
    const i = mockTeamStats.findIndex(
      (x) => x.team_id === row.team_id && x.stage_id === row.stage_id,
    )
    if (i >= 0) Object.assign(mockTeamStats[i], row)
    else mockTeamStats.push(row)
    return
  }
  await supabase
    .from('team_stats')
    .upsert(
      {
        team_id: row.team_id,
        stage_id: row.stage_id,
        group_id: row.group_id,
        win_rate: row.win_rate,
        kd: row.kd,
        matches: row.matches,
        hs_rate: row.hs_rate,
        pistol_win_rate: row.pistol_win_rate,
        first_five_win_rate: row.first_five_win_rate,
        total_kills: row.total_kills,
        total_deaths: row.total_deaths,
        total_assists: row.total_assists,
      },
      { onConflict: 'team_id,stage_id' },
    )
}

/** 实时净胜分（小分=净胜局）：根据已完成的比赛比分，逐场累加每队的净胜局 */
export async function getTeamNetPoints(groupId?: string, stageId?: string): Promise<Record<string, number>> {
  if (!isSupabaseConfigured || !supabase) return {}
  let query = supabase
    .from('matches')
    .select('team_a_id, team_b_id, team_a_score, team_b_score, status, group_id, stage_id')
  if (groupId) query = query.eq('group_id', groupId)
  if (stageId) query = query.eq('stage_id', stageId)
  const { data } = await query
  const net: Record<string, number> = {}
  for (const m of (data ?? []) as any[]) {
    if (m.status !== 'completed' || !m.team_a_id || !m.team_b_id) continue
    net[m.team_a_id] = (net[m.team_a_id] ?? 0) + (m.team_a_score - m.team_b_score)
    net[m.team_b_id] = (net[m.team_b_id] ?? 0) + (m.team_b_score - m.team_a_score)
  }
  return net
}

/** 保存/更新个人统计数据（按 player_id + stage_id 覆盖） */
export async function savePlayerStat(row: PlayerStatRow) {
  if (!isSupabaseConfigured || !supabase) {
    const i = mockPlayerStats.findIndex(
      (x) => x.player_id === row.player_id && x.stage_id === row.stage_id,
    )
    if (i >= 0) Object.assign(mockPlayerStats[i], row)
    else mockPlayerStats.push(row)
    return
  }
  await supabase
    .from('player_stats')
    .upsert(
      {
        profile_id: row.player_id,
        team_id: row.team_id,
        stage_id: row.stage_id,
        group_id: row.group_id,
        we: row.we,
        rating_pro: row.rating_pro,
        win_rate: row.win_rate,
        kd: row.kd,
        matches: row.matches,
        hs_rate: row.hs_rate,
        kpr: row.kpr,
        dpr: row.dpr,
        adr: row.adr,
        total_kills: row.total_kills,
        total_deaths: row.total_deaths,
        total_assists: row.total_assists,
        fpr: row.fpr,
        awp_kpr: row.awp_kpr,
      },
      { onConflict: 'profile_id,stage_id' },
    )
}
