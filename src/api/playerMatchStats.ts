// 比赛队员数据访问层（比分录入入口按场次登记：击杀/死亡/助攻/爆头/首杀/多杀/残局/伤害/局数/WE/Rating）
// 个人数据排行页据此自动聚合：场均 = 总量 / 地图数（map_count 合计），爆头率 = Σ爆头/Σ击杀，
// ADR = Σ伤害/Σ局数，WE/Rating 场均 = Σ/场次数。
// 未配置 Supabase（演示模式）时使用 mock 数据。
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import { mockMembers, mockMatchPlayerStats, mockTeams } from '@/mock/data'
import type { MatchPlayerStat, MatchPlayerStatInput, TeamMember } from './types'

/** 自动匹配一场比赛双方的正式队员（active；替补不参与统计），附带昵称 / 完美 ID */
export async function listMatchPlayers(
  teamAId: string | null,
  teamBId: string | null,
): Promise<TeamMember[]> {
  if (!isSupabaseConfigured || !supabase) {
    const ids = [teamAId, teamBId].filter((x): x is string => !!x)
    return ids.flatMap((tid) => (mockMembers[tid] ?? []).filter((m) => m.status === 'active'))
  }
  if (!teamAId && !teamBId) return []
  let query = supabase
    .from('team_members')
    .select('*, player:profiles(nickname, pw_username)')
    .eq('status', 'active')
  if (teamAId && teamBId) {
    query = query.in('team_id', [teamAId, teamBId])
  } else {
    query = query.eq('team_id', teamAId ?? teamBId)
  }
  const { data } = await query
  return ((data ?? []) as any[]).map((m) => ({
    ...m,
    nickname: m.player?.nickname ?? null,
    pw_username: m.player?.pw_username ?? null,
  }))
}

/** 某场比赛已录入的队员数据（含队员昵称/完美 ID/战队名） */
export async function listMatchPlayerStats(matchId: string): Promise<MatchPlayerStat[]> {
  if (!isSupabaseConfigured || !supabase) {
    return mockMatchPlayerStats.filter((s) => s.match_id === matchId)
  }
  const { data } = await supabase
    .from('match_player_stats')
    .select(
      '*, player:profiles(nickname, pw_username), team:teams(name)',
    )
    .eq('match_id', matchId)
  return ((data ?? []) as any[]).map((s) => ({
    ...s,
    player_name: s.player?.nickname ?? s.player?.pw_username ?? null,
    pw_username: s.player?.pw_username ?? null,
    team_name: s.team?.name ?? null,
  }))
}

/** 保存本场队员数据：按 match_id + player_id 覆盖（先删旧，再插入） */
export async function saveMatchPlayerStats(
  matchId: string,
  rows: MatchPlayerStatInput[],
): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase) {
    for (let i = mockMatchPlayerStats.length - 1; i >= 0; i--) {
      if (mockMatchPlayerStats[i].match_id === matchId) mockMatchPlayerStats.splice(i, 1)
    }
    for (const r of rows) {
      const teamName = mockTeams.find((t) => t.id === r.team_id)?.name ?? null
      mockMatchPlayerStats.push({
        id: `mps-${matchId}-${r.player_id}-${Date.now()}`,
        match_id: matchId,
        player_id: r.player_id,
        team_id: r.team_id,
        map_count: r.map_count,
        kills: r.kills, deaths: r.deaths, assists: r.assists, headshots: r.headshots,
        first_kills: r.first_kills, multi_kills: r.multi_kills, clutches: r.clutches,
        damage: r.damage, rounds: r.rounds,
        we: r.we, rating: r.rating,
        created_at: new Date().toISOString(),
        team_name: teamName,
      })
    }
    return true
  }
  // 事务性保存：删旧 → 插新（RLS 允许管理员/参赛队队长操作）
  const { error: delErr } = await supabase
    .from('match_player_stats')
    .delete()
    .eq('match_id', matchId)
  if (delErr) throw new Error(delErr.message)
  if (rows.length > 0) {
    const { error: insErr } = await supabase.from('match_player_stats').insert(
      rows.map((r) => ({ match_id: matchId, ...r })),
    )
    if (insErr) throw new Error(insErr.message)
  }
  return true
}
