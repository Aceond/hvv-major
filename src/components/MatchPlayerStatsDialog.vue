<script setup lang="ts">
// 本场队员数据录入对话框（比分录入入口的一部分）
// 自动匹配比赛双方正式队员，按「每张地图」分别登记：击杀/死亡/助攻/爆头率/首杀/多杀/残局/ADR/局数/WE/Rating。
// BO3 即三张图，每张图切换页签单独录入；
// 后台自动聚合（整个赛事期间）：
//   爆头率 = Σ(本图击杀 × 本图爆头率取整) ÷ Σ击杀
//   ADR    = Σ(本图ADR × 本图局数) ÷ Σ局数
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import type { Match, MatchPlayerStat, MatchPlayerStatInput, TeamMember } from '@/api/types'
import {
  listMatchPlayerStats,
  listMatchPlayers,
  saveMatchPlayerStats,
  purgeMatchPlayerStatsZeroRows,
} from '@/api/playerMatchStats'
import { listMatchMaps, upsertMatchMap } from '@/api/match'
import { addTeamMember } from '@/api/registration'
import {
  fetchMySteam64,
  fetchPwaMatchList,
  fetchPwaReport,
  lookupProfileBySteam64,
  cupNameMatches,
  detectPastedKind,
  parsePwaListJson,
  parsePwaReportJson,
} from '@/api/pwaImport'
import type { PwaListRecord, PwaParsedMatch, PwaPlayer } from '@/api/pwaImport'

const props = defineProps<{ modelValue: boolean; match: Match | null }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void; (e: 'saved'): void }>()

const visible = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
})

interface PlayerRow extends MatchPlayerStatInput {
  player_name: string
  pw_username: string | null
  steam_id?: string | null // Steam64 位 ID（PWA 自动导入按此匹配）
  team_name: string
  status?: 'active' | 'benched'
}

const players = ref<TeamMember[]>([])
/** 地图页签列表：优先使用已录入的逐图比分地图名（Mirage / Inferno …），未录时按赛制生成「地图 N」 */
const maps = ref<{ key: string; label: string }[]>([])
const activeMap = ref('')
/** 每张地图对应的队员数据行 */
const byMap = ref<Record<string, PlayerRow[]>>({})
const loading = ref(false)
const saving = ref(false)

watch(
  () => [props.modelValue, props.match?.id] as const,
  async ([open, matchId]) => {
    if (!open || !matchId) return
    await load(matchId)
    await prefillSteam64() // 预填 PWA 面板：当前登录用户报名表里的 Steam64
  },
)

/** 本场地图数：BO1 = 1；BO3 = 赛制 3（有逐图比分时按已录张数，最多补齐到赛制数） */
function resolveMapCount(m: Match): number {
  if (m.best_of <= 1) return 1
  return Math.max(1, m.best_of)
}

/** 从已存行推导要回填的爆头率整数%（优先读新列 headshot_rate_pct；没值则用 headshots/kills 反推） */
function resolveHsRate(ex: MatchPlayerStat | undefined, kills: number): number {
  if (!ex) return 0
  if (Number(ex.headshot_rate_pct) > 0) return Number(ex.headshot_rate_pct)
  const k = Number(ex.kills) || kills || 0
  if (k <= 0) return 0
  return Math.round(((Number(ex.headshots) || 0) / k) * 100)
}
/** 推导回填 ADR（优先读新列 adr；没值则 damage/rounds） */
function resolveAdr(ex: MatchPlayerStat | undefined, rounds: number): number {
  if (!ex) return 0
  if (Number(ex.adr) > 0) return Number(ex.adr)
  const rnd = Number(ex.rounds) || rounds || 0
  if (rnd <= 0) return 0
  return Math.round(((Number(ex.damage) || 0) / rnd) * 100) / 100
}

