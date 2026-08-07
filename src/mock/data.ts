// ============================================================
// 本地演示数据：未配置 Supabase 密钥时，API 层自动返回此处的模拟数据。
// 结构：3 个组别（传奇/大师/挑战）× 每组 4 支战队（含 1 支待审核），
//       每队 6 人名册（队长 + 5 队员），另设 12 名空闲选手供搜索测试。
// 接入真实后端后，此文件不再被引用，可整体删除。
// ============================================================
import type {
  EventItem,
  Group,
  Match,
  PlayerItem,
  PlayerStatRow,
  Stage,
  StandingsRow,
  Team,
  TeamMember,
  TeamStatRow,
} from '@/api/types'

// ---------------- 赛事（一届一届持续举办） ----------------
export const mockEvents: EventItem[] = [
  {
    id: 'event-11', name: 'HVV MAJOR 11', edition: 11, status: 'signup',
    signup_start: '2026-08-01 00:00', signup_end: '2026-08-20 23:59',
    start_at: '2026-08-22 10:00', end_at: null,
    description: 'CS2 自由约战制赛事 · 第十一届。战队自行约对手、定时间，录入后在赛程页公开展示。',
    created_at: '2026-07-25 10:00',
  },
  {
    id: 'event-10', name: 'HVV MAJOR 10', edition: 10, status: 'ended',
    signup_start: '2026-06-01 00:00', signup_end: '2026-06-20 23:59',
    start_at: '2026-06-22 10:00', end_at: '2026-07-05 22:00',
    description: 'CS2 自由约战制赛事 · 第十届。',
    created_at: '2026-05-25 10:00',
  },
  {
    id: 'event-9', name: 'HVV MAJOR 9', edition: 9, status: 'ended',
    signup_start: '2026-04-01 00:00', signup_end: '2026-04-20 23:59',
    start_at: '2026-04-22 10:00', end_at: '2026-05-05 22:00',
    description: 'CS2 自由约战制赛事 · 第九届。',
    created_at: '2026-03-25 10:00',
  },
]

// ---------------- 组别（三个组别相互独立） ----------------
export const mockGroups: Group[] = [
  { id: 'g1', name: '传奇组', sort_order: 1 },
  { id: 'g2', name: '大师组', sort_order: 2 },
  { id: 'g3', name: '挑战组', sort_order: 3 },
]

export const groupNames: Record<string, string> = {
  g1: '传奇组',
  g2: '大师组',
  g3: '挑战组',
}

export function getGroupName(id: string | null): string {
  return (id && groupNames[id]) || '-'
}

// ---------------- 战队与名册种子 ----------------
// captain / members 为 [playerId, 游戏昵称, 完美用户名]
interface TeamSeed {
  id: string
  name: string
  tag: string
  groupId: string
  status: Team['status']
  captain: [string, string, string]
  members: Array<[string, string, string]>
}

