// 数据排行访问层（队伍排行 + 个人排行）
// 数据来源：管理员在后台手动录入（比赛结果录入后也可人工维护统计数据）。
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import {
  groupNames,
  mockMatchPlayerStats,
  mockMatches,
  mockPlayerStats,
  mockStages,
  mockTeamStats,
  mockTeams,
} from '@/mock/data'
import type { PlayerStatRow, TeamStatRow } from './types'
import { listGroups, listStages } from './match'

/** 四舍五入到 2 位小数（0 值直接返回 0，避免 -0） */
function r2(v: number): number {
  if (!isFinite(v) || v === 0) return 0
  return Math.round(v * 100) / 100
}

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
    .select('*, player:profiles(nickname, pw_username), team:teams(name), group:groups(name), stage:stages(name, group_id)')
  if (groupId) query = query.eq('group_id', groupId)
  if (stageId) query = query.eq('stage_id', stageId)
  const { data } = await query
  return ((data ?? []) as any[]).map((s) => ({
    ...s,
    player_name: s.player?.nickname ?? s.player?.pw_username ?? null,
    pw_username: s.player?.pw_username ?? null,
    team_name: s.team?.name ?? null,
    group_name: s.group?.name ?? null,
    stage_name: s.stage?.name ?? null,
    stage_group_id: s.stage?.group_id ?? null,
  })).sort((a, b) => b.rating_pro - a.rating_pro)
}

/** 某赛事下所有选手的个人统计数据（个人中心五维图用）。
 *  与「数据录入 / 个人排行」读取的是同一张 player_stats，审核通过自动初始化、保存即更新，天然同步。 */