async function load(matchId: string) {
  const m = props.match
  if (!m) return
  loading.value = true
  try {
    players.value = await listMatchPlayers(m.team_a_id, m.team_b_id)
    const [existing, mapsData] = await Promise.all([
      listMatchPlayerStats(matchId),
      listMatchMaps([matchId]),
    ])
    // 把逐图比分 match_maps → 按位置索引得到 rounds=胜+负 之和，后面按页签位置回填 rounds 默认值
    const mapRoundsByIndex: number[] = []
    const mapRoundsByName: Record<string, number> = {}
    const mapsScored = mapsData
      .filter((mp) => mp.match_id === matchId)
      .sort((a, b) => (a.map_count || 0) - (b.map_count || 0))
    for (const mp of mapsScored) {
      const r = (Number(mp.team_a_score) || 0) + (Number(mp.team_b_score) || 0)
      mapRoundsByIndex.push(r)
      if (mp.map_name) mapRoundsByName[mp.map_name] = r
    }

    const filledMaps = mapsData.filter((mp) => mp.team_a_score > 0 || mp.team_b_score > 0)
    const mapNames = filledMaps.map((mp) => mp.map_name).filter(Boolean)
    const n = resolveMapCount(m)
    const keys: string[] = []
    for (let i = 0; i < n; i++) keys.push(mapNames[i] ?? `地图${i + 1}`)
    maps.value = keys.map((key, idx) => {
      const autoRounds = mapRoundsByName[key] ?? mapRoundsByIndex[idx] ?? 0
      return {
        key,
        label:
          (key.startsWith('地图') ? `${key}（待录入逐图比分）` : key) +
          (autoRounds > 0 ? ` · 对局数自动填充 = ${autoRounds}` : ''),
      }
    })
    activeMap.value = keys[0]

    // 旧数据（map_name 为空 = 整场合计）归入第一张图页签展示，避免丢失
    const groupByMap = (list: MatchPlayerStat[]) => {
      const g = new Map<string, MatchPlayerStat[]>()
      for (const s of list) {
        const k = s.map_name || keys[0] || ''
        ;(g.get(k) ?? g.set(k, []).get(k)!).push(s)
      }
      return g
    }
    const grouped = groupByMap(existing)
    const teamA = m.team_a_name ?? 'A 队'
    const teamB = m.team_b_name ?? 'B 队'
    const nextByMap: Record<string, PlayerRow[]> = {}
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]
      const autoRounds = mapRoundsByName[key] ?? mapRoundsByIndex[i] ?? 0
      const map = new Map(grouped.get(key)?.map((e) => [e.player_id, e]) ?? [])
      nextByMap[key] = players.value.map((p) => {
        const ex = map.get(p.profile_id)
        const kills = ex?.kills ?? 0
        // rounds：已存值优先；否则用逐图比分自动推算；BO1 无逐图比分时 0
        const rounds = ex && Number(ex.rounds) > 0 ? Number(ex.rounds) : autoRounds
        return {
          player_id: p.profile_id,
          team_id: p.team_id,
          map_name: key,
          map_count: 1, // 每行 = 一张地图
          kills,
          deaths: ex?.deaths ?? 0,
          assists: ex?.assists ?? 0,
          headshot_rate_pct: resolveHsRate(ex, kills),
          headshots: Math.round((kills * resolveHsRate(ex, kills)) / 100), // 兼容旧列
          first_kills: ex?.first_kills ?? 0,
          multi_kills: ex?.multi_kills ?? 0,
          clutches: ex?.clutches ?? 0,
          adr: resolveAdr(ex, rounds),
          damage: Math.round(resolveAdr(ex, rounds) * rounds), // 兼容旧列
          rounds,
          we: ex?.we ?? 0,
          rating: ex?.rating ?? 0,
          player_name: p.nickname ?? p.pw_username ?? '未命名',
          pw_username: p.pw_username,
          steam_id: p.steam_id ?? null,
          team_name: p.team_id === m.team_a_id ? teamA : p.team_id === m.team_b_id ? teamB : '-',
          status: p.status,
        }
      })
    }
    byMap.value = nextByMap
  } finally {
    loading.value = false
  }
}

/** 保存：逐张地图分别覆盖保存；自动跳过「未参赛」队员（使用逐图比分默认 rounds 且所有统计均为 0 的队员），避免全 0 行干扰汇总 */
async function save() {
  const m = props.match
  if (!m) return
  saving.value = true
  try {
    // 先为本场每图计算一次 rounds 自动默认值（逐图比分的胜+负），用来判断「队员是否手动改过 rounds」
    const mapsData = await listMatchMaps([m.id])
    const autoRoundsByIndex: number[] = []
    const autoRoundsByName: Record<string, number> = {}
    const mapsScored = mapsData
      .filter((mp) => mp.match_id === m.id)
      .sort((a, b) => (a.map_count || 0) - (b.map_count || 0))
    for (const mp of mapsScored) {
      const r = (Number(mp.team_a_score) || 0) + (Number(mp.team_b_score) || 0)
      autoRoundsByIndex.push(r)
      if (mp.map_name) autoRoundsByName[mp.map_name] = r
    }
    const keys = maps.value.map((x) => x.key)

    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]
      const rowsRaw = byMap.value[key].map((r) => {
        // 保存前最终反算：headshots/damage 按新口径重算一次（用户改了 kills 或 rounds 也跟着变）
        const k = Number(r.kills) || 0
        const rnd = Number(r.rounds) || 0
        const hsRate = Math.max(0, Math.min(100, Math.round(Number(r.headshot_rate_pct) || 0)))
        const adr = Math.max(0, Math.round((Number(r.adr) || 0) * 100) / 100)
        const headshots = Math.round((k * hsRate) / 100)
        const damage = Math.round(adr * rnd)
        return { ...r, headshot_rate_pct: hsRate, adr, headshots, damage } as PlayerRow
      })
      const autoRounds = autoRoundsByName[key] ?? autoRoundsByIndex[i] ?? 0
      // 只保存「实际参加了本图」的队员：
      //   1) 任意统计列（K/D/A/首杀/多杀/残局/ADR/爆头率/WE/Rating）有非 0 值
      //   或 2) rounds 与逐图比分自动推算的默认值不一致（比如替补只打了 4 局，管理员手动把 rounds 改成 4 且其它为 0）
      const rows = rowsRaw.filter((r) => {
        const rnd = Number(r.rounds) || 0
        const hsRate = Number(r.headshot_rate_pct) || 0
        const anyStat =
          (Number(r.kills) || 0) +
          (Number(r.deaths) || 0) +
          (Number(r.assists) || 0) +
          (Number(r.first_kills) || 0) +
          (Number(r.multi_kills) || 0) +
          (Number(r.clutches) || 0) +
          hsRate +
          (Number(r.adr) || 0) +
          (Number(r.we) || 0) +
          (Number(r.rating) || 0)
        const roundsTouched = autoRounds > 0 ? rnd !== autoRounds : rnd > 0
        return anyStat > 0 || roundsTouched
      })
      await saveMatchPlayerStats(
        m.id,
        key,
        rows.map(({
          player_id, team_id, map_name, map_count,
          kills, deaths, assists,
          headshot_rate_pct, headshots,
          first_kills, multi_kills, clutches,
          adr, damage, rounds, we, rating,
        }) => ({
          player_id, team_id, map_name, map_count,
          kills, deaths, assists,
          headshot_rate_pct, headshots,
          first_kills, multi_kills, clutches,
          adr, damage, rounds, we, rating,
        })),
      )
    }
    const purged = await purgeMatchPlayerStatsZeroRows(m.id)
    ElMessage.success(
      purged > 0
        ? `本场队员数据已保存（自动清理 ${purged} 条未参赛幽灵行/旧空名行；后台自动重算爆头率/ADR）`
        : '本场队员数据已保存（未参赛的 0 行已自动跳过/删除；后台自动重算爆头率/ADR）',
    )
    visible.value = false
    emit('saved')
  } catch (e: any) {
    ElMessage.error(e?.message || '保存失败，请检查权限')
  } finally {
    saving.value = false
  }
}