const teamSeed: TeamSeed[] = [
  // ---- 传奇组 g1 ----
  {
    id: 'team-1', name: 'Nova Velocity', tag: 'NV', groupId: 'g1', status: 'approved',
    captain: ['demo-admin', 'KillerAce', 'killerace'],
    members: [
      ['p01', 'RushB', 'rushb88'],
      ['p02', 'Headshot', 'headshot_01'],
      ['p03', 'ClutchKing', 'clutchking'],
      ['p04', 'AWPGod', 'awpgod'],
      ['p05', 'IceFox', 'icefox_cn'],
    ],
  },
  {
    id: 'team-6', name: '幽灵小队', tag: 'GH', groupId: 'g1', status: 'approved',
    captain: ['u6', 'GhostZero', 'ghostzero'],
    members: [
      ['p06', '幻影', 'huanying'],
      ['p07', '夜枭', 'yexiao'],
      ['p08', '无声', 'wusheng'],
      ['p09', '冷锋', 'lengfeng'],
      ['p10', '苍狼', 'canglang'],
    ],
  },
  {
    id: 'team-11', name: '雷霆战甲', tag: 'LT', groupId: 'g1', status: 'pending',
    captain: ['u8', '雷震', 'leizhen'],
    members: [
      ['p11', '电光', 'dianguang'],
      ['p12', '轰雷', 'honglei'],
      ['p13', '闪电', 'shandian'],
      ['p14', '雷鸣', 'leiming'],
      ['p15', '疾电', 'jidian'],
    ],
  },
  {
    id: 'team-12', name: '猎鹰战队', tag: 'FE', groupId: 'g1', status: 'approved',
    captain: ['u9', '鹰眼', 'yingyan'],
    members: [
      ['p16', '隼', 'sun_f'],
      ['p17', '羽翼', 'yuyi'],
      ['p18', '高翔', 'gaoxiang'],
      ['p19', '俯冲', 'fuchong'],
      ['p20', '盘旋', 'panxuan'],
    ],
  },

  // ---- 大师组 g2 ----
  {
    id: 'team-3', name: 'Strike Force', tag: 'SF', groupId: 'g2', status: 'approved',
    captain: ['u3', 'Bulletz', 'bulletz_cn'],
    members: [
      ['p21', 'Reaper', 'reaper_x'],
      ['p22', 'Viper', 'viper01'],
      ['p23', 'Wraith', 'wraith_ghost'],
      ['p24', 'Phantom', 'phantom_pw'],
      ['p25', 'Spike', 'spike_02'],
    ],
  },
  {
    id: 'team-4', name: '午夜行动组', tag: 'MN', groupId: 'g2', status: 'approved',
    captain: ['u4', '夜行者', 'yexingzhe'],
    members: [
      ['p26', '暗影', 'anying'],
      ['p27', '潜行', 'qianxing'],
      ['p28', '无声者', 'wushengzhe'],
      ['p29', '黑猫', 'heimao'],
      ['p30', '黄昏', 'huanghun'],
    ],
  },
  {
    id: 'team-7', name: '破晓之刃', tag: 'PZ', groupId: 'g2', status: 'pending',
    captain: ['u7', '破晓神枪', 'poxiao_sq'],
    members: [
      ['p31', '曙光', 'shuguang'],
      ['p32', '晨曦', 'chenxi'],
      ['p33', '白昼', 'baizhou'],
      ['p34', '启明', 'qiming'],
      ['p35', '向阳', 'xiangyang'],
    ],
  },
  {
    id: 'team-9', name: '钢铁洪流', tag: 'GT', groupId: 'g2', status: 'approved',
    captain: ['u10', '战车', 'zhangche'],
    members: [
      ['p36', '装甲', 'zhuangjia'],
      ['p37', '炮台', 'paotai'],
      ['p38', '铁壁', 'tiebi'],
      ['p39', '先锋', 'xianfeng'],
      ['p40', '后盾', 'houdun'],
    ],
  },

  // ---- 挑战组 g3 ----
  {
    id: 'team-2', name: '赤焰战队', tag: 'RZ', groupId: 'g3', status: 'approved',
    captain: ['demo-player', '炎龙', 'yanlong'],
    members: [
      ['p41', '烬', 'jin_2002'],
      ['p42', '烟鬼', 'yangui_smoke'],
      ['p43', '雷暴', 'leibao99'],
      ['p44', '破晓', 'poxiao'],
      ['p45', '余烬', 'yujin'],
    ],
  },
  {
    id: 'team-5', name: 'Last Bullet', tag: 'LB', groupId: 'g3', status: 'approved',
    captain: ['u5', 'SkyWalker', 'skywalker'],
    members: [
      ['p46', 'StormCaller', 'stormcaller'],
      ['p47', 'WindRider', 'windrider'],
      ['p48', 'NightHawk', 'nighthawk'],
      ['p49', 'SilverFox', 'silverfox'],
      ['p50', 'IronWill', 'ironwill'],
    ],
  },
  {
    id: 'team-10', name: '疾风电竞', tag: 'JF', groupId: 'g3', status: 'pending',
    captain: ['u11', '疾风', 'jifeng'],
    members: [
      ['p51', '迅雷', 'xunlei'],
      ['p52', '烈焰', 'lieyan'],
      ['p53', '追风', 'zhuifeng'],
      ['p54', '流星', 'liuxing'],
      ['p55', '飞燕', 'feiyan'],
    ],
  },
  {
    id: 'team-8', name: '北境狼群', tag: 'BW', groupId: 'g3', status: 'approved',
    captain: ['u12', '北狼', 'beilang'],
    members: [
      ['p56', '雪牙', 'xueya'],
      ['p57', '冰爪', 'bingzhua'],
      ['p58', '寒风', 'hanfeng'],
      ['p59', '狼王', 'langwang'],
      ['p60', '孤狼', 'gulang'],
    ],
  },
]

