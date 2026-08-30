// 数据层统一类型定义（与 supabase/schema.sql 保持一致）

export type Role = 'admin' | 'caster' | 'player'
export type TeamStatus = 'pending' | 'approved' | 'rejected'
export type ApplicationStatus = 'pending' | 'approved' | 'rejected'
export type EmploymentStatus = 'employed' | 'unemployed' // 在职 / 离职

/** 完美对战平台段位（近 3 赛季最高段位，管理员审核时查看战绩截图后手动选择，从高到低） */
export const CS2_RANKS = [
  '魔王S', '钻石S', '黄金S', 'S',
  '金A+', 'A+', 'A',
  '金B+', 'B+', 'B',
  '金C+', 'C+', 'C',
  'D+', 'D',
] as const
export type Cs2Rank = (typeof CS2_RANKS)[number]

/** 账号（profiles.account_status：管理员人工审核新注册账号） */
export interface AccountItem {
  id: string
  username: string | null
  email: string | null
  role: 'admin' | 'caster' | 'player' | null
  account_status: ApplicationStatus | null
  created_at: string
}
export type EventStatus = 'signup' | 'running' | 'ended'
export type StageFormat = 'round_robin' | 'single_elim' | 'double_elim' | 'swiss'
export type StageStatus = 'upcoming' | 'running' | 'ended'
export type MatchStatus = 'scheduled' | 'completed' | 'cancelled'
export type MediaKind = 'live' | 'vod' | 'other' // 直播 / 录像 / 其他

/** 赛事（一届一届持续举办，如 HVV MAJOR 11） */
export interface EventItem {
  id: string
  name: string // 赛事名称，如 HVV MAJOR 11
  edition: number | null // 届数（第几届）
  status: EventStatus // 报名中 / 进行中 / 已结束
  signup_start: string | null // 报名开始时间
  signup_end: string | null // 报名截止时间
  start_at: string | null // 开赛时间
  end_at: string | null // 结束时间
  description: string | null // 赛事简介
  // 冠军展播（首页轮播：最近三届冠军 + 当前赛事 banner）
  champion_team_id?: string | null // 冠军队伍（往届手动录入；本届及以后赛事结束自动判定）
  champion_team_name?: string | null // 冠军队伍名（联表）
  champion_team_tag?: string | null // 冠军队伍队标（联表）
  banner_url?: string | null // 赛事 banner（压缩 data URL）
  champion_image?: string | null // 冠军展示图（压缩 data URL，可选）
  created_at: string
}

export interface Profile {
  id: string
  username: string | null
  nickname: string | null // 游戏昵称（个人选手注册时填写）
  pw_username: string | null // 完美 ID：完美对战平台的用户名（后台按用户名记录）
  role: Role
  highest_rank?: string | null // 近 3 赛季最高段位（管理员审核时查看战绩截图后选择）
  highest_rating?: number | null // 最高段位时的最高 Rating（选手注册自选、管理员审核时确认）
  created_at: string
}

/** 已注册的个人选手（选手池，供战队选人） */
export interface PlayerItem {
  id: string
  nickname: string | null
  pw_username: string | null
  highest_rank?: string | null // 近 3 赛季最高段位
  highest_rating?: number | null // 最高段位时的最高 Rating
  in_team: boolean // 是否已加入某支战队
  team_id: string | null // 所属战队（未入队为 null）
}

/** 个人选手注册申请（提交选手姓名 + 完美 ID + 最近 3-5 个赛季截图，管理员审核后进入选手池） */
export interface PlayerApplication {
  id: string
  profile_id: string
  event_id: string | null // 报名赛事
  pw_username: string // 完美 ID（完美对战平台用户名）
  display_name: string | null // 选手姓名（真实姓名，审核通过后回填 profiles.nickname）
  nickname: string | null // 预留昵称（本次注册不再单独采集）
  screenshots: string[] // 赛季截图（URL 或演示模式下的 data URL）
  employment_status: EmploymentStatus | null // 在职状态（在职需填驻地与工号）
  location: string | null // 驻地（在职时必填）
  employee_no: string | null // 工号（在职时必填）
  highest_rank?: string | null // 近 3 赛季最高段位（管理员审核时选择）
  highest_rating?: number | null // 最高段位时的最高 Rating（选手注册自选、管理员审核时确认）
  status: ApplicationStatus
  review_note: string | null
  created_at: string
  reviewed_at: string | null
}

