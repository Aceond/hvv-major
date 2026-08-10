// 报名模块数据访问层（个人选手注册 + 战队报名）
// 流程：个人提交注册申请（完美 ID + 最近 3-5 赛季截图）→ 管理员审核通过后进入选手池 → 队长创建战队时从选手池中选择队员
// 未配置 Supabase（演示模式）时返回 mock 数据，配置密钥并执行 schema.sql 后为真实调用。
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import { mockMembers, mockPlayerStats, mockPlayers, mockStages, mockTeams } from '@/mock/data'
import type {
  ApplicationStatus,
  EmploymentStatus,
  PlayerApplication,
  PlayerItem,
  Team,
  TeamMember,
} from './types'
import { listStages } from './match'

// 演示模式下的注册申请（内存存储，页面刷新后清空；真实环境存 player_applications 表）
const demoApplications: PlayerApplication[] = []

/** 个人选手注册申请：选择报名赛事，填写选手姓名与完美 ID，自选近 3 赛季最高段位（可选），选择在职状态（在职需填驻地和工号），上传最近 3-5 个赛季的截图，提交后由管理员审核 */
export async function submitPlayerApplication(
  pwUsername: string,
  displayName: string,
  eventId: string,
  screenshots: string[],
  employment: {
    status: EmploymentStatus
    location: string | null
    employeeNo: string | null
  },
  rank?: string,
): Promise<PlayerApplication | null> {
  if (!pwUsername.trim()) {
    throw new Error('请填写完美 ID')
  }
  if (!displayName.trim()) {
    throw new Error('请填写选手姓名')
  }
  if (!eventId) {
    throw new Error('请选择报名的赛事')
  }
  if (employment.status === 'employed' && !employment.location?.trim()) {
    throw new Error('在职状态请填写驻地')
  }
  if (employment.status === 'employed' && !employment.employeeNo?.trim()) {
    throw new Error('在职状态请填写工号')
  }
  const rankVal = rank?.trim() || null
  if (!isSupabaseConfigured || !supabase) {
    const me = mockPlayers.find((p) => p.id === 'demo-player')
    const app: PlayerApplication = {
      id: `app-${Date.now()}`,
      profile_id: 'demo-player',
      event_id: eventId,
      pw_username: pwUsername,
      display_name: displayName.trim(),
      nickname: me?.nickname ?? null,
      highest_rank: rankVal,
      screenshots,
      employment_status: employment.status,
      location: employment.status === 'employed' ? employment.location?.trim() ?? null : null,
      employee_no: employment.status === 'employed' ? employment.employeeNo?.trim() ?? null : null,
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
  const { data: { user }, error: userErr } = await supabase.auth.getUser()
  if (userErr) console.warn('获取登录用户失败：', userErr.message)
  if (!user) {
    throw new Error('登录状态已失效，请重新登录后再提交')
  }
  // 截图以压缩后的 data URL 直接存入申请记录（screenshots 为 jsonb），不依赖 Storage 桶配置，保证上传稳定。
  // 注册页已先行压缩（自适应，单张 <~65KB，5 张总提交体 <~400KB，低于网络/网关拦截阈值）；后台审核与前台展示均直接读取。
  const { data, error: insertErr } = await supabase
    .from('player_applications')
    .insert({
      profile_id: user.id,
      event_id: eventId,
      pw_username: pwUsername,
      display_name: displayName.trim(),
      highest_rank: rankVal,
      screenshots,
      employment_status: employment.status,
      location: employment.status === 'employed' ? employment.location?.trim() ?? null : null,
      employee_no: employment.status === 'employed' ? employment.employeeNo?.trim() ?? null : null,
    })
    .select('*')
    .single()
  if (insertErr) {
    // 透出真实原因（多为表缺列/RLS/权限），便于定位与修复
    throw new Error(`提交失败：${insertErr.message}`)
  }
  return data as PlayerApplication | null
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

/** 全部注册申请（后台审核用，最新在前；可按赛事过滤） */
export async function listPlayerApplications(eventId?: string): Promise<PlayerApplication[]> {
  if (!isSupabaseConfigured || !supabase) {
    const list = eventId ? demoApplications.filter((a) => a.event_id === eventId) : demoApplications
    return [...list].reverse()
  }
  let query = supabase.from('player_applications').select('*')
  if (eventId) query = query.eq('event_id', eventId)
  const { data } = await query.order('created_at', { ascending: false })
  return (data as PlayerApplication[]) ?? []
}

/** 审核个人注册申请：通过后写入选手资料（完美 ID / 昵称回填，角色置为 player）进入选手池；rank 为近 3 赛季最高段位（管理员查看战绩截图后选择） */
export async function reviewPlayerApplication(id: string, status: ApplicationStatus, rank?: string) {
  const rankVal = rank?.trim() || null
  if (!isSupabaseConfigured || !supabase) {
    const app = demoApplications.find((a) => a.id === id)
    if (!app) return
    app.status = status
    app.reviewed_at = new Date().toISOString()
    if (rankVal) {
      app.highest_rank = rankVal
      const me = mockPlayers.find((p) => p.id === app.profile_id)
      if (me) me.highest_rank = rankVal
    }
    if (status === 'approved') {
      const me = mockPlayers.find((p) => p.id === app.profile_id)
      if (me) {
        me.pw_username = app.pw_username
        me.nickname = app.display_name ?? me.nickname ?? app.pw_username
      }
      // 初始化个人数据：每名选手一行全 0 统计（演示模式写内存 mock，使其直接进入个人数据/排行）
      const stages = mockStages.filter((s) => !app.event_id || s.event_id === app.event_id)
      const first = [...stages].sort((a, b) => a.sort_order - b.sort_order)[0]
      if (first && !mockPlayerStats.some((x) => x.player_id === app.profile_id)) {
        mockPlayerStats.push({
          player_id: app.profile_id,
          player_name: app.display_name ?? me?.nickname ?? app.pw_username,
          pw_username: app.pw_username,
          team_id: null,
          team_name: '未入队',
          stage_id: first.id,
          stage_name: first.name,
          group_id: first.group_id ?? null,
          group_name: null,
          we: 0, rating_pro: 0, win_rate: 0, kd: 0, matches: 0, hs_rate: 0,
          kpr: 0, dpr: 0, adr: 0,
          total_kills: 0, total_deaths: 0, total_assists: 0, fpr: 0, awp_kpr: 0,
        })
      }
    }
    return
  }
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  // 先更新申请审核状态（核心，保证审核一定生效）；管理员选定的段位一并记录到申请上
  const reviewPatch: Record<string, unknown> = {
    status,
    reviewed_at: new Date().toISOString(),
    reviewer_id: user.id,
  }
  if (rankVal) reviewPatch.highest_rank = rankVal
  const { error } = await supabase
    .from('player_applications')
    .update(reviewPatch)
    .eq('id', id)
  if (error) throw error
  // 通过时回填选手资料（完美 ID / 昵称回填）；已有 admin/caster 角色不降级，仅 player/null 置为 player 进入选手池
  if (status === 'approved') {
    const { data, error: selErr } = await supabase
      .from('player_applications')
      .select('*')
      .eq('id', id)
      .single()
    if (selErr) throw selErr
    const app = data as PlayerApplication | null
    if (app) {
      const { data: prof } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', app.profile_id)
        .maybeSingle()
      const keepRole = prof?.role === 'admin' || prof?.role === 'caster'
      const patch: Record<string, unknown> = {
        pw_username: app.pw_username,
        nickname: app.display_name ?? app.nickname ?? app.pw_username,
      }
      if (!keepRole) patch.role = 'player'
      // 段位同步记录到选手信息表（profiles）
      if (rankVal) patch.highest_rank = rankVal
      const { error: profErr } = await supabase
        .from('profiles')
        .update(patch)
        .eq('id', app.profile_id)
      if (profErr) {
        // 回填失败意味着选手不会进入选手池，必须显式报错，避免「已通过但池中查不到」
        throw new Error(
          `申请已通过，但选手资料回填失败（选手池将查不到该选手）：${profErr.message}。请确认已执行 grant update on public.profiles to authenticated 后重新审核。`,
        )
      }
      // 初始化个人数据：在其报名赛事的各阶段补全 0 值统计行，使其直接显示在「个人数据 / 个人排行」列表
      await ensurePlayerStats(app.profile_id, app.event_id)
    }
  } else if (rankVal) {
    // 拒绝时也记录段位到选手信息表（段位为客观信息，下次报名无需重新判定）
    const { data: appData } = await supabase
      .from('player_applications')
      .select('profile_id')
      .eq('id', id)
      .single()
    if (appData?.profile_id) {
      await supabase
        .from('profiles')
        .update({ highest_rank: rankVal })
        .eq('id', appData.profile_id)
    }
  }
}

/** 审核通过后初始化个人数据：为该选手在其报名赛事的首个阶段补一行全 0 统计（每名选手仅一行，已存在则跳过） */
async function ensurePlayerStats(profileId: string, eventId: string | null) {
  if (!supabase) return
  const stages = await listStages(eventId ?? undefined)
  const first = [...stages].sort((a, b) => a.sort_order - b.sort_order)[0]
  if (!first) return
  const { error } = await supabase
    .from('player_stats')
    .upsert(
      {
        profile_id: profileId,
        stage_id: first.id,
        group_id: first.group_id ?? null,
        we: 0, rating_pro: 0, win_rate: 0, kd: 0, matches: 0, hs_rate: 0,
        kpr: 0, dpr: 0, adr: 0,
        total_kills: 0, total_deaths: 0, total_assists: 0, fpr: 0, awp_kpr: 0,
      },
      { onConflict: 'profile_id', ignoreDuplicates: true },
    )
  if (error) console.warn('选手个人数据初始化失败（不影响审核结果）：', error.message)
}

/** 选手池（仅完成个人注册审核通过的选手，可按完美 ID/姓名搜索；in_team 表示已加入战队，不可再选） */
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
    .select('id, nickname, pw_username, highest_rank, team_members(team_id, status)')
    .eq('role', 'player')
    .not('pw_username', 'is', null) // 只有个人注册审核通过（回填完美 ID）的选手才进入选手池
  if (keyword) query = query.or(`pw_username.ilike.%${keyword}%,nickname.ilike.%${keyword}%`)
  const { data } = await query
  return ((data ?? []) as any[]).map((p) => {
    // 仅「正式队员」（active）视为已入队；替补可跨队，不影响正式入队判定
    const tm = (p.team_members ?? []) as Array<{ team_id: string; status: string }>
    const active = tm.filter((x) => x.status === 'active')
    return {
      id: p.id,
      nickname: p.nickname,
      pw_username: p.pw_username,
      highest_rank: p.highest_rank ?? null,
      in_team: active.length > 0,
      team_id: active[0]?.team_id ?? null,
    }
  })
}

/**
 * 创建战队并登记队长（当前用户）：按赛事报名，队员由管理员在后台为战队选择。
 * 流程：前台选择赛事并提交战队信息 → 管理员在「战队报名审核」中为战队添加队员（≥5 人）→ 通过审核。
 */
export async function createTeam(
  name: string,
  tag: string,
  eventId: string,
): Promise<Team | null> {
  if (!isSupabaseConfigured || !supabase) {
    const team: Team = {
      id: `team-${Date.now()}`,
      name,
      tag,
      captain_id: 'demo-player',
      event_id: eventId,
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
    return team
  }
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase
    .from('teams')
    .insert({ name, tag, captain_id: user.id, event_id: eventId })
    .select('*')
    .single()
  const team = data as Team | null
  if (team) {
    await supabase
      .from('team_members')
      .insert({ team_id: team.id, profile_id: user.id, is_captain: true, status: 'active', event_id: team.event_id })
  }
  return team
}

/** 管理员为战队添加成员（后台选人；role=active 正式队员 / benched 替补）。
 *  约束：同一赛事内正式队员一人一队（数据库唯一索引）；替补可跨队（不受限）。
 *  同队内重复添加或违反正式队员约束时抛错。 */
export async function addTeamMember(
  teamId: string,
  profileId: string,
  role: 'active' | 'benched' = 'active',
): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase) {
    const list = mockMembers[teamId] ?? (mockMembers[teamId] = [])
    if (list.some((m) => m.profile_id === profileId)) return false
    const p = mockPlayers.find((x) => x.id === profileId)
    list.push({
      id: `m-${Date.now()}-${profileId}`,
      team_id: teamId,
      profile_id: profileId,
      nickname: p?.nickname ?? null,
      pw_username: p?.pw_username ?? null,
      is_captain: false,
      status: role,
    })
    if (p && role === 'active') p.in_team = true
    return true
  }
  // 查战队所属赛事，随名册行冗余记录（正式队员按「赛事 + profile」唯一约束依赖此列）
  const { data: team } = await supabase
    .from('teams')
    .select('event_id')
    .eq('id', teamId)
    .maybeSingle()
  const { error } = await supabase.from('team_members').insert({
    team_id: teamId,
    profile_id: profileId,
    is_captain: false,
    status: role,
    event_id: team?.event_id ?? null,
  })
  if (error) throw new Error(error.message)
  return true
}

/** 管理员从战队移除队员（队长不可移除） */
export async function removeTeamMember(teamId: string, profileId: string): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase) {
    const list = mockMembers[teamId] ?? []
    const idx = list.findIndex((m) => m.profile_id === profileId)
    if (idx >= 0 && !list[idx].is_captain) {
      list.splice(idx, 1)
      const p = mockPlayers.find((x) => x.id === profileId)
      if (p) p.in_team = false
      return true
    }
    return false
  }
  const { error } = await supabase
    .from('team_members')
    .delete()
    .eq('team_id', teamId)
    .eq('profile_id', profileId)
  return !error
}