// ============ PWA 自动导入（完美对战平台） ============
// 流程：填 token + Steam64 → 拉「我的对局」列表 → 勾选 → 逐个拉 report 构建预览（二次确认）
//   → 确认后按地图写比分（upsert_match_map RPC）+ 按 Steam64 自动匹配队员数据并保存。
const pwaOpen = ref<string[]>([]) // 导入面板展开（el-collapse 的 active names）
const pwaToken = ref('')
const pwaSteam64 = ref('')
const pwaCupFilter = ref('hwcsmajor11')
const pwaAutoBench = ref(true) // 对局中出现但不在本队名册的选手，自动设为该队替补
const pwaListLoading = ref(false)
const pwaList = ref<PwaListRecord[]>([])
const pwaListChecked = ref<Record<string, boolean>>({})
const pwaFetching = ref(false)
const pwaPreviewVisible = ref(false)
const pwaPreview = ref<PwaPreviewItem[]>([])
const pwaImporting = ref(false)
const pwaPasteText = ref('')
const pwaPasteVisible = ref(false)
const pwaTokenHintVisible = ref(false)

// token / Steam64 持久化：队长填一次后，下次打开对话框自动保留
const PWA_TOKEN_KEY = 'hvv.pwa.token'
const PWA_STEAM64_KEY = 'hvv.pwa.steam64'
watch(
  [pwaToken, pwaSteam64],
  ([t, s]) => {
    try {
      localStorage.setItem(PWA_TOKEN_KEY, t)
      localStorage.setItem(PWA_STEAM64_KEY, s)
    } catch {
      /* 忽略 localStorage 不可用 */
    }
  },
  { immediate: true },
)

/** 预览项：一场 PWA 对局（= 一张地图）的二次确认信息 */
interface PwaPreviewItem {
  match: PwaParsedMatch
  checked: boolean
  isTarget: boolean // 第三方 + 赛事名匹配过滤条件
  aScore: number | null
  bScore: number | null
  matched: number // 按 Steam64 匹配到的 HVV 队员数
  total: number
  mapKey: string
  note: string
  players: PwaPreviewPlayer[]
}
interface PwaPreviewPlayer {
  nick: string | null
  steam64: string
  teamId: string | null // PWA 侧战队 id（用于判定应加入哪支 HVV 队）
  hvName: string | null // 匹配到的 HVV 队员名
  hvTeam: string | null
  kills: number
  deaths: number
  assists: number
  hsPct: number
  adr: number
  rating: number
  matched: boolean
  // 自动替补：对局里有、但不在本队名册的 HVV 账号，确认导入时自动加入对应队替补
  autoAdd?: {
    profileId: string
    nickname: string | null
    teamId: string
    teamName: string | null
    enabled: boolean
  } | null
}

/** 预填 token / Steam64：先取上次保存（localStorage），再读当前登录用户报名表里的 steam_id */
async function prefillSteam64() {
  try {
    const savedToken = localStorage.getItem(PWA_TOKEN_KEY)
    const savedSteam = localStorage.getItem(PWA_STEAM64_KEY)
    if (savedToken && !pwaToken.value) pwaToken.value = savedToken
    if (savedSteam && !pwaSteam64.value) pwaSteam64.value = savedSteam
  } catch {
    /* 忽略 localStorage 不可用 */
  }
  if (pwaSteam64.value.trim()) return
  try {
    const sid = await fetchMySteam64()
    if (sid) pwaSteam64.value = sid
  } catch {
    /* 忽略：未配置 Supabase 或未报名时留空让队长手填 */
  }
}