// 空闲选手（选手池搜索测试用，未入队）
const freePlayers: Array<[string, string, string]> = [
  ['p61', '新人小王', 'xiaowang_new'],
  ['p62', 'FreeAgent', 'freeagent'],
  ['p63', 'Apex猎手', 'apexhunter'],
  ['p64', 'NeoX', 'neox_2026'],
  ['p65', '月下独酌', 'yuexia_duzhuo'],
  ['p66', 'Blaze999', 'blaze999'],
  ['p67', '老王枪法稳', 'laowang_qfw'],
  ['p68', 'ShadowBlade', 'shadowblade'],
  ['p69', '小火龙', 'xiaohuolong'],
  ['p70', 'xX_Pro_Xx', 'xx_pro_xx'],
  ['p71', '零度咖啡', 'lingdu_kafei'],
  ['p72', 'Maverick', 'maverick'],
]

// 由种子派生：战队
const createdAt = [
  '2026-07-10 10:00', '2026-07-11 14:30', '2026-07-12 09:15', '2026-07-13 16:40',
  '2026-07-14 11:20', '2026-07-15 20:05', '2026-07-16 09:30', '2026-07-17 15:20',
  '2026-07-18 10:45', '2026-07-19 18:10', '2026-07-20 12:00', '2026-07-21 08:50',
]

export const mockTeams: Team[] = teamSeed.map((t, i) => ({
  id: t.id,
  name: t.name,
  tag: t.tag,
  captain_id: t.captain[0],
  event_id: 'event-11', // 种子战队均报名当前届（HVV MAJOR 11）
  group_id: t.groupId,
  status: t.status,
  created_at: createdAt[i % createdAt.length],
}))

const teamNames: Record<string, string> = Object.fromEntries(
  teamSeed.map((t) => [t.id, t.name]),
)

export function getTeamName(id: string | null): string {
  return (id && teamNames[id]) || '待定'
}

// 由种子派生：选手池（in_team 根据名册自动计算）
const rosterPlayerIds = new Set<string>(
  teamSeed.flatMap((t) => [t.captain[0], ...t.members.map((m) => m[0])]),
)

export const mockPlayers: PlayerItem[] = [
  ...teamSeed.flatMap((t) => [
    { id: t.captain[0], nickname: t.captain[1], pw_username: t.captain[2], in_team: true },
    ...t.members.map((m) => ({
      id: m[0], nickname: m[1], pw_username: m[2], in_team: true,
    })),
  ]),
  ...freePlayers.map(([id, nickname, pw]) => ({
    id, nickname, pw_username: pw, in_team: rosterPlayerIds.has(id) || false,
  })),
]

// 由种子派生：战队名册（队长 + 队员，队员昵称/用户名来自选手池）
const buildRoster = (t: TeamSeed): TeamMember[] => [
  {
    id: `m-${t.id}-captain`, team_id: t.id, profile_id: t.captain[0],
    nickname: t.captain[1], pw_username: t.captain[2], is_captain: true, status: 'active' as const,
  },
  ...t.members.map(([pid, nick, pw]) => ({
    id: `m-${t.id}-${pid}`, team_id: t.id, profile_id: pid,
    nickname: nick, pw_username: pw, is_captain: false, status: 'active' as const,
  })),
]

export const mockMembers: Record<string, TeamMember[]> = Object.fromEntries(
  teamSeed.map((t) => [t.id, buildRoster(t)]),
)

// ---------------- 阶段 ----------------
export const mockStages: Stage[] = [
  { id: 'stage-1', event_id: 'event-11', name: '海选 · 小组循环赛', format: 'round_robin', status: 'running', sort_order: 1, start_at: '2026-08-01 10:00', end_at: '2026-08-07 22:00' },
  { id: 'stage-2', event_id: 'event-11', name: '正赛 · 单败淘汰', format: 'single_elim', status: 'upcoming', sort_order: 2, start_at: '2026-08-15 13:00', end_at: '2026-08-16 20:00' },
  { id: 'stage-3', event_id: 'event-11', name: '瑞士轮 · 小组赛', format: 'swiss', status: 'running', sort_order: 3, start_at: '2026-08-10 10:00', end_at: '2026-08-12 22:00' },
]

