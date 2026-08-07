// 管理端数据访问层（所有操作受 RLS 的 admin 策略约束）
// 未配置 Supabase（演示模式）时直接读写内存中的 mock 数据。
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import { mockMatches, mockStages, mockTeams } from '@/mock/data'
import type { Match, Stage, Team, TeamStatus } from './types'
import { listGroups, listMatches, listStages } from './match'
import {
  createTeamByAdmin,
  listMembers,
  listPlayerApplications,
  reviewPlayerApplication,
} from './registration'

export {
  listGroups,
  listMatches,
  listStages,
  listMembers,
  listPlayerApplications,
  reviewPlayerApplication,
  createTeamByAdmin,
}

/** 战队列表 */
export async function listTeams(): Promise<Team[]> {
  if (!isSupabaseConfigured || !supabase) return mockTeams
  const { data } = await supabase.from('teams').select('*').order('created_at')
  return (data as Team[]) ?? []
}

/** 更新战队审核状态 */
export async function updateTeamStatus(id: string, status: TeamStatus) {
  if (!isSupabaseConfigured || !supabase) {
    const t = mockTeams.find((x) => x.id === id)
    if (t) t.status = status
    return
  }
  await supabase.from('teams').update({ status }).eq('id', id)
}

/** 调整战队所属组别（传奇组 / 大师组 / 挑战组） */
export async function updateTeamGroup(id: string, groupId: string | null) {
  if (!isSupabaseConfigured || !supabase) {
    const t = mockTeams.find((x) => x.id === id)
    if (t) t.group_id = groupId
    return
  }
  await supabase.from('teams').update({ group_id: groupId }).eq('id', id)
}

/** 创建阶段 */
export async function createStage(stage: Partial<Stage>) {
  if (!isSupabaseConfigured || !supabase) {
    mockStages.push({
      id: `stage-${Date.now()}`,
      name: stage.name ?? '未命名阶段',
      format: stage.format ?? 'round_robin',
      status: stage.status ?? 'upcoming',
      sort_order: stage.sort_order ?? mockStages.length + 1,
      start_at: stage.start_at ?? null,
      end_at: stage.end_at ?? null,
    })
    return
  }
  await supabase.from('stages').insert(stage)
}

/** 创建对阵（可指定组别） */
export async function createMatch(m: Partial<Match>) {
  if (!isSupabaseConfigured || !supabase) {
    mockMatches.push({
      id: `match-${Date.now()}`,
      stage_id: m.stage_id ?? '',
      group_id: m.group_id ?? null,
      round_number: m.round_number ?? 1,
      team_a_id: m.team_a_id ?? null,
      team_b_id: m.team_b_id ?? null,
      best_of: m.best_of ?? 1,
      map: m.map ?? null,
      team_a_score: 0,
      team_b_score: 0,
      winner_id: null,
      status: 'scheduled',
      scheduled_at: m.scheduled_at ?? null,
    })
    return
  }
  await supabase.from('matches').insert(m)
}

/** 录入/更新比赛结果（真实环境走数据库函数自动判定胜者） */
export async function updateMatchResult(matchId: string, aScore: number, bScore: number) {
  if (!isSupabaseConfigured || !supabase) {
    const m = mockMatches.find((x) => x.id === matchId)
    if (m) {
      m.team_a_score = aScore
      m.team_b_score = bScore
      m.winner_id = aScore > bScore ? m.team_a_id : bScore > aScore ? m.team_b_id : null
      m.status = 'completed'
    }
    return
  }
  await supabase.rpc('upsert_match_result', {
    p_match_id: matchId,
    p_team_a_score: aScore,
    p_team_b_score: bScore,
  })
}