/** 调整名册成员角色：队长 / 队员 / 替补。队长全队唯一，设置新队长时原队长自动降为队员 */
export async function updateTeamMemberRole(
  teamId: string,
  memberId: string,
  profileId: string,
  role: 'captain' | 'member' | 'bench',
): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    const list = mockMembers[teamId] ?? []
    const m = list.find((x) => x.id === memberId)
    if (!m) return
    if (role === 'captain') {
      for (const o of list) if (o.is_captain) o.is_captain = false
      m.is_captain = true
      m.status = 'active'
      const t = mockTeams.find((x) => x.id === teamId)
      if (t) t.captain_id = profileId
    } else {
      m.is_captain = false
      m.status = role === 'bench' ? 'benched' : 'active'
    }
    return
  }
  if (role === 'captain') {
    // 该队现有队长降为队员，并同步 teams.captain_id（任一失败都必须显式报错，否则角色变了但约战权限不对应）
    const { error: downgradeErr } = await supabase
      .from('team_members')
      .update({ is_captain: false, status: 'active' })
      .eq('team_id', teamId)
      .eq('is_captain', true)
    if (downgradeErr) throw downgradeErr
    const { error: capErr } = await supabase
      .from('teams')
      .update({ captain_id: profileId })
      .eq('id', teamId)
    if (capErr) throw new Error(`战队队长同步失败：${capErr.message}`)
  }
  const patch =
    role === 'captain'
      ? { is_captain: true, status: 'active' }
      : role === 'bench'
        ? { is_captain: false, status: 'benched' }
        : { is_captain: false, status: 'active' }
  const { error } = await supabase
    .from('team_members')
    .update(patch)
    .eq('team_id', teamId)
    .eq('id', memberId)
  if (error) throw error
}