// ---------------- 对阵（组内循环赛 + 跨组淘汰赛） ----------------
export const mockMatches: Match[] = [
  // 传奇组 g1
  { id: 'match-1', stage_id: 'stage-1', group_id: 'g1', round_number: 1, team_a_id: 'team-1', team_b_id: 'team-6', best_of: 1, map: 'Mirage', team_a_score: 13, team_b_score: 7, winner_id: 'team-1', status: 'completed', scheduled_at: '2026-08-01 19:00' },
  { id: 'match-2', stage_id: 'stage-1', group_id: 'g1', round_number: 1, team_a_id: 'team-12', team_b_id: 'team-1', best_of: 1, map: 'Inferno', team_a_score: 9, team_b_score: 13, winner_id: 'team-1', status: 'completed', scheduled_at: '2026-08-01 20:30' },
  { id: 'match-3', stage_id: 'stage-1', group_id: 'g1', round_number: 1, team_a_id: 'team-6', team_b_id: 'team-12', best_of: 1, map: 'Anubis', team_a_score: 11, team_b_score: 13, winner_id: 'team-12', status: 'completed', scheduled_at: '2026-08-02 19:00' },
  { id: 'match-4', stage_id: 'stage-1', group_id: 'g1', round_number: 2, team_a_id: 'team-1', team_b_id: 'team-12', best_of: 1, map: 'Nuke', team_a_score: 0, team_b_score: 0, winner_id: null, status: 'scheduled', scheduled_at: '2026-08-04 19:00' },
  // 大师组 g2
  { id: 'match-5', stage_id: 'stage-1', group_id: 'g2', round_number: 1, team_a_id: 'team-3', team_b_id: 'team-4', best_of: 1, map: 'Dust2', team_a_score: 13, team_b_score: 10, winner_id: 'team-3', status: 'completed', scheduled_at: '2026-08-01 19:00' },
  { id: 'match-6', stage_id: 'stage-1', group_id: 'g2', round_number: 1, team_a_id: 'team-3', team_b_id: 'team-9', best_of: 1, map: 'Ancient', team_a_score: 13, team_b_score: 8, winner_id: 'team-3', status: 'completed', scheduled_at: '2026-08-02 20:30' },
  { id: 'match-7', stage_id: 'stage-1', group_id: 'g2', round_number: 1, team_a_id: 'team-4', team_b_id: 'team-9', best_of: 1, map: 'Mirage', team_a_score: 9, team_b_score: 13, winner_id: 'team-9', status: 'completed', scheduled_at: '2026-08-02 19:00' },
  { id: 'match-8', stage_id: 'stage-1', group_id: 'g2', round_number: 2, team_a_id: 'team-3', team_b_id: 'team-9', best_of: 1, map: 'Overpass', team_a_score: 0, team_b_score: 0, winner_id: null, status: 'scheduled', scheduled_at: '2026-08-04 20:30' },
  // 挑战组 g3
  { id: 'match-9', stage_id: 'stage-1', group_id: 'g3', round_number: 1, team_a_id: 'team-2', team_b_id: 'team-5', best_of: 1, map: 'Nuke', team_a_score: 13, team_b_score: 9, winner_id: 'team-2', status: 'completed', scheduled_at: '2026-08-01 21:00' },
  { id: 'match-10', stage_id: 'stage-1', group_id: 'g3', round_number: 1, team_a_id: 'team-2', team_b_id: 'team-8', best_of: 1, map: 'Dust2', team_a_score: 13, team_b_score: 6, winner_id: 'team-2', status: 'completed', scheduled_at: '2026-08-02 21:00' },
  { id: 'match-11', stage_id: 'stage-1', group_id: 'g3', round_number: 1, team_a_id: 'team-5', team_b_id: 'team-8', best_of: 1, map: 'Inferno', team_a_score: 10, team_b_score: 13, winner_id: 'team-8', status: 'completed', scheduled_at: '2026-08-03 19:00' },
  { id: 'match-12', stage_id: 'stage-1', group_id: 'g3', round_number: 2, team_a_id: 'team-2', team_b_id: 'team-8', best_of: 1, map: 'Mirage', team_a_score: 0, team_b_score: 0, winner_id: null, status: 'scheduled', scheduled_at: '2026-08-05 19:00' },
  // 正赛（跨组淘汰赛）
  { id: 'match-13', stage_id: 'stage-2', group_id: null, round_number: 1, team_a_id: 'team-1', team_b_id: 'team-3', best_of: 3, map: null, team_a_score: 0, team_b_score: 0, winner_id: null, status: 'scheduled', scheduled_at: '2026-08-15 13:00' },
  // 瑞士轮（跨组，按积分相近配对；示例 3 轮 × 4 场）
  // 第 1 轮
  { id: 'match-14', stage_id: 'stage-3', group_id: null, round_number: 1, team_a_id: 'team-1', team_b_id: 'team-6', best_of: 1, map: 'Mirage', team_a_score: 13, team_b_score: 7, winner_id: 'team-1', status: 'completed', scheduled_at: '2026-08-10 19:00' },
  { id: 'match-15', stage_id: 'stage-3', group_id: null, round_number: 1, team_a_id: 'team-12', team_b_id: 'team-3', best_of: 1, map: 'Inferno', team_a_score: 10, team_b_score: 13, winner_id: 'team-3', status: 'completed', scheduled_at: '2026-08-10 19:00' },
  { id: 'match-16', stage_id: 'stage-3', group_id: null, round_number: 1, team_a_id: 'team-4', team_b_id: 'team-9', best_of: 1, map: 'Anubis', team_a_score: 9, team_b_score: 13, winner_id: 'team-9', status: 'completed', scheduled_at: '2026-08-10 20:30' },
  { id: 'match-17', stage_id: 'stage-3', group_id: null, round_number: 1, team_a_id: 'team-2', team_b_id: 'team-8', best_of: 1, map: 'Nuke', team_a_score: 13, team_b_score: 11, winner_id: 'team-2', status: 'completed', scheduled_at: '2026-08-10 20:30' },
  // 第 2 轮（1-0 与 1-0、0-1 与 0-1 之间配对）
  { id: 'match-18', stage_id: 'stage-3', group_id: null, round_number: 2, team_a_id: 'team-1', team_b_id: 'team-3', best_of: 1, map: 'Dust2', team_a_score: 13, team_b_score: 10, winner_id: 'team-1', status: 'completed', scheduled_at: '2026-08-11 19:00' },
  { id: 'match-19', stage_id: 'stage-3', group_id: null, round_number: 2, team_a_id: 'team-9', team_b_id: 'team-2', best_of: 1, map: 'Ancient', team_a_score: 8, team_b_score: 13, winner_id: 'team-2', status: 'completed', scheduled_at: '2026-08-11 19:00' },
  { id: 'match-20', stage_id: 'stage-3', group_id: null, round_number: 2, team_a_id: 'team-6', team_b_id: 'team-12', best_of: 1, map: 'Overpass', team_a_score: 11, team_b_score: 13, winner_id: 'team-12', status: 'completed', scheduled_at: '2026-08-11 20:30' },
  { id: 'match-21', stage_id: 'stage-3', group_id: null, round_number: 2, team_a_id: 'team-4', team_b_id: 'team-8', best_of: 1, map: 'Mirage', team_a_score: 7, team_b_score: 13, winner_id: 'team-8', status: 'completed', scheduled_at: '2026-08-11 20:30' },
  // 第 3 轮（2-0 / 1-1 / 0-2 分区配对）
  { id: 'match-22', stage_id: 'stage-3', group_id: null, round_number: 3, team_a_id: 'team-1', team_b_id: 'team-2', best_of: 1, map: null, team_a_score: 0, team_b_score: 0, winner_id: null, status: 'scheduled', scheduled_at: '2026-08-12 19:00' },
  { id: 'match-23', stage_id: 'stage-3', group_id: null, round_number: 3, team_a_id: 'team-3', team_b_id: 'team-9', best_of: 1, map: null, team_a_score: 0, team_b_score: 0, winner_id: null, status: 'scheduled', scheduled_at: '2026-08-12 19:00' },
  { id: 'match-24', stage_id: 'stage-3', group_id: null, round_number: 3, team_a_id: 'team-12', team_b_id: 'team-8', best_of: 1, map: 'Inferno', team_a_score: 9, team_b_score: 13, winner_id: 'team-8', status: 'completed', scheduled_at: '2026-08-12 20:30' },
  { id: 'match-25', stage_id: 'stage-3', group_id: null, round_number: 3, team_a_id: 'team-6', team_b_id: 'team-4', best_of: 1, map: 'Nuke', team_a_score: 13, team_b_score: 8, winner_id: 'team-6', status: 'completed', scheduled_at: '2026-08-12 20:30' },
]

