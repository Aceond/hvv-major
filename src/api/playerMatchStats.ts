// 比赛队员数据访问层（比分录入入口按「地图」登记：击杀/死亡/助攻/爆头/首杀/多杀/残局/伤害/局数/WE/Rating）
// 个人数据排行页据此自动聚合：场均 = 总量 / 地图数（map_count 合计），爆头率 = Σ爆头/Σ击杀，
// ADR = Σ伤害/Σ局数，WE/Rating 场均 = Σ/场次数。
// 未配置 Supabase（演示模式）时使用 mock 数据。
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import { mockMembers, mockMatchPlayerStats, mockTeams } from '@/mock/data'
import type { MatchPlayerStat, MatchPlayerStatInput, TeamMember } from './types'

/** 自动匹配一场比赛双方的队员（active + benched，都允许录入数据；替补选手在 UI 上会标蓝提示），
 *  附带昵称 / 完美 ID / 状态。 */
export async function listMatchPlayers(
  teamAId: string | null,
  teamBId: string | null,
): Promise<TeamMember[]> {
  if (!isSupabaseConfigured || !supabase) {
    const ids = [teamAId, teamBId].filter((x): x is string => !!x)
    return ids.flatMap((tid) => (mockMembers[tid] ?? []))
  }
  if (!teamAId && !teamBId) return []
  let query = supabase
    .from('team_members')
    .select('*, player:profiles(nickname, pw_username, steam_id)')
    .in('status', ['active', 'benched'])
  if (teamAId && teamBId) {
    query = query.in('team_id', [teamAId, teamBId])
  } else {
    query = query.eq('team_id', teamAId ?? teamBId)
  }
  const { data } = await query
  return ((data ?? []) as any[])
    .map((m) => ({
      ...m,
      nickname: m.player?.nickname ?? null,
      pw_username: m.player?.pw_username ?? null,
      steam_id: m.player?.steam_id ?? null, // PWA 自动导入按 Steam64 匹配（需 SQL 开放 authenticated 读 profiles.steam_id）
    }))
    .sort((a, b) => {
      // active 在前，benched 在后；队内按队长在前 + 按 id 稳定
      if (a.team_id !== b.team_id) return a.team_id.localeCompare(b.team_id)
      if (a.status !== b.status) return a.status === 'active' ? -1 : 1
      if (a.is_captain !== b.is_captain) return a.is_captain ? -1 : 1
      return (a.id ?? '').localeCompare(b.id ?? '')
    })
}

/** 某场比赛已录入的队员数据（含队员昵称/完美 ID/战队名），按地图分组返回 */
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
    .order('map_name')
  return ((data ?? []) as any[]).map((s) => ({
    ...s,
    player_name: s.player?.nickname ?? s.player?.pw_username ?? null,
    pw_username: s.player?.pw_username ?? null,
    team_name: s.team?.name ?? null,
  }))
}

/** 保存某场比赛「某张地图」的队员数据：按 match_id + map_name + player_id 覆盖（先删旧，再插入）
 *  录入口径升级：headshot_rate_pct（爆头率整数%）与 adr 是录入字段；
 *  兼容旧列 headshots/damage 由 (kills * hs% /100)、(adr * rounds) 反算后一并落盘。
 */