async function loadPwaList() {
  const token = pwaToken.value.trim()
  const sid = pwaSteam64.value.trim()
  if (!token || !sid) {
    ElMessage.warning('请先填写 PWA token 与 Steam64 位 ID')
    return
  }
  pwaListLoading.value = true
  try {
    const list = await fetchPwaMatchList(token, sid, 20)
    pwaList.value = list
    const checked: Record<string, boolean> = {}
    for (const r of list) checked[r.match] = true
    pwaListChecked.value = checked
    if (list.length === 0) ElMessage.info('未拉取到对局记录（token 可能已过期，请重新获取）')
    else ElMessage.success(`已拉取 ${list.length} 条对局，请勾选本场需要导入的地图`)
  } catch (e: any) {
    ElMessage.error(e?.message || '拉取对局列表失败')
  } finally {
    pwaListLoading.value = false
  }
}

/** 按 Steam64 把 PWA 两边的 PWA team_id 映射到 HVV 的 team_a / team_b，得到本图双方比分 */
function resolveTeamScores(match: PwaParsedMatch): { aScore: number | null; bScore: number | null } {
  const m = props.match
  if (!m) return { aScore: null, bScore: null }
  const hvBySteam = new Map<string, string>() // steam64 -> HVV team_id
  for (const pl of players.value) if (pl.steam_id) hvBySteam.set(pl.steam_id, pl.team_id)
  const pwaTeamToHv: Record<string, string> = {}
  for (const p of match.players) {
    const hv = p.steam64 ? hvBySteam.get(p.steam64) : undefined
    if (hv && p.teamId && !pwaTeamToHv[p.teamId]) pwaTeamToHv[p.teamId] = hv
  }
  let aPwa: string | null = null
  let bPwa: string | null = null
  for (const [pt, hv] of Object.entries(pwaTeamToHv)) {
    if (hv === m.team_a_id) aPwa = pt
    if (hv === m.team_b_id) bPwa = pt
  }
  if (!aPwa || !bPwa) return { aScore: null, bScore: null }
  return { aScore: match.score[aPwa] ?? 0, bScore: match.score[bPwa] ?? 0 }
}

/** PWA team_id -> HVV team_id（基于本场名册已匹配选手推断） */
function pwaTeamToHvMap(match: PwaParsedMatch): Record<string, string> {
  const hvBySteam = new Map<string, string>()
  for (const pl of players.value) if (pl.steam_id) hvBySteam.set(pl.steam_id, pl.team_id)
  const map: Record<string, string> = {}
  for (const p of match.players) {
    const hv = p.steam64 ? hvBySteam.get(p.steam64) : undefined
    if (hv && p.teamId && !map[p.teamId]) map[p.teamId] = hv
  }
  return map
}

/**
 * 自动替补探测：对局里有、但不在本队名册的选手，若其 Steam64 在 HVV 有账号，
 * 则标记「可自动设为对应队替补」（确认导入时执行，RLS 允许队长/管理员加名册）。
 */
async function enrichAutoAdd(item: PwaPreviewItem) {
  const m = props.match
  if (!m) return
  const rosterIds = new Set(players.value.map((p) => p.profile_id))
  const teamNameOf = (tid: string) =>
    tid === m.team_a_id ? (m.team_a_name ?? 'A 队') : tid === m.team_b_id ? (m.team_b_name ?? 'B 队') : null
  const pwaToHv = pwaTeamToHvMap(item.match)
  for (const pp of item.players) {
    if (pp.matched || !pp.steam64) continue
    const prof = await lookupProfileBySteam64(pp.steam64).catch(() => null)
    if (!prof) continue
    if (rosterIds.has(prof.id)) continue // 已在名册（active/benched），不需要加
    const hvTeamId = pp.teamId ? pwaToHv[pp.teamId] : undefined
    if (!hvTeamId) continue // 无法判定归属战队，跳过
    pp.autoAdd = {
      profileId: prof.id,
      nickname: prof.nickname ?? prof.pw_username,
      teamId: hvTeamId,
      teamName: teamNameOf(hvTeamId),
      enabled: true,
    }
  }
}

function buildPreviewItem(match: PwaParsedMatch): PwaPreviewItem {
  const m = props.match
  const filter = pwaCupFilter.value.trim()
  const isTarget = match.isThirdParty && cupNameMatches(match.cupName, filter)
  const { aScore, bScore } = resolveTeamScores(match)

  const hvBySteam = new Map<string, TeamMember>()
  for (const pl of players.value) if (pl.steam_id) hvBySteam.set(pl.steam_id, pl)
  const pps: PwaPreviewPlayer[] = match.players.map((p) => {
    const hv = p.steam64 ? hvBySteam.get(p.steam64) : undefined
    return {
      nick: p.nick,
      steam64: p.steam64,
      teamId: p.teamId,
      hvName: hv ? (hv.nickname ?? hv.pw_username ?? null) : null,
      hvTeam: hv
        ? hv.team_id === m?.team_a_id
          ? (m?.team_a_name ?? 'A 队')
          : hv.team_id === m?.team_b_id
            ? (m?.team_b_name ?? 'B 队')
            : null
        : null,
      kills: p.kills,
      deaths: p.deaths,
      assists: p.assists,
      hsPct: p.headshotRatePct,
      adr: p.adr,
      rating: p.rating,
      matched: !!hv,
    }
  })
  const matched = pps.filter((p) => p.matched).length

  let note = ''
  if (!match.isThirdParty) note = '非第三方赛事（天梯/约战外的局）'
  else if (!isTarget) note = `赛事「${match.cupName ?? '-'}」与过滤条件不符`
  if (aScore == null || bScore == null) note = (note ? note + '；' : '') + '无法识别双方战队归属（比分不自动写入）'

  return {
    match,
    checked: isTarget && aScore != null && bScore != null && matched > 0,
    isTarget,
    aScore,
    bScore,
    matched,
    total: match.players.length,
    mapKey: match.mapLabel,
    note,
    players: pps,
  }
}