// ---------------- 积分榜（按阶段 + 组别） ----------------
export const mockStandings: StandingsRow[] = [
  { stage_id: 'stage-1', group_id: 'g1', group_name: '传奇组', team_id: 'team-1', team_name: 'Nova Velocity', tag: 'NV', played: 2, wins: 2, losses: 0, maps_won: 26, maps_lost: 16, map_diff: 10, points: 6 },
  { stage_id: 'stage-1', group_id: 'g1', group_name: '传奇组', team_id: 'team-12', team_name: '猎鹰战队', tag: 'FE', played: 2, wins: 1, losses: 1, maps_won: 22, maps_lost: 24, map_diff: -2, points: 3 },
  { stage_id: 'stage-1', group_id: 'g1', group_name: '传奇组', team_id: 'team-6', team_name: '幽灵小队', tag: 'GH', played: 2, wins: 0, losses: 2, maps_won: 18, maps_lost: 26, map_diff: -8, points: 0 },
  { stage_id: 'stage-1', group_id: 'g2', group_name: '大师组', team_id: 'team-3', team_name: 'Strike Force', tag: 'SF', played: 2, wins: 2, losses: 0, maps_won: 26, maps_lost: 18, map_diff: 8, points: 6 },
  { stage_id: 'stage-1', group_id: 'g2', group_name: '大师组', team_id: 'team-9', team_name: '钢铁洪流', tag: 'GT', played: 2, wins: 1, losses: 1, maps_won: 21, maps_lost: 22, map_diff: -1, points: 3 },
  { stage_id: 'stage-1', group_id: 'g2', group_name: '大师组', team_id: 'team-4', team_name: '午夜行动组', tag: 'MN', played: 2, wins: 0, losses: 2, maps_won: 19, maps_lost: 26, map_diff: -7, points: 0 },
  { stage_id: 'stage-1', group_id: 'g3', group_name: '挑战组', team_id: 'team-2', team_name: '赤焰战队', tag: 'RZ', played: 2, wins: 2, losses: 0, maps_won: 26, maps_lost: 15, map_diff: 11, points: 6 },
  { stage_id: 'stage-1', group_id: 'g3', group_name: '挑战组', team_id: 'team-8', team_name: '北境狼群', tag: 'BW', played: 2, wins: 1, losses: 1, maps_won: 19, maps_lost: 23, map_diff: -4, points: 3 },
  { stage_id: 'stage-1', group_id: 'g3', group_name: '挑战组', team_id: 'team-5', team_name: 'Last Bullet', tag: 'LB', played: 2, wins: 0, losses: 2, maps_won: 19, maps_lost: 26, map_diff: -7, points: 0 },
]

