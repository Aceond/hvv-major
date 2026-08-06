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
  let query = supabase.from('team_stats').select('*')
  if (groupId) query = query.eq('group_id', groupId)
  if (stageId) query = query.eq('stage_id', stageId)
  const { data } = await query
  return ((data ?? []) as TeamStatRow[]).sort(
    (a, b) => b.win_rate - a.win_rate || b.kd - a.kd,
  )
}

/** 个人数据排行（可按组别、阶段筛选；stageId 为空 = 总阶段汇总） */
export async function getPlayerStats(groupId?: string, stageId?: string): Promise<PlayerStatRow[]> {
  if (!isSupabaseConfigured || !supabase) {
    return mockPlayerStats
      .filter((s) => !groupId || s.group_id === groupId)
      .filter((s) => !stageId || s.stage_id === stageId)
      .sort((a, b) => b.rating_pro - a.rating_pro)
  }
  let query = supabase.from('player_stats').select('*')
  if (groupId) query = query.eq('group_id', groupId)
  if (stageId) query = query.eq('stage_id', stageId)
  const { data } = await query
  return ((data ?? []) as PlayerStatRow[]).sort(
    (a, b) => b.rating_pro - a.rating_pro,
  )
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
        avg_kills: row.avg_kills,
        avg_deaths: row.avg_deaths,
        avg_assists: row.avg_assists,
        total_kills: row.total_kills,
        total_deaths: row.total_deaths,
        total_assists: row.total_assists,
      },
      { onConflict: 'team_id,stage_id' },
    )
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
