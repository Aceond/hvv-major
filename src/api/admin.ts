// 管理端数据访问层（所有操作受 RLS 的 admin 策略约束）
// 未配置 Supabase（演示模式）时直接读写内存中的 mock 数据。
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import { mockMatches, mockMembers, mockStages, mockTeams } from '@/mock/data'
import type { AccountItem, ApplicationStatus, Match, Stage, Team, TeamStatus } from './types'
import { listGroups, listMatches, listStages } from './match'
import { mockAutoCreatePollForMatch } from './bet'
import {
  addTeamMember,
  createTeamByAdmin,
  isValidSteamId,
  listMembers,
  listPlayerApplications,
  listPlayers,
  removeTeamMember,
  reviewPlayerApplication,
  updateTeamMemberRole,
} from './registration'

/** 演示模式下生成唯一 mock 对阵 id（避免同一毫秒批量创建导致 Date.now() 冲突、多条记录共用同一 id） */
let mockMatchSeq = 0
const mockMatchId = () => `match-${Date.now()}-${++mockMatchSeq}`

export {
  listGroups,
  listMatches,
  listStages,
  listMembers,
  listPlayers,
  addTeamMember,
  removeTeamMember,
  updateTeamMemberRole,
  listPlayerApplications,
  reviewPlayerApplication,
  createTeamByAdmin,
  isValidSteamId,
}

/** 手动修改选手 Steam64 位 ID：写入 profiles 主档；同时同步对应申请行，保证审核页展示一致 */
export async function updatePlayerSteamId(
  profileId: string,
  steamId: string | null,
  appId?: string,
) {
  const val = steamId?.trim() || null
  if (val && !isValidSteamId(val)) {
    throw new Error('Steam64 位 ID 应为 17 位数字')
  }
  if (!isSupabaseConfigured || !supabase) {
    // 演示模式：选手池 mock 不携带 steam_id，仅提示已更新（演示环境无真实鉴权）
    return
  }
  const { error: profErr } = await supabase
    .from('profiles')
    .update({ steam_id: val })
    .eq('id', profileId)
  if (profErr) throw new Error(`更新选手资料失败：${profErr.message}`)
  if (appId) {
    // 同步申请行，避免审核页刷新后展示旧值
    const { error: appErr } = await supabase
      .from('player_applications')
      .update({ steam_id: val })
      .eq('id', appId)
    if (appErr) console.warn('同步申请行 Steam64 ID 失败（不影响选手主档）：', appErr.message)
  }
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

/** 批量账号审核：一次通过 / 拒绝多个账号（只更新当前为待审核的，避免覆盖已审核结果） */
export async function reviewAccounts(ids: string[], status: ApplicationStatus) {
  if (!isSupabaseConfigured || !supabase) return
  if (ids.length === 0) return
  const { error } = await supabase
    .from('profiles')
    .update({ account_status: status })
    .eq('account_status', 'pending')
    .in('id', ids)
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

/** 释放战队全部名册（拒绝战队时调用：删除队长+队员记录，成员回到选手池可重新报名）。
 *  真实环境 RLS 允许管理员删除任意名册；演示模式清空 mock。 */
export async function releaseTeamMembers(teamId: string) {
  if (!isSupabaseConfigured || !supabase) {
    delete mockMembers[teamId]
    return
  }
  const { error } = await supabase.from('team_members').delete().eq('team_id', teamId)
  if (error) throw error
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
      final_best_of: stage.final_best_of ?? 3,
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
  const { error } = await supabase.from('stages').update(partial).eq('id', id)
  if (error) throw new Error(error.message)
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

/** 清空阶段下的全部对阵（保留阶段本身；match_maps / 队员统计 / 竞猜关联等随对阵级联处理，可安全重复执行） */
export async function clearStageMatches(stageId: string) {
  if (!isSupabaseConfigured || !supabase) {
    for (let i = mockMatches.length - 1; i >= 0; i--) {
      if (mockMatches[i].stage_id === stageId) mockMatches.splice(i, 1)
    }
    return
  }
  const { error } = await supabase.from('matches').delete().eq('stage_id', stageId)
  if (error) throw error
}

/** 创建对阵（可指定组别 / 淘汰赛赛组；同轮次内自动按创建顺序编号，保证对阵图半区与创建顺序一致） */
export async function createMatch(m: Partial<Match>) {
  if (!isSupabaseConfigured || !supabase) {
    const existing = mockMatches.filter(
      (x) => x.stage_id === m.stage_id && x.round_number === (m.round_number ?? 1),
    )
    const sortOrder =
      existing.reduce((max, x) => Math.max(max, x.sort_order ?? 0), -1) + 1
    const id = mockMatchId()
    const matchRow: Match = {
      id,
      stage_id: m.stage_id ?? '',
      group_id: m.group_id ?? null,
      round_number: m.round_number ?? 1,
      bracket: m.bracket ?? 'wb',
      sort_order: sortOrder,
      team_a_id: m.team_a_id ?? null,
      team_b_id: m.team_b_id ?? null,
      best_of: m.best_of ?? 1,
      map: m.map ?? null,
      team_a_score: 0,
      team_b_score: 0,
      winner_id: null,
      status: 'scheduled',
      scheduled_at: m.scheduled_at ?? null,
    }
    mockMatches.push(matchRow)
    mockAutoCreatePollForMatch(matchRow)
    return
  }
  // 计算该阶段同轮次内下一个顺序位，保证创建顺序即对阵图槽位顺序
  const { data: existing } = await supabase
    .from('matches')
    .select('sort_order')
    .eq('stage_id', m.stage_id)
    .eq('round_number', m.round_number ?? 1)
    .order('sort_order', { ascending: false })
    .limit(1)
  const sortOrder = ((existing?.[0]?.sort_order as number | undefined) ?? -1) + 1
  await supabase.from('matches').insert({ ...m, sort_order: sortOrder })
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

/** 更新对阵基础字段（如轮次） */
export async function updateMatch(id: string, partial: Partial<Match>) {
  if (!isSupabaseConfigured || !supabase) {
    const m = mockMatches.find((x) => x.id === id)
    if (m) Object.assign(m, partial)
    return
  }
  const { error } = await supabase.from('matches').update(partial).eq('id', id)
  if (error) throw new Error(error.message)
}