// ---------------- 队伍数据排行（stage-1 为海选阶段，stage-2 尚未开赛） ----------------
const STAGE1_META = { stage_id: 'stage-1', stage_name: '海选 · 小组循环赛' } as const

export const mockTeamStats: TeamStatRow[] = [
  { team_id: 'team-1', team_name: 'Nova Velocity', tag: 'NV', group_id: 'g1', group_name: '传奇组', win_rate: 100, kd: 1.52, matches: 2, hs_rate: 48.2, pistol_win_rate: 75, first_five_win_rate: 67, avg_kills: 13.0, avg_deaths: 8.6, avg_assists: 2.5, total_kills: 26, total_deaths: 17, total_assists: 5 },
  { team_id: 'team-2', team_name: '赤焰战队', tag: 'RZ', group_id: 'g3', group_name: '挑战组', win_rate: 100, kd: 1.41, matches: 2, hs_rate: 52.0, pistol_win_rate: 67, first_five_win_rate: 50, avg_kills: 13.0, avg_deaths: 9.2, avg_assists: 2.9, total_kills: 26, total_deaths: 18, total_assists: 6 },
  { team_id: 'team-3', team_name: 'Strike Force', tag: 'SF', group_id: 'g2', group_name: '大师组', win_rate: 100, kd: 1.18, matches: 2, hs_rate: 45.6, pistol_win_rate: 60, first_five_win_rate: 50, avg_kills: 13.0, avg_deaths: 11.0, avg_assists: 2.8, total_kills: 26, total_deaths: 22, total_assists: 6 },
  { team_id: 'team-12', team_name: '猎鹰战队', tag: 'FE', group_id: 'g1', group_name: '传奇组', win_rate: 50, kd: 1.32, matches: 2, hs_rate: 50.1, pistol_win_rate: 50, first_five_win_rate: 33, avg_kills: 11.0, avg_deaths: 8.3, avg_assists: 3.0, total_kills: 22, total_deaths: 17, total_assists: 6 },
  { team_id: 'team-9', team_name: '钢铁洪流', tag: 'GT', group_id: 'g2', group_name: '大师组', win_rate: 50, kd: 1.08, matches: 2, hs_rate: 44.1, pistol_win_rate: 40, first_five_win_rate: 33, avg_kills: 10.5, avg_deaths: 9.7, avg_assists: 2.6, total_kills: 21, total_deaths: 19, total_assists: 5 },
  { team_id: 'team-8', team_name: '北境狼群', tag: 'BW', group_id: 'g3', group_name: '挑战组', win_rate: 50, kd: 1.02, matches: 2, hs_rate: 46.9, pistol_win_rate: 33, first_five_win_rate: 33, avg_kills: 9.5, avg_deaths: 9.3, avg_assists: 2.2, total_kills: 19, total_deaths: 19, total_assists: 4 },
  { team_id: 'team-4', team_name: '午夜行动组', tag: 'MN', group_id: 'g2', group_name: '大师组', win_rate: 0, kd: 0.9, matches: 2, hs_rate: 42.8, pistol_win_rate: 30, first_five_win_rate: 0, avg_kills: 9.5, avg_deaths: 10.6, avg_assists: 2.4, total_kills: 19, total_deaths: 21, total_assists: 5 },
  { team_id: 'team-6', team_name: '幽灵小队', tag: 'GH', group_id: 'g1', group_name: '传奇组', win_rate: 0, kd: 0.8, matches: 2, hs_rate: 44.6, pistol_win_rate: 25, first_five_win_rate: 0, avg_kills: 9.0, avg_deaths: 11.3, avg_assists: 2.2, total_kills: 18, total_deaths: 23, total_assists: 5 },
  { team_id: 'team-5', team_name: 'Last Bullet', tag: 'LB', group_id: 'g3', group_name: '挑战组', win_rate: 0, kd: 0.75, matches: 2, hs_rate: 44.2, pistol_win_rate: 25, first_five_win_rate: 0, avg_kills: 9.5, avg_deaths: 12.7, avg_assists: 1.8, total_kills: 19, total_deaths: 25, total_assists: 4 },
].map((r) => ({ ...r, ...STAGE1_META }))

