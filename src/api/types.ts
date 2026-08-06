// 数据层统一类型定义（与 supabase/schema.sql 保持一致）

export type Role = 'admin' | 'player'
export type TeamStatus = 'pending' | 'approved' | 'rejected'
export type StageFormat = 'round_robin' | 'single_elim' | 'double_elim' | 'swiss'
export type StageStatus = 'upcoming' | 'running' | 'ended'
export type MatchStatus = 'scheduled' | 'completed' | 'cancelled'

export interface Profile {
  id: string
  username: string | null
  nickname: string | null // 游戏昵称（个人选手注册时填写）
  pw_username: string | null // 完美 ID：完美对战平台的用户名（后台按用户名记录）
  role: Role
  created_at: string
}

/** 已注册的个人选手（选手池，供战队选人） */
export interface PlayerItem {
  id: string
  nickname: string | null
  pw_username: string | null
  in_team: boolean // 是否已加入某支战队
}

export interface Team {
  id: string
  name: string
  tag: string | null
  captain_id: string
  group_id: string | null // 所属组别（传奇组/大师组/挑战组）
  status: TeamStatus
  created_at: string
}

export interface TeamMember {
  id: string
  team_id: string
  profile_id: string
  nickname: string | null
  pw_username: string | null // 完美用户名
  is_captain: boolean
  status: 'active' | 'benched'
}

/** 组别（传奇组 / 大师组 / 挑战组，相互独立） */
export interface Group {
  id: string
  name: string
  sort_order: number
}

export interface Stage {
  id: string
  name: string
  format: StageFormat
  status: StageStatus
  sort_order: number
  start_at: string | null
  end_at: string | null
}

export interface Match {
  id: string
  stage_id: string
  group_id: string | null // 所属组别（淘汰赛可跨组，为 null）
  round_number: number
  team_a_id: string | null
  team_b_id: string | null
  best_of: number
  map: string | null
  team_a_score: number
  team_b_score: number
  winner_id: string | null
  status: MatchStatus
  scheduled_at: string | null
  // 联表展示字段
  stage_name?: string
  group_name?: string
  team_a_name?: string
  team_b_name?: string
}

export interface StandingsRow {
  stage_id: string
  group_id: string | null
  group_name: string | null
  team_id: string
  team_name: string
  tag: string | null
  played: number
  wins: number
  losses: number
  maps_won: number
  maps_lost: number
  map_diff: number
  points: number
}

/** 队伍数据排行行 */
export interface TeamStatRow {
  team_id: string
  team_name: string
  tag: string | null
  stage_id: string | null
  stage_name: string | null
  group_id: string | null
  group_name: string | null
  played: number
  wins: number
  losses: number
  points: number
  we: number // 胜率 / 获胜效率 %
  adr: number // 每回合平均伤害（Average Damage per Round）
  kd: number // 击杀/死亡比
  rating: number
}

/** 个人数据排行行 */
export interface PlayerStatRow {
  player_id: string
  player_name: string
  team_id: string
  team_name: string
  stage_id: string | null
  stage_name: string | null
  group_id: string | null
  group_name: string | null
  matches: number
  kills: number
  deaths: number
  assists: number
  hs_rate: number // 爆头率 %
  rating: number
}

export const STAGE_FORMAT_LABEL: Record<StageFormat, string> = {
  round_robin: '循环赛',
  single_elim: '单败淘汰',
  double_elim: '双败淘汰',
  swiss: '瑞士轮',
}

export const STAGE_STATUS_LABEL: Record<StageStatus, string> = {
  upcoming: '未开始',
  running: '进行中',
  ended: '已结束',
}

export const MATCH_STATUS_LABEL: Record<MatchStatus, string> = {
  scheduled: '待开赛',
  completed: '已结束',
  cancelled: '已取消',
}
