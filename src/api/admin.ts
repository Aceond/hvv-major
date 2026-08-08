// 管理端数据访问层（所有操作受 RLS 的 admin 策略约束）
// 未配置 Supabase（演示模式）时直接读写内存中的 mock 数据。
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import { mockMatches, mockStages, mockTeams } from '@/mock/data'
import type { AccountItem, ApplicationStatus, Match, Stage, Team, TeamStatus } from './types'
import { listGroups, listMatches, listStages } from './match'
import {
  addTeamMember,
  createTeamByAdmin,
  listMembers,
  listPlayerApplications,
  listPlayers,
  removeTeamMember,
  reviewPlayerApplication,
} from './registration'

export {
  listGroups,
  listMatches,
  listStages,
  listMembers,
  listPlayers,
  addTeamMember,
  removeTeamMember,
  listPlayerApplications,
  reviewPlayerApplication,
  createTeamByAdmin,
}

/** 账号列表（账号审核用）：展示用户名/邮箱/角色/审核状态/注册时间 */
export async function listAccounts(): Promise<AccountItem[]> {
  if (!isSupabaseConfigured || !supabase) return []
  const { data } = await supabase
    .from('profiles')
    .select('id, username, email, role, account_status, created_at')
    .order('created_at', { ascending: false })
  return (data as AccountItem[]) ?? []
}

/** 账号审核：通过 / 拒绝（更新 profiles.account_status，RLS 允许管理员更新） */
export async function reviewAccount(id: string, status: ApplicationStatus) {
  if (!isSupabaseConfigured || !supabase) return
  const { error } = await supabase.from('profiles').update({ account_status: status }).eq('id', id)
  if (error) throw error
}

/** 设置账号角色（管理员把用户设为解说 / 选手等；RLS 限制普通用户不可改 role） */
export async function setAccountRole(id: string, role: 'caster' | 'player') {
  if (!isSupabaseConfigured || !supabase) return
  const { error } = await supabase.from('profiles').update({ role }).eq('id', id)
  if (error) throw error
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

/** 创建阶段（按赛事配置赛程：阶段属于某届赛事） */
export async function createStage(stage: Partial<Stage>) {
  if (!isSupabaseConfigured || !supabase) {
    mockStages.push({
      id: `stage-${Date.now()}`,
      event_id: stage.event_id ?? null,
      group_id: stage.group_id ?? null,
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

/** 更新阶段（名称 / 赛制 / 状态 / 时间 / 排序等） */
export async function updateStage(id: string, partial: Partial<Stage>) {
  if (!isSupabaseConfigured || !supabase) {
    const s = mockStages.find((x) => x.id === id)
    if (s) Object.assign(s, partial)
    return
  }
  await supabase.from('stages').update(partial).eq('id', id)
}

/** 删除阶段（其下对阵一并级联删除） */
export async function deleteStage(id: string) {
  if (!isSupabaseConfigured || !supabase) {
    const idx = mockStages.findIndex((x) => x.id === id)
    if (idx >= 0) mockStages.splice(idx, 1)
    return
  }
  await supabase.from('stages').delete().eq('id', id)
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

/** 录入/更新比赛结果（真实环境走数据库函数自动判定胜者，并同步地图/时间） */
export async function updateMatchResult(
  matchId: string,
  aScore: number,
  bScore: number,
  map?: string | null,
  scheduledAt?: string | null,
) {
  if (!isSupabaseConfigured || !supabase) {
    const m = mockMatches.find((x) => x.id === matchId)
    if (m) {
      m.team_a_score = aScore
      m.team_b_score = bScore
      m.winner_id = aScore > bScore ? m.team_a_id : bScore > aScore ? m.team_b_id : null
      m.status = 'completed'
      if (map !== undefined) m.map = map
      if (scheduledAt !== undefined) m.scheduled_at = scheduledAt
    }
    return
  }
  await supabase.rpc('upsert_match_result', {
    p_match_id: matchId,
    p_team_a_score: aScore,
    p_team_b_score: bScore,
  })
  // 地图 / 时间有改动时单独更新（matches_admin_all 策略允许管理员更新）
  if (map !== undefined || scheduledAt !== undefined) {
    const patch: Record<string, unknown> = {}
    if (map !== undefined) patch.map = map || null
    if (scheduledAt !== undefined) patch.scheduled_at = scheduledAt || null
    await supabase.from('matches').update(patch).eq('id', matchId)
  }
}