export async function saveMatchPlayerStats(
  matchId: string,
  mapName: string,
  rows: MatchPlayerStatInput[],
): Promise<boolean> {
  // 输入规整：按 headshot_rate_pct / adr 反推 headshots / damage（保留整数），避免 UI 漏写
  const normalized = rows.map((r) => {
    const hsRate = Number(r.headshot_rate_pct) || 0
    const adr = Number(r.adr) || 0
    const k = Number(r.kills) || 0
    const rnd = Number(r.rounds) || 0
    const headshots = Number(r.headshots) > 0 ? Number(r.headshots) : Math.round((k * hsRate) / 100)
    const damage = Number(r.damage) > 0 ? Number(r.damage) : Math.round(adr * rnd)
    return { ...r, headshot_rate_pct: hsRate, adr, headshots, damage }
  })
  if (!isSupabaseConfigured || !supabase) {
    for (let i = mockMatchPlayerStats.length - 1; i >= 0; i--) {
      const s = mockMatchPlayerStats[i]
      if (s.match_id === matchId && (s.map_name ?? '') === mapName) mockMatchPlayerStats.splice(i, 1)
    }
    for (const r of normalized) {
      const teamName = mockTeams.find((t) => t.id === r.team_id)?.name ?? null
      mockMatchPlayerStats.push({
        id: `mps-${matchId}-${mapName}-${r.player_id}-${Date.now()}`,
        match_id: matchId,
        player_id: r.player_id,
        team_id: r.team_id,
        map_name: mapName,
        map_count: r.map_count,
        kills: r.kills, deaths: r.deaths, assists: r.assists,
        headshot_rate_pct: r.headshot_rate_pct,
        headshots: r.headshots,
        adr: r.adr,
        first_kills: r.first_kills, multi_kills: r.multi_kills, clutches: r.clutches,
        damage: r.damage, rounds: r.rounds,
        we: r.we, rating: r.rating,
        created_at: new Date().toISOString(),
        team_name: teamName,
      })
    }
    return true
  }
  // 事务性保存：删该图旧数据 → 插新（RLS 允许管理员/参赛队队长操作）
  const { error: delErr } = await supabase
    .from('match_player_stats')
    .delete()
    .eq('match_id', matchId)
    .eq('map_name', mapName)
  if (delErr) throw new Error(delErr.message)
  if (normalized.length > 0) {
    const { error: insErr } = await supabase.from('match_player_stats').insert(
      normalized.map((r) => ({ match_id: matchId, ...r })),
    )
    if (insErr) throw new Error(insErr.message)
  }
  return true
}

/** 保存完某场比赛「全部地图」后兜底清理幽灵行：
 *  - map_name = ''（旧口径整场合计行，现在已被按图拆分替代）
 *  - 或：所有统计列都为 0（rounds 是自动按比分填的默认值不计入「参赛」判断）
 *  这样未上场的替补、历史空名旧行就不会再混进个人排行里算 100% 胜率了。
 */
export async function purgeMatchPlayerStatsZeroRows(matchId: string): Promise<number> {
  const zeroFilter = {
    kills: 0, deaths: 0, assists: 0,
    headshots: 0, headshot_rate_pct: 0,
    first_kills: 0, multi_kills: 0, clutches: 0,
    damage: 0, adr: 0,
    we: 0, rating: 0,
  }
  if (!isSupabaseConfigured || !supabase) {
    const before = mockMatchPlayerStats.length
    // import 的数组引用不能重赋值 → 直接 splice 原数组，按 match 过滤后重新追加
    const keep: typeof mockMatchPlayerStats = []
    for (const s of mockMatchPlayerStats) {
      if (s.match_id !== matchId) { keep.push(s); continue }
      if ((s.map_name ?? '') === '') continue
      let isAllZero = true
      for (const [k, v] of Object.entries(zeroFilter)) {
        if ((s as any)[k] !== v) { isAllZero = false; break }
      }
      if (!isAllZero) keep.push(s)
    }
    mockMatchPlayerStats.splice(0, mockMatchPlayerStats.length, ...keep)
    return before - mockMatchPlayerStats.length
  }
  // Supabase：先删空名旧行，再删全 0 行（RLS：match_* 的写入删权限已给管理员/参赛队长）
  const { error: e1 } = await supabase
    .from('match_player_stats')
    .delete()
    .eq('match_id', matchId)
    .eq('map_name', '')
  if (e1) throw new Error(e1.message)
  // PostgREST 不直接支持 in (...) + 全列 or 条件的 delete，这里用 count+select 定位 id 再删
  const cols = Object.keys(zeroFilter) as Array<keyof typeof zeroFilter>
  let q = supabase.from('match_player_stats').select('id').eq('match_id', matchId)
  for (const c of cols) q = q.eq(c, zeroFilter[c])
  const { data: rows, error: selErr } = await q
  if (selErr) throw new Error(selErr.message)
  const ids = (rows ?? []).map((r: any) => r.id as string)
  if (ids.length === 0) return 0
  const { error: delErr } = await supabase
    .from('match_player_stats')
    .delete()
    .in('id', ids)
  if (delErr) throw new Error(delErr.message)
  return ids.length
}
