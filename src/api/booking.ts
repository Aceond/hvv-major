// 约战录入数据访问层（战队自己约对手、自己定时间）
// 流程：战队成员（队长/队员）登录后进入「约战录入」，选择对手与时间批量录入接下来的比赛；
//       录入结果写入 matches（status=scheduled），在赛程页公开展示。
// 未配置 Supabase（演示模式）时返回 mock 数据。
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import { mockMatches, mockTeams } from '@/mock/data'
import type { Match, Team } from './types'

/** 当前登录用户作为队长的战队（仅已审核战队；约战仅队长可录入，管理员不受限） */
export async function listMyTeam(userId?: string | null): Promise<Team | null> {
  if (!isSupabaseConfigured || !supabase) {
    if (!userId) return null
    return (
      mockTeams.find((t) => t.status === 'approved' && t.captain_id === userId) ?? null
    )
  }
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase
    .from('teams')
    .select('*')
    .eq('captain_id', user.id)
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
    .limit(1) // 同一用户被设为多支战队队长时取最新一支，避免 maybeSingle 多行报错导致无法录入
    .maybeSingle()
  return (data as Team | null) ?? null
}

/** 已审核战队列表（约战对手候选，可排除自己所在战队） */
export async function listApprovedTeams(excludeTeamId?: string | null): Promise<Team[]> {
  if (!isSupabaseConfigured || !supabase) {
    return mockTeams.filter((t) => t.status === 'approved' && t.id !== excludeTeamId)
  }
  const { data } = await supabase.from('teams').select('*').eq('status', 'approved')
  return ((data as Team[]) ?? []).filter((t) => t.id !== excludeTeamId)
}

/** 批量录入约战（本队为 team_a，对手为 team_b，写入 matches 待开赛） */
export async function createBookedMatches(
  team: Team,
  rows: Array<{ opponentId: string; scheduledAt: string; bestOf: number }>,
  stageId: string,
): Promise<Match[]> {
  if (!isSupabaseConfigured || !supabase) {
    const created: Match[] = rows.map((r, i) => ({
      id: `bk-${Date.now()}-${i}`,
      stage_id: stageId,
      group_id: team.group_id,
      round_number: 1,
      team_a_id: team.id,
      team_b_id: r.opponentId,
      best_of: r.bestOf,
      map: null,
      team_a_score: 0,
      team_b_score: 0,
      winner_id: null,
      status: 'scheduled',
      scheduled_at: r.scheduledAt,
    }))
    mockMatches.push(...created)
    return created
  }
  const { data } = await supabase
    .from('matches')
    .insert(
      rows.map((r) => ({
        stage_id: stageId,
        group_id: team.group_id,
        round_number: 1,
        team_a_id: team.id,
        team_b_id: r.opponentId,
        best_of: r.bestOf,
        status: 'scheduled',
        scheduled_at: r.scheduledAt,
      })),
    )
    .select('*')
  return ((data as Match[]) ?? []).map((m) => ({
    ...m,
    team_a_name: team.name,
    team_b_name: mockTeamName(m.team_b_id),
  }))
}

/** 本队未来已录比赛（待开赛，按时间升序） */
export async function listMyBookedMatches(teamId: string): Promise<Match[]> {
  if (!isSupabaseConfigured || !supabase) {
    const now = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    const nowStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`
    return mockMatches
      .filter(
        (m) =>
          m.status === 'scheduled' &&
          (m.team_a_id === teamId || m.team_b_id === teamId) &&
          !!m.scheduled_at &&
          m.scheduled_at >= nowStr,
      )
      .sort((a, b) => (a.scheduled_at ?? '').localeCompare(b.scheduled_at ?? ''))
  }
  const { data } = await supabase
    .from('matches')
    .select('*')
    .or(`team_a_id.eq.${teamId},team_b_id.eq.${teamId}`)
    .eq('status', 'scheduled')
    .gte('scheduled_at', new Date().toISOString())
    .order('scheduled_at')
  return (data as Match[]) ?? []
}

/** 删除约战（仅允许本队成员删除自己参与的待开赛比赛） */
export async function deleteBookedMatch(id: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    const idx = mockMatches.findIndex((m) => m.id === id)
    if (idx >= 0) mockMatches.splice(idx, 1)
    return
  }
  await supabase.from('matches').delete().eq('id', id)
}

/** 演示模式补对手战队名（真实环境由 insert 返回后前端再查） */
function mockTeamName(id: string | null): string | undefined {
  return mockTeams.find((t) => t.id === id)?.name
}