export async function getPlayerStatsByEvent(eventId: string): Promise<PlayerStatRow[]> {
  if (!isSupabaseConfigured || !supabase) {
    return mockPlayerStats
  }
  // 选手统计通过 stage_id 关联到所属赛事（每名选手一行，stage 指向该赛事下的阶段）
  const stages = await listStages(eventId)
  const stageIds = stages.map((s) => s.id)
  if (stageIds.length === 0) return []
  let query = supabase
    .from('player_stats')
    .select('*, player:profiles(nickname, pw_username), team:teams(name), group:groups(name), stage:stages(name, group_id)')
    .in('stage_id', stageIds)
  const { data } = await query
  return ((data ?? []) as any[]).map((s) => ({
    ...s,
    player_name: s.player?.nickname ?? s.player?.pw_username ?? null,
    pw_username: s.player?.pw_username ?? null,
    team_name: s.team?.name ?? null,
    group_name: s.group?.name ?? null,
    stage_name: s.stage?.name ?? null,
    stage_group_id: s.stage?.group_id ?? null,
  }))
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

/**
 * 实时胜负统计（比赛数 / 胜场 / 胜率）：按已完成比赛比分判定胜负逐场统计每队。
 * 胜率 = 胜场 / 总场次，录完比分自动更新，不再依赖手动录入的 team_stats。
 */
export async function getTeamWinStats(
  groupId?: string,
  stageId?: string,
): Promise<Record<string, { played: number; wins: number; win_rate: number }>> {
  const rows = [] as Array<{ team_a_id: string | null; team_b_id: string | null; team_a_score: number; team_b_score: number }>
  if (!isSupabaseConfigured || !supabase) {
    for (const m of mockMatches) {
      if (m.status !== 'completed') continue
      if (groupId && m.group_id !== groupId) continue
      if (stageId && m.stage_id !== stageId) continue
      rows.push(m)
    }
  } else {
    let query = supabase
      .from('matches')
      .select('team_a_id, team_b_id, team_a_score, team_b_score')
      .eq('status', 'completed')
    if (groupId) query = query.eq('group_id', groupId)
    if (stageId) query = query.eq('stage_id', stageId)
    const { data } = await query
    rows.push(...((data ?? []) as any[]))
  }
  const stat = new Map<string, { played: number; wins: number }>()
  for (const m of rows) {
    if (!m.team_a_id || !m.team_b_id || m.team_a_id === m.team_b_id) continue
    const touch = (tid: string, win: boolean) => {
      const s = stat.get(tid) ?? { played: 0, wins: 0 }
      s.played++
      if (win) s.wins++
      stat.set(tid, s)
    }
    touch(m.team_a_id, m.team_a_score > m.team_b_score)
    touch(m.team_b_id, m.team_b_score > m.team_a_score)
  }
  const out: Record<string, { played: number; wins: number; win_rate: number }> = {}
  for (const [tid, s] of stat) {
    out[tid] = { played: s.played, wins: s.wins, win_rate: r2((s.wins / Math.max(s.played, 1)) * 100) }
  }
  return out
}

/**
 * 参赛队伍（该筛选范围内已完成比赛的对阵双方）：
 * 队伍排行为底使用，保证「只要打过比赛就出现在排行」，即使还没在后台手动录入 team_stats。
 * 净胜分/胜场等实时指标由调用方叠加 getTeamNetPoints 计算。
 */
export async function getParticipatingTeams(
  groupId?: string,
  stageId?: string,
): Promise<TeamStatRow[]> {
  const empty = (t: { id: string; name: string; tag: string | null; group_id: string | null; group_name: string | null }): TeamStatRow => ({
    team_id: t.id,
    team_name: t.name,
    tag: t.tag,
    stage_id: stageId ?? null,
    stage_name: null,
    group_id: t.group_id,
    group_name: t.group_name,
    win_rate: 0, kd: 0, matches: 0, net: 0,
    hs_rate: 0, pistol_win_rate: 0, first_five_win_rate: 0,
    avg_kills: 0, avg_deaths: 0, avg_assists: 0,
    total_kills: 0, total_deaths: 0, total_assists: 0,
  })
  if (!isSupabaseConfigured || !supabase) {
    const ids = new Set<string>()
    for (const m of mockMatches) {
      if (m.status !== 'completed') continue
      if (groupId && m.group_id !== groupId) continue
      if (stageId && m.stage_id !== stageId) continue
      if (m.team_a_id) ids.add(m.team_a_id)
      if (m.team_b_id) ids.add(m.team_b_id)
    }
    return [...ids].map((tid) => {
      const t = mockTeams.find((x) => x.id === tid)
      return empty({
        id: tid,
        name: t?.name ?? '未知',
        tag: t?.tag ?? null,
        group_id: t?.group_id ?? null,
        group_name: t ? (t.group_id ? groupNames[t.group_id] ?? null : null) : null,
      })
    })
  }
  let query = supabase.from('matches').select('team_a_id, team_b_id').eq('status', 'completed')
  if (groupId) query = query.eq('group_id', groupId)
  if (stageId) query = query.eq('stage_id', stageId)
  const { data } = await query
  const ids = new Set<string>()
  for (const m of (data ?? []) as any[]) {
    if (m.team_a_id) ids.add(m.team_a_id)
    if (m.team_b_id) ids.add(m.team_b_id)
  }
  if (ids.size === 0) return []
  const { data: teams } = await supabase
    .from('teams')
    .select('id, name, tag, group_id, group:groups(name)')
    .in('id', [...ids])
  return ((teams ?? []) as any[]).map((t) =>
    empty({
      id: t.id,
      name: t.name,
      tag: t.tag,
      group_id: t.group_id,
      group_name: t.group?.name ?? null,
    }),
  )
}

/** 保存/更新个人统计数据（每名选手一行，按 profile_id 覆盖；stage_id 记录当前录入的阶段） */
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
      { onConflict: 'profile_id' },
    )
}