/** 勾选列表中的对局 → 逐个拉 report → 构建预览（二次确认对话框） */
async function previewSelected() {
  const token = pwaToken.value.trim()
  const selected = pwaList.value.filter((r) => pwaListChecked.value[r.match])
  if (selected.length === 0) {
    ElMessage.warning('请先勾选对局')
    return
  }
  if (selected.length > 8) {
    ElMessage.warning('一次最多预览 8 场，请分批操作')
    return
  }
  pwaFetching.value = true
  const items: PwaPreviewItem[] = []
  const failed: string[] = []
  try {
    for (const r of selected) {
      try {
        const match = await fetchPwaReport(r.match, token)
        const item = buildPreviewItem(match)
        await enrichAutoAdd(item) // 探测「不在名册但可自动设为替补」的选手
        items.push(item)
      } catch {
        failed.push(r.match)
      }
    }
    items.sort((a, b) => Number(b.isTarget) - Number(a.isTarget))
    pwaPreview.value = items
    pwaPreviewVisible.value = true
    if (failed.length) ElMessage.warning(`以下对局拉取失败，已跳过：${failed.join('、')}`)
  } finally {
    pwaFetching.value = false
  }
}

/** 把 PWA 选手数据按 Steam64 覆盖到某张地图的录入行 */
function applyPwaToRows(mapKey: string, match: PwaParsedMatch) {
  const rows = byMap.value[mapKey]
  if (!rows) return
  const steamToPwa = new Map<string, PwaPlayer>()
  for (const p of match.players) if (p.steam64) steamToPwa.set(p.steam64, p)
  for (const row of rows) {
    const pwa = row.steam_id ? steamToPwa.get(row.steam_id) : undefined
    if (!pwa) continue
    row.kills = pwa.kills
    row.deaths = pwa.deaths
    row.assists = pwa.assists
    row.headshot_rate_pct = pwa.headshotRatePct
    row.headshots = pwa.headshots
    row.first_kills = pwa.firstKills
    row.multi_kills = pwa.multiKills
    row.clutches = pwa.clutches
    row.adr = pwa.adr
    row.damage = pwa.damage
    row.rounds = pwa.rounds
    row.we = pwa.we
    row.rating = pwa.rating
  }
}

/** 二次确认 → 写比分 + 填数据 + 保存 */
async function confirmPwaImport() {
  const m = props.match
  if (!m) return
  const items = pwaPreview.value.filter((it) => it.checked)
  if (items.length === 0) {
    ElMessage.warning('未勾选任何可导入的对局')
    return
  }
  // 同一张图只允许导入一场（(match_id, map_count) 唯一约束），避免覆盖冲突
  const seen = new Set<string>()
  for (const it of items) {
    if (seen.has(it.match.mapLabel)) {
      ElMessage.warning(`「${it.match.mapLabel}」出现多场，请只勾选一场`)
      return
    }
    seen.add(it.match.mapLabel)
  }
  pwaImporting.value = true
  try {
    // 0) 自动设为替补：对局里有、但不在本队名册的 HVV 账号，加入对应队替补（队长/管理员 RLS 允许）
    const toAdd: Array<{ teamId: string; profileId: string; nickname: string | null }> = []
    const seenAdd = new Set<string>()
    for (const it of items) {
      for (const pp of it.players) {
        const aa = pp.autoAdd
        if (!aa?.enabled || !aa.teamId) continue
        if (seenAdd.has(aa.profileId)) continue
        seenAdd.add(aa.profileId)
        if (players.value.some((pl) => pl.profile_id === aa.profileId)) continue // 已在名册则跳过
        toAdd.push({ teamId: aa.teamId, profileId: aa.profileId, nickname: aa.nickname })
      }
    }
    let addedBench = 0
    for (const a of toAdd) {
      await addTeamMember(a.teamId, a.profileId, 'benched')
      addedBench++
    }
    if (addedBench > 0) ElMessage.success(`已将 ${addedBench} 名对局内选手自动设为替补（${toAdd.map((x) => x.nickname ?? '').filter(Boolean).join('、')}）`)

    // 1) 逐图比分写入（顺序 = 勾选顺序，map_count 从 1 递增，自动重算总比分）
    for (let i = 0; i < items.length; i++) {
      const it = items[i]
      await upsertMatchMap(m.id, i + 1, it.match.mapLabel, it.aScore ?? 0, it.bScore ?? 0)
    }
    // 2) 重载表格 → 页签变为真实地图名（此时 match_maps 已写入，名册含新替补）
    await load(m.id)
    // 3) 按 Steam64 把 PWA 选手数据覆盖到对应地图行
    for (let i = 0; i < items.length; i++) {
      const it = items[i]
      const key =
        maps.value.find((x) => x.key === it.match.mapLabel)?.key ?? maps.value[i]?.key
      if (key) applyPwaToRows(key, it.match)
    }
    pwaPreviewVisible.value = false
    pwaOpen.value = []
    // 4) 保存（覆盖该图旧数据 + 清理未参赛 0 行）
    await save()
  } catch (e: any) {
    ElMessage.error(e?.message || '导入失败')
  } finally {
    pwaImporting.value = false
  }
}