export interface Team {
  id: string
  name: string
  tag: string | null
  captain_id: string
  event_id: string | null // 报名赛事（战队按赛事报名）
  group_id: string | null // 所属组别（传奇组/大师组/挑战组）
  captain_name?: string | null // 队长注册姓名（该赛事审核时回填 profiles.nickname）
  captain_pw?: string | null // 队长完美 ID（该赛事审核时回填 profiles.pw_username）
  status: TeamStatus
  created_at: string
}

export interface TeamMember {
  id: string
  team_id: string
  profile_id: string
  event_id?: string | null // 冗余战队所属赛事（正式队员按赛事一人一队约束用）
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
  event_id: string | null // 所属赛事（每届赛事可自定义各自的赛制与阶段列表）
  group_id: string | null // 所属组别（每个组别的赛程单独管理，跨组/决赛阶段为空）
  name: string
  format: StageFormat
  status: StageStatus
  sort_order: number
  final_best_of?: number | null // 总决赛赛制（淘汰赛总决赛：3=BO3 / 5=BO5，空=默认 BO3）
  start_at: string | null
  end_at: string | null
  group_name?: string | null // 联表展示：组别名称
}

export interface Match {
  id: string
  stage_id: string
  group_id: string | null // 所属组别（淘汰赛可跨组，为 null）
  round_number: number
  bracket?: 'wb' | 'lb' | 'gf' | null // 淘汰赛所属赛组：wb=胜者组 / lb=败者组 / gf=总决赛（单败固定 wb）
  sort_order?: number | null // 同轮次内对阵顺序（槽位），保证对阵图半区与自动匹配一致
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

/** 逐图比分（BO3 每张图的地图名与双方比分） */
export interface MatchMap {
  id: string
  match_id: string
  map_count: number   // 1=第一张图,2=第二张图,3=第三张图...（与match_id 联合唯一，防 double click 追加）
  map_name: string
  team_a_score: number
  team_b_score: number
  winner_id: string | null
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

/** 比赛媒体链接（每场比赛的直播 / 录像 / 其他，管理员登记） */
export interface MatchMedia {
  id: string
  match_id: string
  kind: MediaKind
  label: string
  url: string
  created_at: string
}

/** 每场比赛的解说人员（管理员 / 解说添加，公开展示） */
export interface MatchCaster {
  id: string
  match_id: string
  caster_name: string // 解说人员（姓名 / 平台昵称）
  created_at: string
}

/** 角色中文名（账号审核等列表展示用） */
export const ROLE_LABEL: Record<string, string> = {
  admin: '管理员',
  caster: '解说',
  player: '选手',
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
  win_rate: number // 胜率 %
  kd: number // K/D
  matches: number // 比赛数
  net: number // 净胜分（小分=净胜局，由已完成比赛实时计算）
  hs_rate: number // 爆头率 %
  pistol_win_rate: number // 手枪局胜率 %
  first_five_win_rate: number // 先胜 5 回合胜率 %
  avg_kills: number // 场均击杀
  avg_deaths: number // 场均死亡
  avg_assists: number // 场均助攻
  total_kills: number // 总击杀
  total_deaths: number // 总死亡
  total_assists: number // 总助攻
}

/** 个人数据排行行 */
export interface PlayerStatRow {
  player_id: string
  player_name: string
  pw_username?: string | null // 完美 ID（完美对战平台用户名）
  team_id: string | null // 所属战队（未入队为 null）
  team_name: string
  stage_id: string | null
  stage_name: string | null
  stage_group_id?: string | null // 数据/比赛所属组别（该行 stage 的组别，即「在哪打的」；非选手战队组别）
  group_id: string | null
  group_name: string | null
  // 该选手在本行聚合范围内涉及的全部组别（可能跨多个组别：如挑战组首发 + 大师组替补）
  group_ids?: string[]
  group_names?: string[]
  we: number // WE（获胜效率）
  rating_pro: number // Rating PRO
  win_rate: number // 胜率 %
  kd: number // K/D
  matches: number // 比赛数
  hs_rate: number // 爆头率 %
  kpr: number // 击杀/回合
  dpr: number // 死亡/回合
  adr: number // ADR
  total_kills: number // 总击杀
  total_deaths: number // 总死亡
  total_assists: number // 总助攻
  fpr: number // 首杀/回合
  awp_kpr: number // AWP 击杀/回合
  // 比赛队员数据聚合字段（个人数据排行页按场次登记数据自动计算）
  maps?: number // 总地图数（map_count 合计）
  avg_kills?: number // 场均击杀
  avg_deaths?: number // 场均死亡
  avg_assists?: number // 场均助攻
  avg_first_kills?: number // 场均首杀
  avg_multi_kills?: number // 场均多杀
  avg_clutches?: number // 场均残局
}

/** 比赛队员数据（比分录入入口按「地图」登记，个人数据排行据此自动聚合） */
export interface MatchPlayerStat {
  id: string
  match_id: string
  player_id: string
  team_id: string
  map_name: string // 所属地图（'' = 旧数据整场合计；新录入按图拆分，BO3 = 三张图三行）
  map_count: number // 该行覆盖的地图数（按图录入时 = 1，旧场合计数据保留原值）
  kills: number // 击杀（本行覆盖地图）
  deaths: number // 死亡
  assists: number // 助攻
  headshots: number // 爆头数（兼容旧录入；新录入口径从 headshot_rate_pct * kills / 100 反算）
  headshot_rate_pct: number // 爆头率整数%（0~100，新录入 UI 录入字段）
  first_kills: number // 首杀
  multi_kills: number // 多杀
  clutches: number // 残局
  damage: number // 总伤害（兼容旧录入；新录入口径从 adr * rounds 反算）
  adr: number // 每图 ADR（小数，新录入 UI 录入字段）
  rounds: number // 局数
  we: number // 本图 WE
  rating: number // 本图 Rating
  created_at: string
  // 联表展示字段
  player_name?: string | null
  pw_username?: string | null
  team_name?: string | null
  match_group_id?: string | null // 该场比赛所属组别
  match_stage_id?: string | null
}

/** 比赛队员数据（录入表单行：不含 id/created_at，保存时后端按 match_id+map_name+player_id 覆盖）
 *  新录入口径：headshot_rate_pct（爆头率整数%）与 adr（每图平均伤害）由用户填；
 *  headshots/damage 仍落盘（按 kills * hs_rate_pct / 100、adr * rounds 反算），兼容旧排行查询。
 */
export interface MatchPlayerStatInput {
  player_id: string
  team_id: string
  map_name: string
  map_count: number
  kills: number
  deaths: number
  assists: number
  headshots: number          // 兼容旧版（= round(kills * headshot_rate_pct/100)）
  headshot_rate_pct: number  // 爆头率整数% 0~100
  first_kills: number
  multi_kills: number
  clutches: number
  damage: number             // 兼容旧版（= round(adr * rounds)）
  adr: number                // ADR 小数
  rounds: number
  we: number
  rating: number
}

export const STAGE_FORMAT_LABEL: Record<StageFormat, string> = {
  round_robin: '循环赛',
  single_elim: '单败淘汰',
  double_elim: '双败淘汰',
  swiss: '瑞士轮',
}

export const EVENT_STATUS_LABEL: Record<EventStatus, string> = {
  signup: '报名中',
  running: '进行中',
  ended: '已结束',
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

export const MEDIA_KIND_LABEL: Record<MediaKind, string> = {
  live: '直播',
  vod: '录像',
  other: '其他',
}