// ============================================================
// 比赛队员数据聚合（个人数据排行：从比分录入入口登记的 match_player_stats 自动计算）
// 口径：场均 = Σ/地图数（map_count 合计）；爆头率 = Σ爆头/Σ击杀；
//       ADR = Σ伤害/Σ局数；WE / Rating 场均 = Σ/场次数；胜率 = 所属队胜场/参赛场次。
// ============================================================

interface RawStatRow {
  player_id: string
  team_id: string | null
  player_name?: string | null
  pw_username?: string | null
  team_name?: string | null
  match_id: string
  match_group_id?: string | null
  match_stage_id?: string | null
  match?: {
    stage_id: string | null
    group_id: string | null
    status: string
    winner_id: string | null
    team_a_id: string | null
    team_b_id: string | null
    // matches.stage_id 关联的 stage（组别可能挂在 stage 上，作为 match.group_id 的回退源）
    stage?: { group_id: string | null } | null
  } | null
  map_count: number
  kills: number
  deaths: number
  assists: number
  headshots: number
  headshot_rate_pct: number     // 新列：爆头率整数%（0~100）
  first_kills: number
  multi_kills: number
  clutches: number
  damage: number
  adr: number                   // 新列：每图 ADR（小数）
  rounds: number
  we: number
  rating: number
}

/** 该行比赛数据所属组别：优先 matches.group_id，回退到其 stage 的 group_id（组别可能挂在 stage 上）
 *  组别是「按队伍/阶段分配的」：同一位选手在挑战组打首发、在大师组打替补时，会横跨两个组别。 */
function groupIdOf(r: Pick<RawStatRow, 'match'>): string | null {
  return r.match?.group_id ?? r.match?.stage?.group_id ?? null
}

/** 对一名选手的若干行比赛数据进行聚合
 *  爆头率口径（按赛事加权整数）：Σ round(kills × headshot_rate_pct) ÷ Σ kills；
 *    若某行缺 headshot_rate_pct（0 且有 headshots），回退为「该行旧爆头数」计入加权分子。
 *  ADR 口径：Σ round(adr × rounds) ÷ Σ rounds；
 *    若某行缺 adr（0 且有 damage），回退为「该行总伤害 damage」计入加权分子。
 *  参赛判定（用于胜率/比赛数准确计算，避免幽灵行干扰）：
 *    某行算「该地图有效参赛」=  kills+deaths+assists+first_kills+multi_kills+clutches+hsRate+adr+we+rating > 0
 *    某 match 算「该选手有效参赛」= 该 match 任意一行有效参赛
 *  场均口径（与 avg_kills/avg_deaths/avg_assists 保持一致，全部按"地图数"除）：
 *    场均 WE      = Σ we     ÷ maps
 *    场均 Rating  = Σ rating ÷ maps
 *    胜率         = 有效胜场 ÷ 有效参赛场
 */