// ---------------- 个人数据排行 ----------------
export const mockPlayerStats: PlayerStatRow[] = [
  { player_id: 'demo-admin', player_name: 'KillerAce', team_id: 'team-1', team_name: 'Nova Velocity', group_id: 'g1', group_name: '传奇组', we: 82.4, rating_pro: 1.42, win_rate: 100, kd: 2.19, matches: 2, hs_rate: 54.2, kpr: 1.08, dpr: 0.49, adr: 92.3, total_kills: 46, total_deaths: 21, total_assists: 8, fpr: 0.18, awp_kpr: 0.31 },
  { player_id: 'p02', player_name: 'Headshot', team_id: 'team-1', team_name: 'Nova Velocity', group_id: 'g1', group_name: '传奇组', we: 76.8, rating_pro: 1.31, win_rate: 100, kd: 1.71, matches: 2, hs_rate: 61.5, kpr: 0.96, dpr: 0.56, adr: 88.7, total_kills: 41, total_deaths: 24, total_assists: 11, fpr: 0.16, awp_kpr: 0.12 },
  { player_id: 'demo-player', player_name: '炎龙', team_id: 'team-2', team_name: '赤焰战队', group_id: 'g3', group_name: '挑战组', we: 74.1, rating_pro: 1.25, win_rate: 100, kd: 1.73, matches: 2, hs_rate: 52.0, kpr: 0.89, dpr: 0.51, adr: 86.1, total_kills: 38, total_deaths: 22, total_assists: 7, fpr: 0.14, awp_kpr: 0.22 },
  { player_id: 'p01', player_name: 'RushB', team_id: 'team-1', team_name: 'Nova Velocity', group_id: 'g1', group_name: '传奇组', we: 70.5, rating_pro: 1.18, win_rate: 100, kd: 1.35, matches: 2, hs_rate: 47.8, kpr: 0.82, dpr: 0.61, adr: 83.4, total_kills: 35, total_deaths: 26, total_assists: 9, fpr: 0.15, awp_kpr: 0.18 },
  { player_id: 'p41', player_name: '烬', team_id: 'team-2', team_name: '赤焰战队', group_id: 'g3', group_name: '挑战组', we: 68.9, rating_pro: 1.15, win_rate: 100, kd: 1.38, matches: 2, hs_rate: 49.3, kpr: 0.77, dpr: 0.56, adr: 81.5, total_kills: 33, total_deaths: 24, total_assists: 10, fpr: 0.13, awp_kpr: 0.15 },
  { player_id: 'u9', player_name: '鹰眼', team_id: 'team-12', team_name: '猎鹰战队', group_id: 'g1', group_name: '传奇组', we: 66.3, rating_pro: 1.12, win_rate: 50, kd: 1.32, matches: 2, hs_rate: 50.1, kpr: 0.77, dpr: 0.58, adr: 80.2, total_kills: 33, total_deaths: 25, total_assists: 10, fpr: 0.12, awp_kpr: 0.20 },
  { player_id: 'u12', player_name: '北狼', team_id: 'team-8', team_name: '北境狼群', group_id: 'g3', group_name: '挑战组', we: 65.7, rating_pro: 1.11, win_rate: 50, kd: 1.38, matches: 2, hs_rate: 49.5, kpr: 0.77, dpr: 0.56, adr: 79.8, total_kills: 33, total_deaths: 24, total_assists: 9, fpr: 0.11, awp_kpr: 0.16 },
  { player_id: 'u3', player_name: 'Bulletz', team_id: 'team-3', team_name: 'Strike Force', group_id: 'g2', group_name: '大师组', we: 63.9, rating_pro: 1.09, win_rate: 100, kd: 1.26, matches: 2, hs_rate: 45.6, kpr: 0.79, dpr: 0.63, adr: 79.1, total_kills: 34, total_deaths: 27, total_assists: 6, fpr: 0.12, awp_kpr: 0.14 },
  { player_id: 'u10', player_name: '战车', team_id: 'team-9', team_name: '钢铁洪流', group_id: 'g2', group_name: '大师组', we: 61.8, rating_pro: 1.06, win_rate: 50, kd: 1.23, matches: 2, hs_rate: 46.2, kpr: 0.74, dpr: 0.61, adr: 77.4, total_kills: 32, total_deaths: 26, total_assists: 8, fpr: 0.11, awp_kpr: 0.19 },
  { player_id: 'p16', player_name: '隼', team_id: 'team-12', team_name: '猎鹰战队', group_id: 'g1', group_name: '传奇组', we: 60.2, rating_pro: 1.05, win_rate: 50, kd: 1.15, matches: 2, hs_rate: 44.6, kpr: 0.72, dpr: 0.63, adr: 76.5, total_kills: 31, total_deaths: 27, total_assists: 7, fpr: 0.10, awp_kpr: 0.11 },
  { player_id: 'u4', player_name: '夜行者', team_id: 'team-4', team_name: '午夜行动组', group_id: 'g2', group_name: '大师组', we: 58.6, rating_pro: 1.02, win_rate: 0, kd: 1.11, matches: 2, hs_rate: 44.7, kpr: 0.72, dpr: 0.65, adr: 75.8, total_kills: 31, total_deaths: 28, total_assists: 9, fpr: 0.10, awp_kpr: 0.13 },
  { player_id: 'p21', player_name: 'Reaper', team_id: 'team-3', team_name: 'Strike Force', group_id: 'g2', group_name: '大师组', we: 56.4, rating_pro: 1.01, win_rate: 100, kd: 1.03, matches: 2, hs_rate: 43.1, kpr: 0.70, dpr: 0.67, adr: 74.9, total_kills: 30, total_deaths: 29, total_assists: 8, fpr: 0.09, awp_kpr: 0.10 },
  { player_id: 'u6', player_name: 'GhostZero', team_id: 'team-6', team_name: '幽灵小队', group_id: 'g1', group_name: '传奇组', we: 48.3, rating_pro: 0.88, win_rate: 0, kd: 0.76, matches: 2, hs_rate: 40.2, kpr: 0.61, dpr: 0.79, adr: 70.6, total_kills: 26, total_deaths: 34, total_assists: 6, fpr: 0.07, awp_kpr: 0.08 },
  { player_id: 'u5', player_name: 'SkyWalker', team_id: 'team-5', team_name: 'Last Bullet', group_id: 'g3', group_name: '挑战组', we: 44.9, rating_pro: 0.83, win_rate: 0, kd: 0.69, matches: 2, hs_rate: 39.8, kpr: 0.56, dpr: 0.82, adr: 68.3, total_kills: 24, total_deaths: 35, total_assists: 5, fpr: 0.06, awp_kpr: 0.07 },
].map((r) => ({ ...r, ...STAGE1_META }))