/** 粘贴 JSON 回退（未部署代理 / 拉列表失败时）：支持「对局列表」或「单场 report」 */
async function applyPasteJson() {
  const text = pwaPasteText.value.trim()
  if (!text) return
  try {
    const kind = detectPastedKind(text)
    if (kind === 'list') {
      const list = parsePwaListJson(text)
      pwaList.value = list
      const checked: Record<string, boolean> = {}
      for (const r of list) checked[r.match] = true
      pwaListChecked.value = checked
      ElMessage.success(`已识别对局列表（${list.length} 条），请在下方勾选后点「预览所选对局」`)
      pwaPasteVisible.value = false
    } else if (kind === 'report') {
      const item = buildPreviewItem(parsePwaReportJson(text))
      pwaPreview.value = [item]
      pwaPreviewVisible.value = true
      pwaPasteVisible.value = false
    } else {
      ElMessage.error('无法识别 JSON：请粘贴「对局列表」或「单场 report」数据')
    }
  } catch (e: any) {
    ElMessage.error(`JSON 解析失败：${e?.message}`)
  }
}

const numCols = [
  { key: 'kills', label: '击杀', tip: '本图击杀数（参与爆头率加权：Σ 击杀 × 爆头率）' },
  { key: 'deaths', label: '死亡', tip: '' },
  { key: 'assists', label: '助攻', tip: '' },
  { key: 'headshot_rate_pct', label: '爆头率%', tip: '本图爆头率(整数 0~100)。赛事合计爆头率=Σ(击杀×爆头率取整)/Σ击杀' },
  { key: 'first_kills', label: '首杀', tip: '本图首杀' },
  { key: 'multi_kills', label: '多杀', tip: '本图多杀' },
  { key: 'clutches', label: '残局', tip: '本图残局' },
  { key: 'rounds', label: '局数', tip: '本图局数（ADR 合计权重）' },
] as const
const decCols = [
  { key: 'adr', label: 'ADR', tip: '本图平均伤害（小数）。赛事合计ADR=Σ(ADR×局数)/Σ局数' },
  { key: 'we', label: 'WE', tip: '本图 WE（排行页场均 = Σ/场次数）' },
  { key: 'rating', label: 'Rating', tip: '本图 Rating（排行页场均 = Σ/场次数）' },
] as const
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="`本场队员数据${match ? '：' + (match.team_a_name ?? '') + ' vs ' + (match.team_b_name ?? '') : ''}`"
    width="1220px"
    top="6vh"
  >
    <el-alert
      type="info"
      :closable="false"
      class="tip"
      title="按「每图」录入：爆头改为【爆头率整数%】，伤害改为【ADR平均伤害】。局数已按逐图比分自动填入（胜+负），仅实际参加本图的队员（rounds>0 或有统计）会被保存，未参赛的全 0 行自动跳过。赛事期间自动按加权公式聚合：爆头率 = Σ(本图击杀×本图爆头率取整) ÷ Σ击杀；ADR = Σ(本图ADR×本图局数) ÷ Σ局数。"
    />

    <el-collapse v-model="pwaOpen" class="pwa-collapse">
      <el-collapse-item name="pwa">
        <template #title>
          <span class="pwa-title">从完美对战平台（PWA）自动导入本场战绩</span>
        </template>
        <div class="pwa-box">
          <div class="pwa-row">
            <el-input v-model="pwaToken" placeholder="PWA access_token" show-password clearable class="pwa-token" />
            <el-input v-model="pwaSteam64" placeholder="Steam64 位 ID（如 76561198...）" clearable class="pwa-steam" />
            <el-input v-model="pwaCupFilter" placeholder="赛事名过滤（默认 hwcsmajor11）" clearable class="pwa-cup" />
            <el-button type="primary" :loading="pwaListLoading" @click="loadPwaList">拉取我的对局</el-button>
            <el-tooltip content="对局中出现但不在本队名册的选手，若其 Steam64 在本平台有账号，确认导入时自动加入对应战队作为替补" placement="top">
              <el-switch v-model="pwaAutoBench" inline-prompt active-text="自动替补" inactive-text="自动替补" />
            </el-tooltip>
          </div>
          <div class="pwa-row">
            <el-button text type="primary" size="small" @click="pwaTokenHintVisible = !pwaTokenHintVisible">
              {{ pwaTokenHintVisible ? '收起' : '查看' }} token 与 Steam64 获取方法
            </el-button>
            <el-button text type="primary" size="small" @click="pwaPasteVisible = !pwaPasteVisible">
              {{ pwaPasteVisible ? '收起' : '展开' }}粘贴 JSON 导入（拉列表不可用时）
            </el-button>
          </div>
          <el-alert
            v-if="pwaTokenHintVisible"
            type="info"
            :closable="false"
            class="pwa-hint"
            title="1. 打开 https://partner.wmpvp.com/#/login 登录完美对战平台。
            2. 手机号登录：登录后按 F12 → Application → Cookies，读取 access_token 的值；Steam 登录：登录完成后从浏览器地址栏复制 token 参数（URL 形如 …/login?state=appAdmin&token=YOUR_ACCESS_TOKEN）。
            3. Steam64 位 ID 即 Steam 个人资料链接中的数字（如 76561198…），可在我方「个人选手审核」后台查看/修改。
            4. token 会过期，失效后重新登录获取即可。"
          />
          <div v-if="pwaPasteVisible" class="pwa-paste">
            <el-input v-model="pwaPasteText" type="textarea" :rows="3" placeholder="粘贴「对局列表」或「单场 report」的 JSON…" />
            <el-button size="small" type="primary" @click="applyPasteJson">解析并导入</el-button>
          </div>
          <el-table v-if="pwaList.length" :data="pwaList" size="small" max-height="220" class="pwa-list">
            <el-table-column width="46">
              <template #default="{ row }">
                <el-checkbox v-model="pwaListChecked[row.match]" />
              </template>
            </el-table-column>
            <el-table-column label="时间" width="150">
              <template #default="{ row }">{{ row.date ?? '-' }}</template>
            </el-table-column>
            <el-table-column label="我的 K/D" width="100">
              <template #default="{ row }">{{ row.kill ?? '-' }} / {{ row.death ?? '-' }}</template>
            </el-table-column>
            <el-table-column prop="rating" label="Rating" width="90" />
            <el-table-column label="昵称" min-width="140">
              <template #default="{ row }">{{ row.steam_nick ?? row.user_id ?? '-' }}</template>
            </el-table-column>
          </el-table>
          <div v-if="pwaList.length" class="pwa-actions">
            <el-button type="primary" :loading="pwaFetching" @click="previewSelected">预览所选对局（拉取详情）</el-button>
            <span class="pwa-tip">勾选本场要导入的地图（每场 = 一张图），一次最多 8 场</span>
          </div>
        </div>
      </el-collapse-item>
    </el-collapse>

    <el-tabs v-model="activeMap">
      <el-tab-pane v-for="mp in maps" :key="mp.key" :name="mp.key">
        <template #label>
          <span class="map-tab-label">{{ mp.label }}</span>
        </template>
        <el-table v-loading="loading" :data="byMap[mp.key] ?? []" stripe size="small" max-height="52vh">
          <el-table-column label="选手" min-width="150" fixed>
            <template #default="{ row }">
              <span class="player-name">{{ row.player_name }}</span>
              <el-tag
                v-if="row.status === 'benched'"
                type="primary"
                size="small"
                effect="plain"
                round
                class="benched-tag"
              >替补</el-tag>
              <el-tag
                v-else-if="row.status === 'active'"
                type="success"
                size="small"
                effect="plain"
                round
                class="benched-tag"
              >首发</el-tag>
              <div>
                <span v-if="row.pw_username" class="pw">{{ row.pw_username }}</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column prop="team_name" label="战队" min-width="110" fixed />
          <el-table-column v-for="c in numCols" :key="c.key" :label="c.label" :width="c.key === 'headshot_rate_pct' ? 100 : 84" :show-overflow-tooltip="!!c.tip">
            <template #header>
              <el-tooltip :content="c.tip || c.label" placement="top">
                <span>{{ c.label }}</span>
              </el-tooltip>
            </template>
            <template #default="{ row }">
              <el-input-number
                v-model="row[c.key]"
                :min="c.key === 'headshot_rate_pct' ? 0 : 0"
                :max="c.key === 'headshot_rate_pct' ? 100 : undefined"
                size="small"
                :controls="false"
                class="cell-input"
              />
            </template>
          </el-table-column>
          <el-table-column v-for="c in decCols" :key="c.key" :label="c.label" width="96">
            <template #header>
              <el-tooltip :content="c.tip" placement="top">
                <span>{{ c.label }}</span>
              </el-tooltip>
            </template>
            <template #default="{ row }">
              <el-input-number v-model="row[c.key]" :min="0" :precision="2" size="small" :controls="false" class="cell-input" />
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>
    </el-tabs>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="saving" @click="save">保存全部地图数据</el-button>
    </template>
  </el-dialog>

  <!-- PWA 自动导入：二次确认（每场 = 一张地图） -->
  <el-dialog
    v-model="pwaPreviewVisible"
    title="二次确认：导入以下对局（每场 = 一张地图）"
    width="1100px"
    top="6vh"
    append-to-body
  >
    <el-alert
      type="warning"
      :closable="false"
      class="tip"
      title="仅勾选的项会被导入：比分将写入「逐图比分」并自动重算总比分，选手数据按 Steam64 位 ID 自动匹配填充（未匹配的选手需确认其 steam_id 是否正确，可稍后手动补录）。对局中出现但不在名册、且在本平台有账号的选手，可在展开行里勾选「自动设为替补」（需开启上方自动替补开关）。勾选顺序 = 地图顺序。"
    />
    <el-table :data="pwaPreview" size="small" max-height="58vh" row-key="match.matchId">
      <el-table-column type="expand">
        <template #default="{ row }">
          <el-table :data="row.players" size="small" class="pwa-preview-players">
            <el-table-column label="PWA 昵称" min-width="150">
              <template #default="{ row: p }">{{ p.nick ?? '-' }}</template>
            </el-table-column>
            <el-table-column label="Steam64" min-width="170">
              <template #default="{ row: p }">{{ p.steam64 }}</template>
            </el-table-column>
            <el-table-column label="匹配到 HVV 选手" min-width="200">
              <template #default="{ row: p }">
                <el-tag v-if="p.matched" type="success" size="small" effect="plain">
                  {{ p.hvName ?? '-' }}{{ p.hvTeam ? '（' + p.hvTeam + '）' : '' }}
                </el-tag>
                <div v-else-if="p.autoAdd" class="auto-add-cell">
                  <el-checkbox v-model="p.autoAdd.enabled" size="small" />
                  <div>
                    <span class="auto-add-label">自动设为「{{ p.autoAdd.teamName ?? '对应队' }}」替补</span>
                    <div class="auto-add-name">{{ p.autoAdd.nickname ?? p.steam64 }}</div>
                  </div>
                </div>
                <el-tag v-else type="danger" size="small" effect="plain">未匹配</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="K / D / A" width="130">
              <template #default="{ row: p }">{{ p.kills }} / {{ p.deaths }} / {{ p.assists }}</template>
            </el-table-column>
            <el-table-column label="爆头率" width="90">
              <template #default="{ row: p }">{{ p.hsPct }}%</template>
            </el-table-column>
            <el-table-column prop="adr" label="ADR" width="80" />
            <el-table-column prop="rating" label="Rating" width="90" />
          </el-table>
        </template>
      </el-table-column>
      <el-table-column width="46">
        <template #default="{ row }">
          <el-checkbox v-model="row.checked" />
        </template>
      </el-table-column>
      <el-table-column label="地图" width="110">
        <template #default="{ row }">{{ row.match.mapLabel }}</template>
      </el-table-column>
      <el-table-column label="赛事" min-width="150">
        <template #default="{ row }">{{ row.match.cupName ?? (row.match.isThirdParty ? '第三方赛事' : '天梯') }}</template>
      </el-table-column>
      <el-table-column label="比分" width="110">
        <template #default="{ row }">
          <span v-if="row.aScore != null">{{ row.aScore }} : {{ row.bScore }}</span>
          <el-tag v-else type="danger" size="small" effect="plain">无法识别</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="选手匹配" width="90">
        <template #default="{ row }">
          <el-tag :type="row.matched === row.total ? 'success' : 'warning'" size="small" effect="plain">
            {{ row.matched }}/{{ row.total }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="备注" min-width="220">
        <template #default="{ row }">
          <el-tag v-if="row.isTarget" type="success" size="small" effect="plain">目标赛事</el-tag>
          <span v-if="row.note" class="no">{{ row.note }}</span>
        </template>
      </el-table-column>
    </el-table>
    <template #footer>
      <el-button @click="pwaPreviewVisible = false">取消</el-button>
      <el-button type="primary" :loading="pwaImporting" @click="confirmPwaImport">
        确认导入勾选的 {{ pwaPreview.filter((x) => x.checked).length }} 场（写比分 + 填数据）
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.tip {
  margin-bottom: 12px;
}

.pwa-collapse {
  margin-bottom: 12px;
  border-radius: 6px;
}

.pwa-title {
  font-weight: 600;
  color: var(--cs2-accent, #409eff);
}

.pwa-box {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.pwa-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.pwa-token {
  width: 260px;
}

.pwa-steam {
  width: 240px;
}

.pwa-cup {
  width: 210px;
}

.pwa-hint {
  white-space: pre-line;
}

.pwa-paste {
  display: flex;
  gap: 8px;
  align-items: flex-start;
}

.pwa-list {
  margin-top: 4px;
}

.pwa-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.pwa-tip {
  font-size: 12px;
  color: var(--cs2-text-muted);
}

.pwa-preview-players {
  margin: 4px 8px 8px;
}

.no {
  color: var(--el-color-danger);
  font-size: 12px;
}

.auto-add-cell {
  display: flex;
  align-items: flex-start;
  gap: 4px;
}

.auto-add-label {
  font-size: 12px;
  color: var(--cs2-accent, #409eff);
}

.auto-add-name {
  font-size: 12px;
  color: var(--cs2-text-muted);
}

.map-tab-label {
  font-weight: 500;
}

.player-name {
  margin-right: 6px;
}

.pw {
  font-size: 12px;
  color: var(--cs2-text-muted);
}

.benched-tag {
  margin-left: 4px;
  vertical-align: middle;
}

.cell-input {
  width: 76px;
}
</style>