function aggregatePlayerRows(list: RawStatRow[]): Omit<PlayerStatRow, 'player_id'> {
  const first = list[0]
  // 该选手在本行聚合范围内涉及的全部组别（去重、按首次出现顺序）
  const groupIds = Array.from(
    new Set(list.map((r) => groupIdOf(r)).filter((x): x is string => !!x)),
  )
  const maps = list.reduce((a, r) => a + (Number(r.map_count) || 0), 0)
  const sum = (k: keyof RawStatRow) => list.reduce((a, r) => a + (Number(r[k]) || 0), 0)
  const kills = sum('kills')
  const deaths = sum('deaths')
  const assists = sum('assists')
  const firstKills = sum('first_kills')
  const multiKills = sum('multi_kills')
  const clutches = sum('clutches')
  const rounds = sum('rounds')
  const we = sum('we')
  const rating = sum('rating')

  // 先逐行算「有效参赛」：K/D/A/首杀/多杀/残局/爆头率/ADR/WE/Rating 任一非 0 = 本图有效上场
  type RowStat = RawStatRow & { __played: boolean }
  const tagged = list.map((r) => {
    const k = Number(r.kills) || 0
    const hsRate = Number(r.headshot_rate_pct) || 0
    const adr = Number(r.adr) || 0
    const anyStat =
      k +
      (Number(r.deaths) || 0) +
      (Number(r.assists) || 0) +
      (Number(r.first_kills) || 0) +
      (Number(r.multi_kills) || 0) +
      (Number(r.clutches) || 0) +
      hsRate +
      adr +
      (Number(r.we) || 0) +
      (Number(r.rating) || 0)
    return { ...r, __played: anyStat > 0 } as RowStat
  })

  // 按 match 聚合：决定哪些 match 是"该选手确实上场打了的"，以及胜场
  const playedMatches = new Map<string, { played: boolean; won: boolean }>()
  for (const r of tagged) {
    const prev = playedMatches.get(r.match_id) ?? { played: false, won: false }
    const matchWon = !!(r.match?.winner_id && r.team_id && r.match.winner_id === r.team_id)
    playedMatches.set(r.match_id, {
      played: prev.played || r.__played,
      won: prev.won || (r.__played && matchWon),
    })
  }
  let matchCount = 0
  let wins = 0
  for (const v of playedMatches.values()) {
    if (v.played) {
      matchCount++
      if (v.won) wins++
    }
  }

  // 爆头率：Σ kills * headshot_rate_pct（整数） ÷ Σ kills；回退旧 headshots
  const wghsNum = list.reduce((acc, r) => {
    const k = Number(r.kills) || 0
    const hsRate = Number(r.headshot_rate_pct) || 0
    if (k > 0 && hsRate > 0) {
      return acc + Math.round(k * hsRate)
    }
    return acc + (Number(r.headshots) || 0) * 100   // 旧列 headshots = kills*rate/100，等价为 kills*rate 的单位是 1/100 → *100 还原到 kills*pct 维度
  }, 0)
  const wghsDen = kills * 100   // 分子单位是 kills*pct（pct 为 0~100），除以 Σ kills*100 得 %
  // ADR：Σ adr*rounds ÷ Σ rounds；回退旧 damage=adr*rounds
  const wadrNum = list.reduce((acc, r) => {
    const adr = Number(r.adr) || 0
    const rnd = Number(r.rounds) || 0
    if (rnd > 0 && adr > 0) return acc + Math.round(adr * rnd)
    return acc + (Number(r.damage) || 0)
  }, 0)
  const wadrDen = rounds
  const safeDiv = (a: number, b: number) => (b > 0 ? a / b : 0)
  return {
    player_name: first.player_name ?? first.pw_username ?? '-',
    pw_username: first.pw_username ?? null,
    team_id: first.team_id,
    team_name: first.team_name ?? '未入队',
    stage_id: first.match_stage_id ?? first.match?.stage_id ?? null,
    stage_name: null,
    group_id: first.match_group_id ?? groupIdOf(first) ?? null,
    group_name: null,
    group_ids: groupIds,
    group_names: [],
    // 场均口径统一：÷ maps（= map_count 合计），和 avg_kills / avg_deaths / avg_assists 对齐
    we: r2(safeDiv(we, maps)),
    rating_pro: r2(safeDiv(rating, maps)),
    // 胜率 ÷ 有效参赛场（只算该选手真正上场的 match；幽灵 match 不影响）
    win_rate: r2(safeDiv(wins, matchCount) * 100),
    kd: r2(safeDiv(kills, deaths)),
    matches: matchCount,
    maps,
    hs_rate: r2(safeDiv(wghsNum, wghsDen) * 100),   // 换算回百分比（0~100）
    kpr: 0,
    dpr: 0,
    adr: r2(safeDiv(wadrNum, wadrDen)),
    total_kills: kills,
    total_deaths: deaths,
    total_assists: assists,
    fpr: 0,
    awp_kpr: 0,
    avg_kills: r2(safeDiv(kills, maps)),
    avg_deaths: r2(safeDiv(deaths, maps)),
    avg_assists: r2(safeDiv(assists, maps)),
    avg_first_kills: r2(safeDiv(firstKills, maps)),
    avg_multi_kills: r2(safeDiv(multiKills, maps)),
    avg_clutches: r2(safeDiv(clutches, maps)),
  }
}

