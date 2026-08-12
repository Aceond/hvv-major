// 竞猜系统数据访问层
// 真实环境：bet_polls / bet_accounts / bet_records 三表 + place_bet / settle_bet 两个 RPC（见 schema.sql 第 12 节）
// 未配置 Supabase（演示模式）时读写内存 mock。
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import { mockMatches } from '@/mock/data'

export type BetKind = 'group_champion' | 'match_winner' | 'stage_advance' | 'custom'
export type BetPollStatus = 'open' | 'closed' | 'settled'

export interface BetOption {
  id: string
  label: string
  team_id: string | null
  odds: number
}

export interface BetPoll {
  id: string
  event_id: string
  title: string
  kind: BetKind
  options: BetOption[]
  status: BetPollStatus
  winning_option_id: string | null
  match_id: string | null
  created_at: string
}

export interface BetRecord {
  id: string
  user_id: string
  poll_id: string
  option_id: string
  option_label: string
  odds: number
  stake: number
  status: 'pending' | 'won' | 'lost'
  created_at: string
  poll?: { title: string; event_id: string; status: BetPollStatus; winning_option_id: string | null }
}

export const BET_KIND_LABEL: Record<BetKind, string> = {
  group_champion: '组别冠军',
  match_winner: '比赛胜者',
  stage_advance: '阶段晋级',
  custom: '自定义',
}

export const BET_STATUS_LABEL: Record<BetPollStatus, string> = {
  open: '进行中',
  closed: '已截止',
  settled: '已结算',
}

const newId = () => `bet-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
const newOptionId = () => `o-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

// ---------------- 演示模式 mock ----------------
const mockAccounts = new Map<string, number>()
const mockPolls: BetPoll[] = [
  {
    id: 'bet-1',
    event_id: 'event-11',
    title: '传奇组冠军',
    kind: 'group_champion',
    options: [
      { id: 'bet1-o1', label: 'Nova Velocity', team_id: 'team-1', odds: 1.8 },
      { id: 'bet1-o2', label: 'Iron Legion', team_id: 'team-2', odds: 2.5 },
      { id: 'bet1-o3', label: 'Ashes Rising', team_id: 'team-3', odds: 4.2 },
      { id: 'bet1-o4', label: 'Void Walkers', team_id: 'team-4', odds: 6.5 },
    ],
    status: 'open',
    winning_option_id: null,
    match_id: null,
    created_at: '2026-08-01 09:00',
  },
  {
    id: 'bet-2',
    event_id: 'event-11',
    title: '小组赛 第1轮：Nova Velocity vs Iron Legion 胜者',
    kind: 'match_winner',
    options: [
      { id: 'bet2-o1', label: 'Nova Velocity 胜', team_id: 'team-1', odds: 1.55 },
      { id: 'bet2-o2', label: 'Iron Legion 胜', team_id: 'team-2', odds: 2.35 },
    ],
    status: 'open',
    winning_option_id: null,
    match_id: null,
    created_at: '2026-08-02 10:00',
  },
  {
    id: 'bet-3',
    event_id: 'event-10',
    title: '上届 挑战组晋级队伍',
    kind: 'stage_advance',
    options: [
      { id: 'bet3-o1', label: 'Shadow Fang', team_id: 'team-9', odds: 2.0 },
      { id: 'bet3-o2', label: 'Echo Nine', team_id: 'team-10', odds: 3.0 },
      { id: 'bet3-o3', label: 'Venom Strike', team_id: 'team-11', odds: 4.0 },
    ],
    status: 'settled',
    winning_option_id: 'bet3-o1',
    match_id: null,
    created_at: '2026-06-01 09:00',
  },
]
const mockRecords: BetRecord[] = []

/** 已完成比赛行（赔率/强度计算用） */
interface CompletedRow {
  team_a_id: string | null
  team_b_id: string | null
  team_a_score: number
  team_b_score: number
}

async function loadCompletedMatches(): Promise<CompletedRow[]> {
  if (!isSupabaseConfigured || !supabase) {
    return mockMatches.filter((m) => m.status === 'completed')
  }
  const { data } = await supabase
    .from('matches')
    .select('team_a_id, team_b_id, team_a_score, team_b_score')
    .eq('status', 'completed')
  return ((data as CompletedRow[] | null) ?? []).filter(
    (m) => m.team_a_id && m.team_b_id && m.team_a_id !== m.team_b_id,
  )
}