/** 管理员手动建队（数据录入页用）：直接以 approved 状态创建战队与名册 */
export async function createTeamByAdmin(input: {
  name: string
  tag: string
  eventId: string | null
  groupId: string | null
  captainId: string
  memberIds: string[]
}): Promise<Team | null> {
  if (!isSupabaseConfigured || !supabase) {
    const team: Team = {
      id: `team-${Date.now()}`,
      name: input.name,
      tag: input.tag,
      captain_id: input.captainId,
      event_id: input.eventId,
      group_id: input.groupId,
      status: 'approved',
      created_at: new Date().toISOString(),
    }
    mockTeams.push(team)
    const list = mockMembers[team.id] ?? (mockMembers[team.id] = [])
    const push = (pid: string, isCaptain: boolean) => {
      const p = mockPlayers.find((x) => x.id === pid)
      list.push({
        id: `m-${team.id}-${pid}`,
        team_id: team.id,
        profile_id: pid,
        nickname: p?.nickname ?? null,
        pw_username: p?.pw_username ?? null,
        is_captain: isCaptain,
        status: 'active',
      })
      if (p) p.in_team = true
    }
    push(input.captainId, true)
    for (const pid of input.memberIds) push(pid, false)
    return team
  }
  const { data } = await supabase
    .from('teams')
    .insert({
      name: input.name,
      tag: input.tag,
      captain_id: input.captainId,
      event_id: input.eventId,
      group_id: input.groupId,
      status: 'approved',
    })
    .select('*')
    .single()
  const team = data as Team | null
  if (team) {
    const members = [
      { team_id: team.id, profile_id: input.captainId, is_captain: true, status: 'active', event_id: team.event_id },
      ...input.memberIds.map((id) => ({
        team_id: team.id,
        profile_id: id,
        is_captain: false,
        status: 'active',
        event_id: team.event_id,
      })),
    ]
    await supabase.from('team_members').insert(members)
  }
  return team
}

/** 查询当前用户所在战队（队长或队员） */
export async function listMyTeams(): Promise<Team[]> {
  if (!isSupabaseConfigured || !supabase) {
    return mockTeams.filter((t) => t.captain_id === 'demo-player')
  }
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data } = await supabase
    .from('team_members')
    .select('team:teams(*)')
    .eq('profile_id', user.id)
  return ((data ?? []) as any[]).map((r) => r.team as Team)
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