/** 个人数据排行（自动聚合比赛队员数据；可按组别、阶段筛选；stageId 为空 = 总阶段汇总） */
export async function getPlayerStatsAggregated(
  groupId?: string,
  stageId?: string,
): Promise<PlayerStatRow[]> {
  let raw: RawStatRow[]
  if (!isSupabaseConfigured || !supabase) {
    raw = mockMatchPlayerStats
      .map((r) => {
        const m = mockMatches.find((x) => x.id === r.match_id)
        return {
          ...r,
          match: m
            ? {
                stage_id: m.stage_id,
                group_id: m.group_id,
                status: m.status,
                winner_id: m.winner_id,
                team_a_id: m.team_a_id,
                team_b_id: m.team_b_id,
                // mock：组别回退源 = 该比赛所属 stage 的组别（stages 有 group_id）
                stage: { group_id: mockStages.find((s) => s.id === m.stage_id)?.group_id ?? null },
              }
            : null,
        }
      })
      .filter((r) => (!groupId || groupIdOf(r) === groupId) && (!stageId || r.match?.stage_id === stageId))
  } else {
    const { data } = await supabase
      .from('match_player_stats')
      .select(
        '*, match:matches(stage_id, group_id, status, winner_id, team_a_id, team_b_id, stage:stages(group_id)), team:teams(name), player:profiles(nickname, pw_username)',
      )
    raw = ((data ?? []) as any[]).map((r) => ({
      player_id: r.player_id,
      team_id: r.team_id,
      player_name: r.player?.nickname ?? r.player?.pw_username ?? null,
      pw_username: r.player?.pw_username ?? null,
      team_name: r.team?.name ?? null,
      match_id: r.match_id,
      match: r.match ?? null,
      map_count: r.map_count,
      kills: r.kills, deaths: r.deaths, assists: r.assists,
      headshots: r.headshots,
      headshot_rate_pct: Number(r.headshot_rate_pct) || 0,
      first_kills: r.first_kills, multi_kills: r.multi_kills, clutches: r.clutches,
      damage: r.damage,
      adr: Number(r.adr) || 0,
      rounds: r.rounds, we: r.we, rating: r.rating,
    }))
    raw = raw.filter((r) => (!groupId || groupIdOf(r) === groupId) && (!stageId || r.match?.stage_id === stageId))
  }
  // 按选手分组
  const byPlayer = new Map<string, RawStatRow[]>()
  for (const r of raw) {
    ;(byPlayer.get(r.player_id) ?? byPlayer.set(r.player_id, []).get(r.player_id)!).push(r)
  }
  const rows: PlayerStatRow[] = []
  for (const [playerId, list] of byPlayer) {
    rows.push({ player_id: playerId, ...aggregatePlayerRows(list) })
  }
  // 补阶段/组别名称（组别列可显示多个：该选手在本聚合范围内横跨的所有组别）
  const [stages, groups] = await Promise.all([listStages(), listGroups()])
  const groupNameMap = new Map(groups.map((g) => [g.id, g.name]))
  for (const row of rows) {
    row.stage_name = stages.find((s) => s.id === row.stage_id)?.name ?? null
    row.group_name = row.group_ids?.[0] ? (groupNameMap.get(row.group_ids[0]) ?? null) : null
    row.group_names = (row.group_ids ?? [])
      .map((id) => groupNameMap.get(id) ?? null)
      .filter((x): x is string => !!x)
  }
  return rows.sort((a, b) => b.rating_pro - a.rating_pro || b.adr - a.adr)
}
