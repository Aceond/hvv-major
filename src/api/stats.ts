// 数据排行访问层（队伍排行 + 个人排行）
// 数据来源：管理员在后台手动录入（比赛结果录入后也可人工维护统计数据）。
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import { mockMatchPlayerStats, mockMatches, mockPlayerStats, mockTeamStats } from '@/mock/data'
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
  } | null
  map_count: number
  kills: number
  deaths: number
  assists: number
  headshots: number
  first_kills: number
  multi_kills: number
  clutches: number
  damage: number
  rounds: number
  we: number
  rating: number
}

/** 对一名选手的若干行比赛数据进行聚合 */
function aggregatePlayerRows(list: RawStatRow[]): Omit<PlayerStatRow, 'player_id'> {
  const first = list[0]
  const matchCount = new Set(list.map((r) => r.match_id)).size
  const maps = list.reduce((a, r) => a + (Number(r.map_count) || 0), 0)
  const sum = (k: keyof RawStatRow) => list.reduce((a, r) => a + (Number(r[k]) || 0), 0)
  const kills = sum('kills')
  const deaths = sum('deaths')
  const assists = sum('assists')
  const headshots = sum('headshots')
  const firstKills = sum('first_kills')
  const multiKills = sum('multi_kills')
  const clutches = sum('clutches')
  const damage = sum('damage')
  const rounds = sum('rounds')
  const we = sum('we')
  const rating = sum('rating')
  // 胜率：参与的每场比赛按所属队是否获胜计
  const wins = new Set(
    list
      .filter((r) => r.match?.winner_id && r.match.winner_id === r.team_id)
      .map((r) => r.match_id),
  ).size
  const safeDiv = (a: number, b: number) => (b > 0 ? a / b : 0)
  return {
    player_name: first.player_name ?? first.pw_username ?? '-',
    pw_username: first.pw_username ?? null,
    team_id: first.team_id,
    team_name: first.team_name ?? '未入队',
    stage_id: first.match_stage_id ?? first.match?.stage_id ?? null,
    stage_name: null,
    group_id: first.match_group_id ?? first.match?.group_id ?? null,
    group_name: null,
    we: r2(safeDiv(we, matchCount)),
    rating_pro: r2(safeDiv(rating, matchCount)),
    win_rate: r2(safeDiv(wins, matchCount) * 100),
    kd: r2(safeDiv(kills, deaths)),
    matches: matchCount,
    maps,
    hs_rate: r2(safeDiv(headshots, kills) * 100),
    kpr: 0,
    dpr: 0,
    adr: r2(safeDiv(damage, rounds)),
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
              }
            : null,
        }
      })
      .filter((r) => (!groupId || r.match_group_id === groupId) && (!stageId || r.match_stage_id === stageId))
  } else {
    const { data } = await supabase
      .from('match_player_stats')
      .select(
        '*, match:matches(stage_id, group_id, status, winner_id, team_a_id, team_b_id), team:teams(name), player:profiles(nickname, pw_username)',
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
      kills: r.kills, deaths: r.deaths, assists: r.assists, headshots: r.headshots,
      first_kills: r.first_kills, multi_kills: r.multi_kills, clutches: r.clutches,
      damage: r.damage, rounds: r.rounds, we: r.we, rating: r.rating,
    }))
    raw = raw.filter((r) => (!groupId || r.match?.group_id === groupId) && (!stageId || r.match?.stage_id === stageId))
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
  // 补阶段/组别名称
  const [stages, groups] = await Promise.all([listStages(), listGroups()])
  for (const row of rows) {
    row.stage_name = stages.find((s) => s.id === row.stage_id)?.name ?? null
    row.group_name = groups.find((g) => g.id === row.group_id)?.name ?? null
  }
  return rows.sort((a, b) => b.rating_pro - a.rating_pro || b.adr - a.adr)
}
