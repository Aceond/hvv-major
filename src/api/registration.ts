// 报名模块数据访问层（个人选手注册 + 战队报名）
// 流程：个人提交注册申请（完美 ID + 最近 3-5 赛季截图）→ 管理员审核通过后进入选手池 → 队长创建战队时从选手池中选择队员
// 未配置 Supabase（演示模式）时返回 mock 数据，配置密钥并执行 schema.sql 后为真实调用。
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import { mockMembers, mockPlayers, mockTeams } from '@/mock/data'
import type { ApplicationStatus, PlayerApplication, PlayerItem, Team, TeamMember } from './types'

// 演示模式下的注册申请（内存存储，页面刷新后清空；真实环境存 player_applications 表）
const demoApplications: PlayerApplication[] = []

/** 完美 ID 校验：完美对战平台用户名（2-24 位字母/数字/下划线） */
const PW_RE = /^[a-zA-Z0-9_]{2,24}$/

function dataUrlToArrayBuffer(dataUrl: string): ArrayBuffer {
  const base64 = dataUrl.split(',')[1] ?? ''
  const bin = atob(base64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes.buffer
}

/** 个人选手注册申请：填写完美 ID 并上传最近 3-5 个赛季的截图，提交后由管理员审核 */
export async function submitPlayerApplication(
  pwUsername: string,
  screenshots: string[],
): Promise<PlayerApplication | null> {
  if (!PW_RE.test(pwUsername)) {
    throw new Error('完美 ID 需为 2-24 位字母、数字或下划线')
  }
  if (!isSupabaseConfigured || !supabase) {
    const me = mockPlayers.find((p) => p.id === 'demo-player')
    const app: PlayerApplication = {
      id: `app-${Date.now()}`,
      profile_id: 'demo-player',
      pw_username: pwUsername,
      nickname: me?.nickname ?? null,
      screenshots,
      status: 'pending',
      review_note: null,
      created_at: new Date().toISOString(),
      reviewed_at: null,
    }
    // 同人重复提交时替换旧的待审申请
    const idx = demoApplications.findIndex(
      (a) => a.profile_id === 'demo-player' && a.status === 'pending',
    )
    if (idx >= 0) demoApplications.splice(idx, 1, app)
    else demoApplications.push(app)
    return app
  }
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  // 截图上传到 Storage（player-screenshots 桶），失败的单张跳过
  const urls: string[] = []
  for (let i = 0; i < screenshots.length; i++) {
    const path = `${user.id}/${Date.now()}-${i}.png`
    const { error } = await supabase.storage
      .from('player-screenshots')
      .upload(path, dataUrlToArrayBuffer(screenshots[i]), { contentType: 'image/png' })
    if (!error) {
      urls.push(supabase.storage.from('player-screenshots').getPublicUrl(path).data.publicUrl)
    }
  }
  const { data } = await supabase
    .from('player_applications')
    .insert({ profile_id: user.id, pw_username: pwUsername, screenshots: urls })
    .select('*')
    .single()
  return (data as PlayerApplication) ?? null
}

/** 查询当前登录用户的注册申请（最新一条） */
export async function listMyPlayerApplication(): Promise<PlayerApplication | null> {
  if (!isSupabaseConfigured || !supabase) {
    return [...demoApplications].reverse().find((a) => a.profile_id === 'demo-player') ?? null
  }
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase
    .from('player_applications')
    .select('*')
    .eq('profile_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data as PlayerApplication) ?? null
}

/** 全部注册申请（后台审核用，最新在前） */
export async function listPlayerApplications(): Promise<PlayerApplication[]> {
  if (!isSupabaseConfigured || !supabase) return [...demoApplications].reverse()
  const { data } = await supabase
    .from('player_applications')
    .select('*')
    .order('created_at', { ascending: false })
  return (data as PlayerApplication[]) ?? []
}

/** 审核个人注册申请：通过后写入选手资料（完美 ID / 昵称回填，角色置为 player）进入选手池 */
export async function reviewPlayerApplication(id: string, status: ApplicationStatus) {
  if (!isSupabaseConfigured || !supabase) {
    const app = demoApplications.find((a) => a.id === id)
    if (!app) return
    app.status = status
    app.reviewed_at = new Date().toISOString()
    if (status === 'approved') {
      const me = mockPlayers.find((p) => p.id === app.profile_id)
      if (me) {
        me.pw_username = app.pw_username
        me.nickname = app.nickname ?? app.pw_username
      }
    }
    return
  }
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  if (status === 'approved') {
    const { data } = await supabase
      .from('player_applications')
      .select('*')
      .eq('id', id)
      .single()
    const app = data as PlayerApplication | null
    if (app) {
      await supabase
        .from('profiles')
        .update({ pw_username: app.pw_username, nickname: app.nickname ?? app.pw_username, role: 'player' })
        .eq('id', app.profile_id)
    }
  }
  await supabase
    .from('player_applications')
    .update({ status, reviewed_at: new Date().toISOString(), reviewer_id: user.id })
    .eq('id', id)
}

/** 注册选手池（可按完美 ID/昵称搜索；in_team 表示已加入战队，不可再选） */
export async function listPlayers(keyword?: string): Promise<PlayerItem[]> {
  if (!isSupabaseConfigured || !supabase) {
    const kw = (keyword ?? '').trim().toLowerCase()
    return mockPlayers.filter(
      (p) =>
        !kw ||
        (p.pw_username ?? '').toLowerCase().includes(kw) ||
        (p.nickname ?? '').toLowerCase().includes(kw),
    )
  }
  let query = supabase
    .from('profiles')
    .select('id, nickname, pw_username, team_members(team_id)')
    .eq('role', 'player')
  if (keyword) query = query.or(`pw_username.ilike.%${keyword}%,nickname.ilike.%${keyword}%`)
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