/**
 * 队伍综合强度（0~1）：胜率 50% + 净胜局 30% + 对手平均胜率 20%
 * 与数据库 team_strength 函数保持一致（schema.sql 第 13 节），
 * 兼顾对手强弱与净胜分，避免只看胜率。
 */
function teamStrengthMap(rows: CompletedRow[]): Map<string, number> {
  const agg = new Map<string, { played: number; wins: number; net: number }>()
  for (const m of rows) {
    if (!m.team_a_id || !m.team_b_id || m.team_a_id === m.team_b_id) continue
    const touch = (tid: string, win: boolean, diff: number) => {
      const s = agg.get(tid) ?? { played: 0, wins: 0, net: 0 }
      s.played++
      if (win) s.wins++
      s.net += diff
      agg.set(tid, s)
    }
    touch(m.team_a_id, m.team_a_score > m.team_b_score, m.team_a_score - m.team_b_score)
    touch(m.team_b_id, m.team_b_score > m.team_a_score, m.team_b_score - m.team_a_score)
  }
  const winRate = (tid: string) => {
    const s = agg.get(tid)
    return s && s.played > 0 ? s.wins / s.played : 0
  }
  const netRate = (tid: string) => {
    const s = agg.get(tid)
    if (!s || s.played === 0) return 0
    return Math.max(0, Math.min(1, 0.5 + s.net / s.played / 12))
  }
  // 第二遍：对手平均胜率
  const oppSum = new Map<string, { total: number; count: number }>()
  for (const m of rows) {
    if (!m.team_a_id || !m.team_b_id) continue
    const touchOpp = (tid: string, opp: string) => {
      const o = oppSum.get(tid) ?? { total: 0, count: 0 }
      o.total += winRate(opp)
      o.count++
      oppSum.set(tid, o)
    }
    touchOpp(m.team_a_id, m.team_b_id)
    touchOpp(m.team_b_id, m.team_a_id)
  }
  const oppRate = (tid: string) => {
    const o = oppSum.get(tid)
    return o && o.count > 0 ? o.total / o.count : 0
  }
  const out = new Map<string, number>()
  for (const tid of agg.keys()) {
    out.set(tid, Math.round((0.5 * winRate(tid) + 0.3 * netRate(tid) + 0.2 * oppRate(tid)) * 10000) / 10000)
  }
  return out
}

/** 按双方综合强度生成比赛胜者赔率（系统自动；强度高者赔率低），范围 1.2~2 */
export async function computeMatchOdds(
  teamAId: string,
  teamBId: string,
): Promise<{ a: number; b: number }> {
  const rows = await loadCompletedMatches()
  const strengths = teamStrengthMap(rows)
  const sa = strengths.get(teamAId) ?? 0
  const sb = strengths.get(teamBId) ?? 0
  const r = (self: number, other: number) => {
    const s = Math.max(self, 0.001)
    return Math.min(2, Math.round(Math.max(1.2, (s + other) / s) * 100) / 100)
  }
  return { a: r(sa, sb), b: r(sb, sa) }
}

/** 我的积分账户（未创建时返回初始 200） */
export async function getMyBetAccount(): Promise<{ points: number; exists: boolean }> {
  if (!isSupabaseConfigured || !supabase) {
    const p = mockAccounts.get('demo-player')
    return p === undefined ? { points: 200, exists: false } : { points: p, exists: true }
  }
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { points: 0, exists: false }
  const { data } = await supabase
    .from('bet_accounts')
    .select('points')
    .eq('user_id', user.id)
    .maybeSingle()
  return data ? { points: data.points as number, exists: true } : { points: 200, exists: false }
}

/** 竞猜项列表（可按赛事过滤） */
export async function listPolls(eventId?: string): Promise<BetPoll[]> {
  if (!isSupabaseConfigured || !supabase) {
    return mockPolls.filter((p) => !eventId || p.event_id === eventId)
  }
  let q = supabase.from('bet_polls').select('*').order('created_at')
  if (eventId) q = q.eq('event_id', eventId)
  const { data } = await q
  return (data as BetPoll[]) ?? []
}

/** 我的投注记录（按时间倒序） */
export async function listMyRecords(): Promise<BetRecord[]> {
  if (!isSupabaseConfigured || !supabase) {
    return mockRecords.filter((r) => r.user_id === 'demo-player')
  }
  const { data } = await supabase
    .from('bet_records')
    .select('*, poll:bet_polls(title, event_id, status, winning_option_id)')
    .order('created_at', { ascending: false })
  return (data as BetRecord[]) ?? []
}

