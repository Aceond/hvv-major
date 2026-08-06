// 报名模块数据访问层（个人选手注册 + 战队报名）
// 流程：个人先注册选手信息 → 队长创建战队时从选手池中选择队员
// 未配置 Supabase（演示模式）时返回 mock 数据，配置密钥并执行 schema.sql 后为真实调用。
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import { mockMembers, mockPlayers, mockTeams } from '@/mock/data'
import type { PlayerItem, Team, TeamMember } from './types'

/** 个人选手注册：填写游戏昵称与完美 ID（完美对战平台的用户名） */
export async function updateMyPlayerInfo(nickname: string, pwUsername: string) {
  if (!isSupabaseConfigured || !supabase) {
    const me = mockPlayers.find((p) => p.id === 'demo-player')
    if (me) {
      me.nickname = nickname
      me.pw_username = pwUsername
    }
    return
  }
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  await supabase.from('profiles').update({ nickname, pw_username: pwUsername }).eq('id', user.id)
}

/** 注册选手池（可按昵称搜索；in_team 表示已加入战队，不可再选） */
export async function listPlayers(keyword?: string): Promise<PlayerItem[]> {
  if (!isSupabaseConfigured || !supabase) {
    const kw = (keyword ?? '').trim().toLowerCase()
    return mockPlayers.filter(
      (p) => !kw || (p.nickname ?? '').toLowerCase().includes(kw),
    )
  }
  let query = supabase
    .from('profiles')
    .select('id, nickname, pw_username, team_members(team_id)')
    .eq('role', 'player')
  if (keyword) query = query.ilike('nickname', `%${keyword}%`)
  const { data } = await query
  return ((data ?? []) as any[]).map((p) => ({
    id: p.id,
    nickname: p.nickname,
    pw_username: p.pw_username,
    in_team: (p.team_members?.length ?? 0) > 0,
  }))
}

/**
 * 创建战队并加入成员：队长（当前用户）自动入队，
 * 其余成员从注册选手池中选择。
 */
export async function createTeam(
  name: string,
  tag: string,
  memberProfileIds: string[],
): Promise<Team | null> {
  if (!isSupabaseConfigured || !supabase) {
    const team: Team = {
      id: `team-${Date.now()}`,
      name,
      tag,
      captain_id: 'demo-player',
      group_id: null, // 组别由管理员审核时分配
      status: 'pending',
      created_at: new Date().toISOString(),
    }
    mockTeams.push(team)
    const list = mockMembers[team.id] ?? (mockMembers[team.id] = [])
    const captain = mockPlayers.find((p) => p.id === 'demo-player')
    list.push({
      id: `m-${Date.now()}-captain`,
      team_id: team.id,
      profile_id: 'demo-player',
      nickname: captain?.nickname ?? '炎龙',
      pw_username: captain?.pw_username ?? null,
      is_captain: true,
      status: 'active',
    })
    for (const pid of memberProfileIds) {
      const p = mockPlayers.find((x) => x.id === pid)
      list.push({
        id: `m-${Date.now()}-${pid}`,
        team_id: team.id,
        profile_id: pid,
        nickname: p?.nickname ?? null,
        pw_username: p?.pw_username ?? null,
        is_captain: false,
        status: 'active',
      })
      if (p) p.in_team = true
    }
    return team
  }
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase
    .from('teams')
    .insert({ name, tag, captain_id: user.id })
    .select('*')
    .single()
  const team = data as Team | null
  if (team) {
    const members = [
      { team_id: team.id, profile_id: user.id, is_captain: true },
      ...memberProfileIds.map((id) => ({ team_id: team.id, profile_id: id, is_captain: false })),
    ]
    await supabase.from('team_members').insert(members)
  }
  return team
}

/** 查询当前用户所在战队 */
export async function listMyTeams(): Promise<Team[]> {
  if (!isSupabaseConfigured || !supabase) {
    return mockTeams.filter((t) => t.captain_id === 'demo-player')
  }
  // TODO: 关联 team_members 后按 captain_id / member 过滤
  const { data } = await supabase.from('teams').select('*')
  return (data as Team[]) ?? []
}

/** 查询战队名册（昵称/完美 ID 来自选手资料） */
export async function listMembers(teamId: string): Promise<TeamMember[]> {
  if (!isSupabaseConfigured || !supabase) {
    return mockMembers[teamId] ?? []
  }
  const { data } = await supabase
    .from('team_members')
    .select('*, profile:profiles(nickname, pw_username)')
    .eq('team_id', teamId)
  return ((data ?? []) as any[]).map((m) => ({
    id: m.id,
    team_id: m.team_id,
    profile_id: m.profile_id,
    nickname: m.profile?.nickname ?? null,
    pw_username: m.profile?.pw_username ?? null,
    is_captain: m.is_captain,
    status: m.status,
  }))
}