/** 投注：原子扣积分 + 记录（真实环境走 place_bet RPC） */
export async function placeBet(pollId: string, optionId: string, stake: number) {
  if (!isSupabaseConfigured || !supabase) {
    const poll = mockPolls.find((p) => p.id === pollId)
    if (!poll) throw new Error('竞猜项不存在')
    if (poll.status !== 'open') throw new Error('该竞猜已截止，无法投注')
    const opt = poll.options.find((o) => o.id === optionId)
    if (!opt) throw new Error('竞猜选项不存在')
    const me = 'demo-player'
    if (mockRecords.some((r) => r.poll_id === pollId && r.user_id === me)) {
      throw new Error('你已参与过该竞猜，每人限投一次')
    }
    const cur = mockAccounts.get(me) ?? 200
    if (cur < stake) throw new Error(`积分不足（当前 ${cur} 分）`)
    mockAccounts.set(me, cur - stake)
    mockRecords.push({
      id: newId(),
      user_id: me,
      poll_id: pollId,
      option_id: optionId,
      option_label: opt.label,
      odds: opt.odds,
      stake,
      status: 'pending',
      created_at: new Date().toISOString(),
    })
    return
  }
  const { error } = await supabase.rpc('place_bet', {
    p_poll_id: pollId,
    p_option_id: optionId,
    p_stake: stake,
  })
  if (error) throw new Error(error.message)
}

// ---------------- 管理员 ----------------

/** 发布竞猜项（默认进行中；选项与赔率由调用方组装） */
export async function createPoll(input: {
  event_id: string
  title: string
  kind: BetKind
  options: BetOption[]
}) {
  if (!isSupabaseConfigured || !supabase) {
    mockPolls.push({
      id: newId(),
      ...input,
      status: 'open',
      winning_option_id: null,
      match_id: null,
      created_at: new Date().toISOString(),
    })
    return
  }
  const { error } = await supabase
    .from('bet_polls')
    .insert({ ...input, status: 'open', options: input.options })
  if (error) throw new Error(error.message)
}

/** 更新竞猜项（改标题/选项/赔率/截止状态等） */
export async function updatePoll(id: string, patch: Partial<BetPoll>) {
  if (!isSupabaseConfigured || !supabase) {
    const p = mockPolls.find((x) => x.id === id)
    if (p) Object.assign(p, patch)
    return
  }
  const { error } = await supabase.from('bet_polls').update(patch).eq('id', id)
  if (error) throw new Error(error.message)
}

/** 删除竞猜项（其投注记录级联删除） */
export async function deletePoll(id: string) {
  if (!isSupabaseConfigured || !supabase) {
    const i = mockPolls.findIndex((x) => x.id === id)
    if (i >= 0) mockPolls.splice(i, 1)
    for (let j = mockRecords.length - 1; j >= 0; j--) {
      if (mockRecords[j].poll_id === id) mockRecords.splice(j, 1)
    }
    return
  }
  const { error } = await supabase.from('bet_polls').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

/** 结算：标记中奖选项并按投注赔率发放积分（真实环境走 settle_bet RPC） */
export async function settlePoll(pollId: string, winningOptionId: string) {
  if (!isSupabaseConfigured || !supabase) {
    const poll = mockPolls.find((p) => p.id === pollId)
    if (!poll) throw new Error('竞猜项不存在')
    if (poll.status === 'settled') throw new Error('该竞猜已结算')
    if (!poll.options.some((o) => o.id === winningOptionId)) throw new Error('中奖选项不存在')
    poll.status = 'settled'
    poll.winning_option_id = winningOptionId
    for (const r of mockRecords) {
      if (r.poll_id !== pollId || r.status !== 'pending') continue
      if (r.option_id === winningOptionId) {
        r.status = 'won'
        mockAccounts.set(r.user_id, (mockAccounts.get(r.user_id) ?? 200) + Math.round(r.stake * r.odds))
      } else {
        r.status = 'lost'
      }
    }
    return
  }
  const { error } = await supabase.rpc('settle_bet', {
    p_poll_id: pollId,
    p_winning_option_id: winningOptionId,
  })
  if (error) throw new Error(error.message)
}

export { newOptionId }
