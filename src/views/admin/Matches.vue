<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { EventItem, Group, Match, Stage, StageFormat, StageStatus, Team } from '@/api/types'
import { MATCH_STATUS_LABEL, STAGE_FORMAT_LABEL, STAGE_STATUS_LABEL } from '@/api/types'
import {
  clearStageMatches,
  createMatch,
  createStage,
  deleteStage,
  listGroups,
  listMatches,
  listStages,
  listTeams,
  updateMatch,
  updateStage,
} from '@/api/admin'
import { listMatchMaps, stageDisplayName, submitMatchScore } from '@/api/match'
import type { MatchMapInput } from '@/api/match'
import { generatePlayoffNext } from '@/api/playoff'
import { BRACKET_LABEL, halfSplitPairs } from '@/lib/playoff'
import type { BracketKind } from '@/lib/playoff'
import { listEvents } from '@/api/event'
import MatchPlayerStatsDialog from '@/components/MatchPlayerStatsDialog.vue'

const events = ref<EventItem[]>([])
const currentEventId = ref<string>('')
const currentGroupId = ref<string>('')
const stages = ref<Stage[]>([])
const groups = ref<Group[]>([])
const teams = ref<Team[]>([])
const currentStage = ref<string>('')
const matches = ref<Match[]>([])
const loading = ref(false)

// 比分录入
const scoreDialog = ref(false)
const scoreForm = reactive({ matchId: '', aScore: 0, bScore: 0, map: '', scheduledAt: '' })

// 本场队员数据录入
const playerStatsDialog = ref(false)
const playerStatsMatch = ref<Match | null>(null)
const scoreBestOf = ref(1) // 当前录入比赛的赛制（1 = BO1，3 = BO3）
interface MapRow {
  mapName: string
  a: number
  b: number
}
const mapRows = reactive<MapRow[]>([])
/** 重置逐图比分行数（BO1=0 / BO3=3 / BO5=5） */
function resetMapRows(n: number) {
  mapRows.length = 0
  for (let i = 0; i < n; i++) mapRows.push({ mapName: '', a: 0, b: 0 })
}

// 服役图池（Active Duty）7 张
const MAP_OPTIONS = [
  '荒漠迷城', '炙热沙城Ⅱ', '炼狱小镇', '核子危机', '远古遗迹', '阿努比斯', '死城之谜',
]

// 阶段新增/编辑（同一弹窗：stageEditId 为空 = 新增，非空 = 编辑）
const stageDialog = ref(false)
const stageEditId = ref<string | null>(null)
const stageForm = reactive<{
  name: string
  format: StageFormat
  status: StageStatus
  groupId: string
  finalBestOf: number
  startAt: string
  endAt: string
}>({ name: '', format: 'round_robin', status: 'upcoming', groupId: '', finalBestOf: 3, startAt: '', endAt: '' })

// 新建对阵
const matchDialog = ref(false)
const matchForm = reactive({
  stageId: '',
  groupId: '',
  roundNumber: 1,
  bracket: 'wb' as BracketKind,
  teamA: '',
  teamB: '',
  bestOf: 1,
  map: '',
  scheduledAt: '',
})

const currentEventName = computed(
  () => events.value.find((e) => e.id === currentEventId.value)?.name ?? '',
)

const currentGroupName = computed(
  () => groups.value.find((g) => g.id === currentGroupId.value)?.name ?? '',
)

/** 当前阶段赛制（对阵管理页签） */
const currentStageFormat = computed(
  () => stages.value.find((s) => s.id === currentStage.value)?.format ?? null,
)
/** 当前阶段是否淘汰赛（单败/双败）：启用自动匹配下一轮 */
const isKnockoutFormat = computed(
  () => currentStageFormat.value === 'single_elim' || currentStageFormat.value === 'double_elim',
)
/** 新建对阵弹窗里所选阶段的赛制 */
const matchStageFormat = computed(
  () => stages.value.find((s) => s.id === matchForm.stageId)?.format ?? '',
)
/** 双败赛制的赛组选项（单败固定胜者组） */
const bracketOptions = computed(() => {
  if (matchStageFormat.value === 'double_elim') return BRACKET_LABEL
  return { wb: BRACKET_LABEL.wb }
})

async function load() {
  events.value = await listEvents()
  if (!events.value.some((e) => e.id === currentEventId.value)) {
    const active =
      events.value.find((e) => e.status === 'running') ??
      events.value.find((e) => e.status === 'signup') ??
      events.value[0]
    currentEventId.value = active?.id ?? ''
  }
  await loadStagesAndMatches()
}

async function loadStagesAndMatches() {
  loading.value = true
  try {
    stages.value = await listStages(currentEventId.value || undefined, currentGroupId.value || undefined)
    if (!stages.value.some((s) => s.id === currentStage.value)) {
      currentStage.value = stages.value[0]?.id ?? ''
    }
    groups.value = await listGroups()
    teams.value = await listTeams()
    matches.value = await listMatches(currentStage.value)
  } finally {
    loading.value = false
  }
}

async function onGroupChange() {
  currentStage.value = ''
  await loadStagesAndMatches()
}

async function onFilterChange() {
  matches.value = await listMatches(currentStage.value)
}

async function openScore(row: Match) {
  scoreForm.matchId = row.id
  scoreForm.aScore = row.team_a_score
  scoreForm.bScore = row.team_b_score
  scoreForm.map = row.map ?? ''
  scoreForm.scheduledAt = row.scheduled_at?.slice(0, 10) ?? ''
  scoreBestOf.value = row.best_of
  const maps = await listMatchMaps([row.id])
  resetMapRows(scoreBestOf.value > 1 ? scoreBestOf.value : 0)
  for (let i = 0; i < mapRows.length; i++) {
    mapRows[i].mapName = maps[i]?.map_name ?? ''
    mapRows[i].a = maps[i]?.team_a_score ?? 0
    mapRows[i].b = maps[i]?.team_b_score ?? 0
  }
  scoreDialog.value = true
}

async function saveScore() {
  if (scoreForm.aScore === scoreForm.bScore) {
    ElMessage.warning('比分不能相同，请区分胜负')
    return
  }
  const maps: MatchMapInput[] =
    scoreBestOf.value > 1
      ? mapRows
          .filter((r) => r.mapName)
          .map((r) => ({ map_name: r.mapName, team_a_score: r.a, team_b_score: r.b }))
      : []
  if (scoreBestOf.value > 1 && maps.length === 0) {
    ElMessage.warning('请填写至少一张地图的逐图比分')
    return
  }
  if (scoreBestOf.value > 1) {
    const aWins = maps.filter((r) => r.team_a_score > r.team_b_score).length
    const bWins = maps.filter((r) => r.team_b_score > r.team_a_score).length
    if (aWins !== scoreForm.aScore || bWins !== scoreForm.bScore) {
      ElMessage.warning(`总比分与逐图不一致：逐图统计为 ${aWins} : ${bWins}，请检查后重新填写`)
      return
    }
  }
  try {
    await submitMatchScore(scoreForm.matchId, scoreForm.aScore, scoreForm.bScore, {
      map: scoreBestOf.value > 1 ? null : scoreForm.map || null,
      scheduledAt: scoreForm.scheduledAt || null,
      maps,
    })
    scoreDialog.value = false
    ElMessage.success('比分已保存')
    onFilterChange()
    // 淘汰赛：比分录入后自动匹配胜者/败者到下一轮
    if (isKnockoutFormat.value) {
      try {
        const res = await generatePlayoffNext(
          currentStage.value,
          currentStageFormat.value as 'single_elim' | 'double_elim',
        )
        if (res.created > 0) {
          ElMessage.success(`已自动匹配 ${res.created} 场对阵`)
          await loadStagesAndMatches()
        }
      } catch {
        // 自动匹配失败不阻塞比分保存
      }
    }
  } catch (e: any) {
    ElMessage.error(e.message || '保存失败，请检查权限')
  }
}

/** 打开本场队员数据录入 */
function openPlayerStats(row: Match) {
  playerStatsMatch.value = row
  playerStatsDialog.value = true
}

function openStageDialog(stage?: Stage) {
  stageEditId.value = stage?.id ?? null
  stageForm.name = stage?.name ?? ''
  stageForm.format = stage?.format ?? 'round_robin'
  stageForm.status = stage?.status ?? 'upcoming'
  stageForm.groupId = stage?.group_id ?? currentGroupId.value
  stageForm.finalBestOf = stage?.final_best_of === 5 ? 5 : 3
  stageForm.startAt = toDateTimeLocal(stage?.start_at)
  stageForm.endAt = toDateTimeLocal(stage?.end_at)
  stageDialog.value = true
}

/** 将数据库时间（ISO / 带秒）统一为 el-date-picker 期望的 'YYYY-MM-DD HH:mm' 格式，避免回显解析失败 */
function toDateTimeLocal(v?: string | null): string {
  if (!v) return ''
  const d = new Date(v)
  if (isNaN(d.getTime())) return v.slice(0, 16)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

async function saveStage() {
  if (!stageForm.name.trim()) {
    ElMessage.warning('请填写阶段名称')
    return
  }
  const payload = {
    name: stageForm.name.trim(),
    format: stageForm.format,
    status: stageForm.status,
    group_id: stageForm.groupId || null,
    final_best_of: stageForm.finalBestOf,
    start_at: stageForm.startAt || null,
    end_at: stageForm.endAt || null,
  }
  try {
    if (stageEditId.value) {
      await updateStage(stageEditId.value, payload)
      ElMessage.success('阶段已更新')
    } else {
      await createStage({ ...payload, event_id: currentEventId.value || null })
      ElMessage.success('阶段已创建')
    }
  } catch (e: any) {
    ElMessage.error(e.message || '保存失败，请检查权限')
    return
  }
  stageDialog.value = false
  await loadStagesAndMatches()
}

async function removeStage(stage: Stage) {
  try {
    await ElMessageBox.confirm(
      `确认删除阶段「${stage.name}」吗？该阶段下的对阵会一并删除。`,
      '删除确认',
      { type: 'warning' },
    )
  } catch {
    return
  }
  await deleteStage(stage.id)
  ElMessage.success('阶段已删除')
  await loadStagesAndMatches()
}

/** 清空当前阶段全部对阵（保留阶段本身，便于重新自动排阵） */
async function clearMatches() {
  if (!currentStage.value) return
  const s = stages.value.find((x) => x.id === currentStage.value)
  try {
    await ElMessageBox.confirm(
      `确认清空阶段「${s?.name ?? ''}」下全部 ${matches.value.length} 场对阵吗？该操作不可恢复。`,
      '清空确认',
      { type: 'warning' },
    )
  } catch {
    return
  }
  try {
    await clearStageMatches(currentStage.value)
    ElMessage.success('对阵已清空')
    await loadStagesAndMatches()
  } catch (e: any) {
    ElMessage.error(e.message || '清空失败，请检查权限')
  }
}

/** 自动匹配下一轮：按当前已录比分把胜者/败者匹配到后续轮次（幂等，只补缺失对阵） */
async function autoMatchNext() {
  if (!currentStage.value || !isKnockoutFormat.value) return
  try {
    const res = await generatePlayoffNext(
      currentStage.value,
      currentStageFormat.value as 'single_elim' | 'double_elim',
    )
    if (res.needPowerOfTwo) {
      ElMessage.warning('双败赛制需要第 1 轮对阵数为 2 的幂（如 2/4/8/16 场），无法自动匹配')
      return
    }
    if (res.created > 0) ElMessage.success(`已自动匹配 ${res.created} 场对阵`)
    else ElMessage.info('暂无可匹配的对阵（请先录入上一轮比分）')
    await loadStagesAndMatches()
  } catch (e: any) {
    ElMessage.error(e.message || '自动匹配失败，请检查权限')
  }
}

async function moveStage(stage: Stage, dir: -1 | 1) {
  const idx = stages.value.findIndex((s) => s.id === stage.id)
  const target = idx + dir
  if (idx < 0 || target < 0 || target >= stages.value.length) return
  const a = stages.value[idx]
  const b = stages.value[target]
  await updateStage(a.id, { sort_order: b.sort_order })
  await updateStage(b.id, { sort_order: a.sort_order })
  await loadStagesAndMatches()
}

async function addMatch() {
  if (!matchForm.stageId || !matchForm.teamA || !matchForm.teamB) {
    ElMessage.warning('请选择阶段与对阵双方')
    return
  }
  if (matchForm.teamA === matchForm.teamB) {
    ElMessage.warning('对阵双方不能是同一支队伍')
    return
  }
  await createMatch({
    stage_id: matchForm.stageId,
    group_id: matchForm.groupId || null,
    round_number: matchForm.roundNumber,
    bracket: matchStageFormat.value === 'double_elim' ? matchForm.bracket : 'wb',
    team_a_id: matchForm.teamA,
    team_b_id: matchForm.teamB,
    best_of: matchForm.bestOf,
    map: matchForm.map || null,
    scheduled_at: matchForm.scheduledAt || null,
  })
  matchDialog.value = false
  ElMessage.success('对阵已创建')
  onFilterChange()
}

/** 行内修改对阵轮次（淘汰赛按 1/4 决赛、半决赛、决赛分轮） */
async function saveRound(row: Match, round: number | undefined) {
  const r = Math.max(1, Number(round ?? 1))
  try {
    await updateMatch(row.id, { round_number: r })
    row.round_number = r
    ElMessage.success(`已更新为第 ${r} 轮`)
  } catch (e: any) {
    ElMessage.error(e.message || '轮次更新失败')
  }
}

/** 行内修改对阵赛制（BO1 / BO3 / BO5），总决赛可随时在 BO3 与 BO5 间调整 */
async function saveBestOf(row: Match, bestOf: number | undefined) {
  const v = bestOf === 5 ? 5 : bestOf === 1 ? 1 : 3
  if (v === row.best_of) return
  try {
    await updateMatch(row.id, { best_of: v })
    row.best_of = v
    ElMessage.success(`赛制已更新为 BO${v}`)
  } catch (e: any) {
    ElMessage.error(e.message || '赛制更新失败')
  }
}

/** 行内切换对阵状态（待开赛 / 已结束 / 已取消） */
async function saveMatchStatus(row: Match, status: Match['status']) {
  if (status === row.status) return
  try {
    await updateMatch(row.id, { status })
    row.status = status
    ElMessage.success(`状态已更新为「${MATCH_STATUS_LABEL[status]}」`)
  } catch (e: any) {
    ElMessage.error(e.message || '状态更新失败')
  }
}

/** 行内切换阶段状态（未开始 / 进行中 / 已结束），如排位赛手动标记已结束 */
async function saveStageStatus(row: Stage, status: StageStatus) {
  if (status === row.status) return
  try {
    await updateStage(row.id, { status })
    row.status = status
    ElMessage.success(`阶段「${row.name}」状态已更新为「${STAGE_STATUS_LABEL[status]}」`)
  } catch (e: any) {
    ElMessage.error(e.message || '阶段状态更新失败')
  }
}

// ---------------- 自动排阵（按大小分：大分=胜场，小分=净胜局） ----------------
interface RankRow {
  teamId: string
  teamName: string
  wins: number
  net: number
}

const autoDialog = ref(false)
const autoLoading = ref(false)
const autoRanks = ref<RankRow[]>([])
// 自动排阵晋级名单：autoQualified = 排位赛直接晋级，autoBreakout = 突围赛晋级（或突围赛参赛）
const autoQualified = ref<RankRow[]>([])
const autoBreakout = ref<RankRow[]>([])
const autoGenerated = ref(false)
const autoForm = reactive({
  srcStageId: '',        // 排位赛（源）阶段
  breakoutStageId: '',   // 突围赛（源）阶段：生成淘汰赛时取突围胜者用
  dstStageId: '',        // 目标阶段
  mode: 'playoff' as 'playoff' | 'knockoutN' | 'knockoutN+M',
  pairMode: 'halfsplit' as 'highlow' | 'halfsplit', // 淘汰赛配对方式：高低配 / 半区分组
  roundNumber: 1,
  directN: 6,            // 排位赛直接晋级数 N
  breakoutK: 4,          // 突围赛参赛队伍数 K（从排位第 N+1 名起取）
  breakoutM: 2,          // 突围赛晋级胜者数 M
})

const AUTO_MODE_LABEL: Record<string, string> = {
  playoff: '突围赛（排位后段打附加赛）',
  knockoutN: '淘汰赛（排位赛前 N 名高低配）',
  'knockoutN+M': '淘汰赛（排位前 N + 突围胜者 M）',
}

/** 突围赛模式：需要 K（突围参赛数）配置 */
const modeNeedsK = computed(() => autoForm.mode === 'playoff')
/** 淘汰赛（N+M）模式：需要 M（突围晋级数）配置 */
const modeNeedsM = computed(() => autoForm.mode === 'knockoutN+M')

/** 自动排阵预览的晋级名单（排位赛直接晋级 / 突围赛晋级或参赛），按所选模式展示 */
const autoGroups = computed(() => {
  const N = Math.max(1, Math.round(autoForm.directN))
  const K = Math.max(2, Math.round(autoForm.breakoutK))
  const M = Math.max(1, Math.round(autoForm.breakoutM))
  const groups: Array<{ key: string; title: string; tag: string; rows: RankRow[] }> = []
  if (autoForm.mode === 'playoff') {
    if (autoQualified.value.length)
      groups.push({ key: 'q', title: `排位赛直接晋级（前 ${N} 名）`, tag: '直接晋级', rows: autoQualified.value })
    if (autoBreakout.value.length)
      groups.push({ key: 'b', title: `突围赛参赛（第 ${N + 1} 名起取 ${K} 支）`, tag: '突围参赛', rows: autoBreakout.value })
  } else if (autoForm.mode === 'knockoutN') {
    if (autoQualified.value.length)
      groups.push({ key: 'q', title: `排位赛直接晋级（前 ${N} 名）`, tag: '直接晋级', rows: autoQualified.value })
  } else if (autoQualified.value.length || autoBreakout.value.length) {
    if (autoQualified.value.length)
      groups.push({ key: 'q', title: `排位赛直接晋级（前 ${N} 名）`, tag: '直接晋级', rows: autoQualified.value })
    if (autoBreakout.value.length)
      groups.push({
        key: 'b',
        title: `突围赛胜者晋级（前 ${M} 名 · 按排位赛+突围赛合计大小分排序）`,
        tag: '突围晋级',
        rows: autoBreakout.value,
      })
  }
  return groups
})

function openAutoDialog() {
  autoForm.srcStageId = stages.value[0]?.id ?? ''
  autoForm.breakoutStageId = ''
  autoForm.dstStageId = stages.value[1]?.id ?? ''
  autoForm.mode = 'playoff'
  autoForm.directN = 6
  autoForm.breakoutK = 4
  autoForm.breakoutM = 2
  autoRanks.value = []
  autoQualified.value = []
  autoBreakout.value = []
  autoPairGroups.value = []
  autoGenerated.value = false
  autoDialog.value = true
}

/** 从某阶段已完成比赛统计每队大分（胜场）/ 小分（净胜局=得局-失局），按大分优先、小分其次排序 */
function computeRanks(ms: Match[]): RankRow[] {
  const map = new Map<string, RankRow>()
  for (const m of ms) {
    if (m.status !== 'completed' || !m.team_a_id || !m.team_b_id || m.team_a_id === m.team_b_id) continue
    const touch = (id: string, name: string | undefined, scored: number, against: number, win: boolean) => {
      const r = map.get(id) ?? { teamId: id, teamName: name ?? '', wins: 0, net: 0 }
      if (!r.teamName) r.teamName = name ?? ''
      r.wins += win ? 1 : 0
      r.net += scored - against
      map.set(id, r)
    }
    touch(m.team_a_id, m.team_a_name, m.team_a_score, m.team_b_score, m.team_a_score > m.team_b_score)
    touch(m.team_b_id, m.team_b_name, m.team_b_score, m.team_a_score, m.team_b_score > m.team_a_score)
  }
  return [...map.values()].sort((x, y) => y.wins - x.wins || y.net - x.net)
}

/**
 * 突围赛胜者晋级名单（按比分判定胜者，与赛程列表一致）。
 * 顺位规则：把每支突围胜者的「排位赛大小分」与「突围赛大小分」相加（大分=胜场合计，小分=净胜局合计），
 * 只在突围晋级队伍之间按合计大小分排序（不改变排位赛直接晋级队伍的次序，排位赛第 N 名仍是第 N 位，
 * 突围胜者排在 N 名之后，合计大分高者顺位靠前）。
 */
function breakoutAdvancers(qualRanks: RankRow[], breakoutMatches: Match[]): RankRow[] {
  const winnerIds = new Set(
    breakoutMatches
      .filter((m) => m.status === 'completed' && m.team_a_score !== m.team_b_score)
      .map((m) => (m.team_a_score > m.team_b_score ? m.team_a_id : m.team_b_id)),
  )
  const breakoutRanks = computeRanks(breakoutMatches)
  return breakoutRanks
    .filter((r) => winnerIds.has(r.teamId))
    .map((w) => {
      const q = qualRanks.find((x) => x.teamId === w.teamId)
      return {
        teamId: w.teamId,
        teamName: w.teamName,
        wins: (q?.wins ?? 0) + w.wins,
        net: (q?.net ?? 0) + w.net,
      }
    })
    .sort((a, b) => b.wins - a.wins || b.net - a.net)
}

/** 高低配：第 i 名 vs 倒数第 i 名（1vs8、2vs7…） */
function seedPairs(ids: string[]): Array<[string, string]> {
  const n = ids.length
  return Array.from({ length: Math.floor(n / 2) }, (_, i) => [ids[i], ids[n - 1 - i]])
}

/** 灵活配对：队伍数为奇数时，末位自动轮空晋级（返回轮空名单，不生成比赛） */
function seedPairsFlex(ids: string[]): { pairs: Array<[string, string]>; skipped: string[] } {
  const n = ids.length
  if (n <= 1) return { pairs: [], skipped: ids }
  const skipped = n % 2 === 1 ? [ids[n - 1]] : []
  return { pairs: seedPairs(skipped.length ? ids.slice(0, n - 1) : ids), skipped }
}

/** 按所选配对方式生成淘汰赛第 1 轮对阵；半区分组仅支持 2 的幂，否则返回 needPowerOfTwo */
function buildKnockoutPairs(
  ids: string[],
  pairMode: 'highlow' | 'halfsplit',
): Array<[string, string]> | 'needPowerOfTwo' {
  if (pairMode === 'halfsplit') {
    const pairs = halfSplitPairs(ids)
    if (pairs) return pairs
    return 'needPowerOfTwo'
  }
  return seedPairs(ids)
}

interface PairRow {
  a: string
  b: string
}

/** 淘汰赛配对预览（按半区分组显示，供确认半区分组是否正确） */
const autoPairGroups = ref<Array<{ half: string; rows: PairRow[] }>>([])

function buildPairGroups(
  ids: string[],
  names: Map<string, string>,
  pairMode: 'highlow' | 'halfsplit',
): Array<{ half: string; rows: PairRow[] }> {
  const pairs = buildKnockoutPairs(ids, pairMode)
  if (pairs === 'needPowerOfTwo' || pairs.length < 2) return []
  const halfSize = Math.max(1, Math.ceil(pairs.length / 2))
  const groups: Array<{ half: string; rows: PairRow[] }> = []
  for (let h = 0; h < 2 && h * halfSize < pairs.length; h++) {
    const slice = pairs.slice(h * halfSize, (h + 1) * halfSize)
    groups.push({
      half: `半区${'AB'[h]}`,
      rows: slice.map(([a, b]) => ({ a: names.get(a) ?? a, b: names.get(b) ?? b })),
    })
  }
  return groups
}

/** 淘汰赛配对参与队伍（排位直接晋级 + 突围晋级） */
const pairPoolIds = computed(() =>
  (autoForm.mode === 'knockoutN' ? autoQualified.value : [...autoQualified.value, ...autoBreakout.value]).map(
    (r) => r.teamId,
  ),
)
/** 半区分组模式是否适用（队伍数为 2 的幂） */
const pairModeHalfSplitOk = computed(() => {
  const n = pairPoolIds.value.length
  if (n < 2) return false
  return Math.pow(2, Math.round(Math.log2(n))) === n
})

async function previewAuto() {
  if (!autoForm.srcStageId) {
    ElMessage.warning('请选择排位赛（源）阶段')
    return
  }
  autoLoading.value = true
  try {
    const ms = await listMatches(autoForm.srcStageId)
    const ranks = computeRanks(ms)
    autoRanks.value = ranks
    autoQualified.value = []
    autoBreakout.value = []
    const N = Math.max(1, Math.round(autoForm.directN))
    const K = Math.max(2, Math.round(autoForm.breakoutK))
    const M = Math.max(1, Math.round(autoForm.breakoutM))
    if (autoForm.mode === 'playoff') {
      // 突围赛：前 N 名直接晋级，第 N+1 名起取 K 支打附加赛
      autoQualified.value = ranks.slice(0, N)
      autoBreakout.value = ranks.slice(N, N + K)
    } else if (autoForm.mode === 'knockoutN') {
      autoQualified.value = ranks.slice(0, N)
    } else {
      // 突围赛 + 排位赛生成淘汰赛：前 N 名 + 突围赛胜者 M（胜者按「排位赛+突围赛」合计大小分排序）
      if (!autoForm.breakoutStageId) {
        ElMessage.warning('请选择突围赛阶段')
        return
      }
      if (autoForm.breakoutStageId === autoForm.srcStageId) {
        ElMessage.warning('突围赛阶段不能与排位赛阶段相同')
        return
      }
      const pm = await listMatches(autoForm.breakoutStageId)
      autoQualified.value = ranks.slice(0, N)
      autoBreakout.value = breakoutAdvancers(ranks, pm).slice(0, M)
    }
    // 配对预览：按所选配对方式 + 半区分组展示，确认半区分组是否正确
    if (autoForm.mode === 'knockoutN' || autoForm.mode === 'knockoutN+M') {
      const pool = autoForm.mode === 'knockoutN' ? autoQualified.value : [...autoQualified.value, ...autoBreakout.value]
      const names = new Map<string, string>()
      for (const r of [...autoQualified.value, ...autoBreakout.value]) names.set(r.teamId, r.teamName || r.teamId)
      autoPairGroups.value = buildPairGroups(pool.map((r) => r.teamId), names, autoForm.pairMode)
    } else {
      autoPairGroups.value = []
    }
    if (ranks.length === 0) {
      ElMessage.warning('该阶段暂无已结束的比赛，请先录入排位赛比分')
    }
  } finally {
    autoLoading.value = false
  }
}

async function generateAuto() {
  const dst = autoForm.dstStageId
  if (!dst) {
    ElMessage.warning('请选择目标阶段')
    return
  }
  const existing = await listMatches(dst)
  if (existing.some((m) => m.team_a_id || m.team_b_id)) {
    ElMessage.warning('目标阶段已有对阵，请先清空该阶段比赛后再生成')
    return
  }
  const ranks = autoRanks.value
  const N = Math.max(1, Math.round(autoForm.directN))
  const K = Math.max(2, Math.round(autoForm.breakoutK))
  const M = Math.max(1, Math.round(autoForm.breakoutM))
  const bestOf = 3
  let pairs: Array<[string, string]> = []
  let skipped: string[] = []

  if (autoForm.mode === 'playoff') {
    // 突围赛：排位赛前 N 名直接晋级，第 N+1 名起取 K 支队伍打附加赛（高低配；奇数时末位轮空）
    if (ranks.length < N + K) {
      ElMessage.warning(`突围赛需要排位赛至少 ${N + K} 支队伍完成（前 ${N} 名直接晋级，第 ${N + 1} 名起取 ${K} 支）`)
      return
    }
    const entrants = ranks.slice(N, N + K).map((r) => r.teamId)
    const res = seedPairsFlex(entrants)
    pairs = res.pairs
    skipped = res.skipped
    if (pairs.length === 0) {
      ElMessage.warning('突围赛参赛队伍不足 2 支，无需生成')
      return
    }
  } else if (autoForm.mode === 'knockoutN') {
    // 淘汰赛：排位赛前 N 名按所选配对方式（N 需为偶数，保证对阵成对）
    if (ranks.length < N) {
      ElMessage.warning(`淘汰赛需要排位赛至少 ${N} 支队伍完成（当前 ${ranks.length} 支）`)
      return
    }
    if (N % 2 !== 0) {
      ElMessage.warning('排位赛直接晋级数 N 需为偶数，保证淘汰赛对阵成对')
      return
    }
    const res = buildKnockoutPairs(ranks.slice(0, N).map((r) => r.teamId), autoForm.pairMode)
    if (res === 'needPowerOfTwo') {
      ElMessage.warning('半区分组仅支持 4/8/16 队（2 的幂），请改用「高低配」或调整晋级数')
      return
    }
    pairs = res
  } else {
    // 淘汰赛：排位赛前 N 名 + 突围赛前 M 名胜者（突围赛阶段显式选择，胜者按突围赛大小分取前 M）
    if (!autoForm.breakoutStageId) {
      ElMessage.warning('请选择突围赛阶段')
      return
    }
    if (autoForm.breakoutStageId === dst) {
      ElMessage.warning('突围赛阶段不能与目标阶段相同')
      return
    }
    const pm = await listMatches(autoForm.breakoutStageId)
    const advancers = breakoutAdvancers(ranks, pm)
    if (advancers.length < M) {
      ElMessage.warning(`突围赛需产生至少 ${M} 个胜者（当前 ${advancers.length} 个）`)
      return
    }
    if (ranks.length < N) {
      ElMessage.warning(`排位赛需至少 ${N} 支队伍完成（当前 ${ranks.length} 支）`)
      return
    }
    if ((N + M) % 2 !== 0) {
      ElMessage.warning('排位赛晋级数 + 突围胜者数需为偶数，保证淘汰赛对阵成对')
      return
    }
    const res = buildKnockoutPairs(
      [...ranks.slice(0, N).map((r) => r.teamId), ...advancers.slice(0, M).map((r) => r.teamId)],
      autoForm.pairMode,
    )
    if (res === 'needPowerOfTwo') {
      ElMessage.warning('半区分组仅支持 4/8/16 队（2 的幂），请改用「高低配」或调整晋级数')
      return
    }
    pairs = res
  }
  for (const [a, b] of pairs) {
    await createMatch({ stage_id: dst, round_number: autoForm.roundNumber, team_a_id: a, team_b_id: b, best_of: bestOf })
  }
  const skipMsg = skipped.length > 0 ? `（${skipped.length} 支队伍轮空自动晋级）` : ''
  ElMessage.success(`已生成 ${pairs.length} 场对阵${skipMsg}`)
  autoGenerated.value = true
  autoDialog.value = false
  await loadStagesAndMatches()
}

onMounted(load)
</script>

<template>
  <div>
    <div class="toolbar">
      <h2>赛程管理</h2>
      <div class="filters">
        <el-select
          v-model="currentEventId"
          class="filter-select"
          placeholder="选择赛事"
          @change="onGroupChange"
        >
          <el-option
            v-for="e in events"
            :key="e.id"
            :label="`${e.name}${e.edition ? `（第 ${e.edition} 届）` : ''}`"
            :value="e.id"
          />
        </el-select>
        <el-select
          v-model="currentGroupId"
          class="filter-select"
          placeholder="选择组别"
          @change="onGroupChange"
        >
          <el-option label="全部组别" value="" />
          <el-option v-for="g in groups" :key="g.id" :label="g.name" :value="g.id" />
        </el-select>
      </div>
    </div>

    <!-- 阶段配置：每个组别的赛程单独管理（赛制 / 状态 / 排序 / 时间） -->
    <el-card class="stage-card">
      <div class="stage-head">
        <span class="stage-title">
          赛程阶段配置（{{ currentEventName || '未选择赛事' }}
          {{ currentGroupName ? ' · ' + currentGroupName : ' · 全部组别' }}）
        </span>
        <el-button type="primary" size="small" :disabled="!currentEventId" @click="openStageDialog()">
          新建阶段
        </el-button>
      </div>
      <el-table :data="stages" size="small" empty-text="该赛事当前组别尚未配置赛程，点击「新建阶段」添加">
        <el-table-column prop="sort_order" label="顺序" width="60" />
        <el-table-column prop="name" label="阶段名称" min-width="170" />
        <el-table-column label="组别" width="100">
          <template #default="{ row }">
            <el-tag size="small" :type="row.group_id ? 'primary' : 'info'" effect="plain">
              {{ row.group_name || '跨组' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="赛制" width="110">
          <template #default="{ row }">{{ STAGE_FORMAT_LABEL[row.format as StageFormat] }}</template>
        </el-table-column>
        <el-table-column label="状态" width="120">
          <template #default="{ row }">
            <el-select
              :model-value="row.status"
              size="small"
              style="width: 104px"
              @change="(val: StageStatus) => saveStageStatus(row, val)"
            >
              <el-option
                v-for="(label, value) in STAGE_STATUS_LABEL"
                :key="value"
                :label="label"
                :value="value"
              />
            </el-select>
          </template>
        </el-table-column>
        <el-table-column label="起止时间" min-width="200">
          <template #default="{ row }">
            <span class="stage-time">{{ row.start_at || '—' }} ~ {{ row.end_at || '—' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="230">
          <template #default="{ row }">
            <el-button
              size="small"
              text
              :disabled="row.sort_order <= (stages[0]?.sort_order ?? 0)"
              @click="moveStage(row, -1)"
            >
              上移
            </el-button>
            <el-button
              size="small"
              text
              :disabled="row.sort_order >= (stages[stages.length - 1]?.sort_order ?? 0)"
              @click="moveStage(row, 1)"
            >
              下移
            </el-button>
            <el-button size="small" text type="primary" @click="openStageDialog(row)">编辑</el-button>
            <el-button size="small" text type="danger" @click="removeStage(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 对阵管理 -->
    <div class="matches-block">
      <el-tabs v-model="currentStage" @tab-change="onFilterChange">
        <el-tab-pane
          v-for="s in stages"
          :key="s.id"
          :label="`${stageDisplayName(s)} · ${STAGE_FORMAT_LABEL[s.format]}（${STAGE_STATUS_LABEL[s.status]}）`"
          :name="s.id"
        />
      </el-tabs>

      <div class="toolbar">
        <span class="match-count">对阵 {{ matches.length }} 场</span>
        <div>
          <el-button size="small" @click="openAutoDialog">自动排阵</el-button>
          <el-button
            v-if="isKnockoutFormat"
            size="small"
            type="warning"
            plain
            :disabled="!currentStage"
            @click="autoMatchNext"
          >
            自动匹配下一轮
          </el-button>
          <el-button
            size="small"
            type="danger"
            plain
            :disabled="!currentStage || matches.length === 0"
            @click="clearMatches"
          >
            清空对阵
          </el-button>
          <el-button type="primary" size="small" :disabled="stages.length === 0" @click="matchDialog = true">
            新建对阵
          </el-button>
        </div>
      </div>

      <el-card v-loading="loading">
        <el-table :data="matches" stripe empty-text="该阶段暂无对阵">
          <el-table-column prop="group_name" label="组别" width="90">
            <template #default="{ row }">
              <el-tag size="small" effect="plain">{{ row.group_name ?? '跨组' }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column v-if="currentStageFormat === 'double_elim'" label="赛组" width="80">
            <template #default="{ row }">
              <el-tag
                size="small"
                :type="(row.bracket ?? 'wb') === 'gf' ? 'danger' : (row.bracket ?? 'wb') === 'lb' ? 'info' : 'primary'"
                effect="plain"
              >
                {{ BRACKET_LABEL[(row.bracket ?? 'wb') as BracketKind] }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="对阵" min-width="260">
            <template #default="{ row }">
              <div class="matchup">
                <span>{{ row.team_a_name }}</span>
                <b class="score">{{ row.team_a_score }} : {{ row.team_b_score }}</b>
                <span>{{ row.team_b_name }}</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="赛制" width="92">
            <template #default="{ row }">
              <el-select
                :model-value="row.best_of"
                size="small"
                style="width: 76px"
                @change="(v: number | string | boolean | undefined) => saveBestOf(row, Number(v))"
              >
                <el-option :value="1" label="BO1" />
                <el-option :value="3" label="BO3" />
                <el-option :value="5" label="BO5" />
              </el-select>
            </template>
          </el-table-column>
          <el-table-column label="轮次" width="110">
            <template #default="{ row }">
              <el-input-number
                :model-value="row.round_number ?? 1"
                :min="1"
                size="small"
                controls-position="right"
                style="width: 88px"
                @change="(val: number | undefined) => saveRound(row, val)"
              />
            </template>
          </el-table-column>
          <el-table-column prop="map" label="地图" width="90">
            <template #default="{ row }">{{ row.map ?? '-' }}</template>
          </el-table-column>
          <el-table-column label="状态" width="120">
            <template #default="{ row }">
              <el-select
                :model-value="row.status"
                size="small"
                style="width: 104px"
                @change="(val: Match['status']) => saveMatchStatus(row, val)"
              >
                <el-option
                  v-for="(label, value) in MATCH_STATUS_LABEL"
                  :key="value"
                  :label="label"
                  :value="value"
                />
              </el-select>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="210">
            <template #default="{ row }">
              <div class="op-btns">
                <el-button
                  v-if="row.team_a_id && row.team_b_id"
                  size="small"
                  type="primary"
                  @click="openScore(row)"
                >
                  {{ row.status === 'completed' ? '修改比分' : '录入比分' }}
                </el-button>
                <el-button
                  v-if="row.team_a_id && row.team_b_id"
                  size="small"
                  type="success"
                  plain
                  @click="openPlayerStats(row)"
                >
                  队员数据
                </el-button>
              </div>
            </template>
          </el-table-column>
        </el-table>
      </el-card>
    </div>

    <!-- 比分录入 -->
    <el-dialog v-model="scoreDialog" title="录入比分" width="560px">
      <el-alert type="info" :closable="false" title="按地图比分填写，系统自动判定胜者并计入积分榜。" class="tip" />
      <el-form label-width="90px" class="form">
        <el-form-item label="总比分">
          <el-input-number v-model="scoreForm.aScore" :min="0" /> <span class="vs">:</span>
          <el-input-number v-model="scoreForm.bScore" :min="0" />
        </el-form-item>
        <template v-if="scoreBestOf > 1">
          <el-form-item v-for="(r, i) in mapRows" :key="i" :label="`地图${i + 1}`">
            <el-select v-model="r.mapName" filterable clearable placeholder="选择地图" class="map-name">
              <el-option v-for="m in MAP_OPTIONS" :key="m" :label="m" :value="m" />
            </el-select>
            <el-input-number v-model="r.a" :min="0" class="map-score" /> <span class="vs">:</span>
            <el-input-number v-model="r.b" :min="0" class="map-score" />
          </el-form-item>
          <el-alert type="warning" :closable="false" title="总比分需与逐图胜场一致（如 2:1 = 两图胜一图负）。" class="tip" />
        </template>
        <template v-else>
          <el-form-item label="地图">
            <el-select v-model="scoreForm.map" filterable clearable placeholder="选择服役图池地图" style="width: 100%">
              <el-option v-for="m in MAP_OPTIONS" :key="m" :label="m" :value="m" />
            </el-select>
          </el-form-item>
        </template>
        <el-form-item label="比赛日期">
          <el-date-picker
            v-model="scoreForm.scheduledAt"
            type="date"
            value-format="YYYY-MM-DD"
            placeholder="选择比赛日期"
            style="width: 100%"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="scoreDialog = false">取消</el-button>
        <el-button type="primary" @click="saveScore">保存</el-button>
      </template>
    </el-dialog>

    <!-- 本场队员数据录入（管理员 / 参赛队队长，与前台赛程页同一入口） -->
    <MatchPlayerStatsDialog
      v-model="playerStatsDialog"
      :match="playerStatsMatch"
      @saved="onFilterChange"
    />

    <!-- 新建 / 编辑阶段 -->
    <el-dialog v-model="stageDialog" :title="stageEditId ? '编辑阶段' : '新建阶段'" width="440px">
      <el-alert type="info" :closable="false" title="阶段将配置到当前所选赛事下；不同赛事可各自设置不同赛制与阶段列表。" class="tip" />
      <el-form label-width="80px">
        <el-form-item label="阶段名称"><el-input v-model="stageForm.name" placeholder="海选 / 预选赛 / 正赛 / 淘汰赛" /></el-form-item>
        <el-form-item label="赛制">
          <el-select v-model="stageForm.format" style="width: 100%">
            <el-option v-for="(label, value) in STAGE_FORMAT_LABEL" :key="value" :label="label" :value="value" />
          </el-select>
        </el-form-item>
        <el-form-item
          v-if="stageForm.format === 'single_elim' || stageForm.format === 'double_elim'"
          label="总决赛赛制"
        >
          <el-select v-model="stageForm.finalBestOf" style="width: 100%">
            <el-option :value="3" label="BO3" />
            <el-option :value="5" label="BO5" />
          </el-select>
          <div class="form-tip">自动匹配总决赛时按此赛制生成；之后也可在对阵列表直接调整</div>
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="stageForm.status" style="width: 100%">
            <el-option label="未开始" value="upcoming" />
            <el-option label="进行中" value="running" />
            <el-option label="已结束" value="ended" />
          </el-select>
        </el-form-item>
        <el-form-item label="所属组别">
          <el-select v-model="stageForm.groupId" style="width: 100%">
            <el-option label="跨组（决赛 / 总决赛）" value="" />
            <el-option v-for="g in groups" :key="g.id" :label="g.name" :value="g.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="开始时间">
          <el-date-picker
            v-model="stageForm.startAt"
            type="datetime"
            value-format="YYYY-MM-DD HH:mm"
            placeholder="阶段开始时间"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="结束时间">
          <el-date-picker
            v-model="stageForm.endAt"
            type="datetime"
            value-format="YYYY-MM-DD HH:mm"
            placeholder="阶段结束时间"
            style="width: 100%"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="stageDialog = false">取消</el-button>
        <el-button type="primary" @click="saveStage">保存</el-button>
      </template>
    </el-dialog>

    <!-- 新建对阵 -->
    <el-dialog v-model="matchDialog" title="新建对阵" width="480px">
      <el-form label-width="80px">
        <el-form-item label="所属阶段">
          <el-select v-model="matchForm.stageId" style="width: 100%">
            <el-option v-for="s in stages" :key="s.id" :label="stageDisplayName(s)" :value="s.id" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="matchStageFormat === 'double_elim'" label="所属赛组">
          <el-select v-model="matchForm.bracket" style="width: 100%">
            <el-option v-for="(label, value) in bracketOptions" :key="value" :label="label" :value="value" />
          </el-select>
        </el-form-item>
        <el-form-item label="组别">
          <el-select v-model="matchForm.groupId" clearable placeholder="淘汰赛可留空（跨组）" style="width: 100%">
            <el-option v-for="g in groups" :key="g.id" :label="g.name" :value="g.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="A 队">
          <el-select v-model="matchForm.teamA" style="width: 100%">
            <el-option v-for="t in teams" :key="t.id" :label="t.name" :value="t.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="B 队">
          <el-select v-model="matchForm.teamB" style="width: 100%">
            <el-option v-for="t in teams" :key="t.id" :label="t.name" :value="t.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="赛制">
          <el-radio-group v-model="matchForm.bestOf">
            <el-radio :value="1">BO1</el-radio>
            <el-radio :value="3">BO3</el-radio>
            <el-radio :value="5">BO5</el-radio>
          </el-radio-group>
          <span class="mode-hint" style="margin-left: 12px">总决赛建议 BO3 / BO5</span>
        </el-form-item>
        <el-form-item label="轮次">
          <el-input-number v-model="matchForm.roundNumber" :min="1" style="width: 160px" />
          <span class="mode-hint" style="margin-left: 12px">淘汰赛：1 = 1/4 决赛，2 = 半决赛，3 = 决赛</span>
        </el-form-item>
        <el-form-item label="开赛时间"><el-input v-model="matchForm.scheduledAt" placeholder="2026-08-15 13:00" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="matchDialog = false">取消</el-button>
        <el-button type="primary" @click="addMatch">创建</el-button>
      </template>
    </el-dialog>

    <!-- 自动排阵：按大小分（大分=胜场，小分=净胜局）自动生成对阵 -->
    <el-dialog v-model="autoDialog" title="自动排阵" width="680px">
      <el-alert
        type="info"
        :closable="false"
        title="从「源阶段」已结束的比赛统计大小分排名，按所选模式生成对阵到「目标阶段」。目标阶段若已有对阵将无法生成。"
        class="tip"
      />
      <el-form label-width="110px">
        <el-form-item label="排位赛阶段">
          <el-select v-model="autoForm.srcStageId" style="width: 100%">
            <el-option v-for="s in stages" :key="s.id" :label="stageDisplayName(s)" :value="s.id" />
          </el-select>
          <div class="form-tip">统计大小分排名，作为突围赛/淘汰赛的晋级依据</div>
        </el-form-item>
        <!-- 淘汰赛（排位前 N + 突围胜者 M）：取突围胜者需指定突围赛阶段 -->
        <el-form-item v-if="autoForm.mode === 'knockoutN+M'" label="突围赛阶段">
          <el-select v-model="autoForm.breakoutStageId" style="width: 100%">
            <el-option v-for="s in stages" :key="s.id" :label="stageDisplayName(s)" :value="s.id" />
          </el-select>
          <div class="form-tip">从该阶段已结束的比赛取胜者进入淘汰赛，顺位按「排位赛+突围赛」合计大小分排序取前 M 名</div>
        </el-form-item>
        <el-form-item label="目标阶段">
          <el-select v-model="autoForm.dstStageId" style="width: 100%">
            <el-option v-for="s in stages" :key="s.id" :label="stageDisplayName(s)" :value="s.id" />
          </el-select>
          <div class="form-tip">{{ autoForm.mode === 'playoff' ? '突围赛对阵将生成到该阶段' : '淘汰赛对阵将生成到该阶段' }}</div>
        </el-form-item>
        <el-form-item label="生成模式">
          <el-select v-model="autoForm.mode" style="width: 100%">
            <el-option
              v-for="(label, value) in AUTO_MODE_LABEL"
              :key="value"
              :label="label"
              :value="value"
            />
          </el-select>
        </el-form-item>
        <el-form-item v-if="autoForm.mode === 'knockoutN' || autoForm.mode === 'knockoutN+M'" label="配对方式">
          <el-select v-model="autoForm.pairMode" style="width: 100%">
            <el-option label="半区分组（1v8、4v5、2v7、3v6）" value="halfsplit" />
            <el-option label="高低配（1v8、2v7、3v6、4v5）" value="highlow" />
          </el-select>
          <div class="form-tip">半区分组：1、8、4、5 同半区，2、7、3、6 同半区（需队伍数为 2 的幂：4/8/16）</div>
        </el-form-item>
        <el-form-item label="排位晋级数 N">
          <el-input-number v-model="autoForm.directN" :min="1" :max="32" style="width: 160px" />
          <span class="mode-hint" style="margin-left: 12px">排位赛直接晋级淘汰赛的名额（突围时指第 N 名之前的名次）</span>
        </el-form-item>
        <el-form-item v-if="modeNeedsK" label="突围参赛数 K">
          <el-input-number v-model="autoForm.breakoutK" :min="2" :max="32" style="width: 160px" />
          <span class="mode-hint" style="margin-left: 12px">从排位赛第 N+1 名起取 K 支打突围赛（奇数时末位轮空）</span>
        </el-form-item>
        <el-form-item v-if="modeNeedsM" label="突围晋级数 M">
          <el-input-number v-model="autoForm.breakoutM" :min="1" :max="16" style="width: 160px" />
          <span class="mode-hint" style="margin-left: 12px">从突围赛结果中取前 M 名胜者进入淘汰赛（顺位按排位赛+突围赛合计大小分）</span>
        </el-form-item>
        <el-form-item label="生成轮次">
          <el-input-number v-model="autoForm.roundNumber" :min="1" style="width: 160px" />
          <span class="mode-hint" style="margin-left: 12px">淘汰赛：1 = 1/4 决赛，2 = 半决赛，3 = 决赛（可分批生成不同轮次）</span>
        </el-form-item>
        <el-form-item>
          <el-button :loading="autoLoading" @click="previewAuto">计算大小分排名</el-button>
          <span class="mode-hint">
            {{ autoForm.mode === 'playoff' ? '突围赛：排位第 N+1 名起取 K 支高低配对打，胜者进入淘汰赛' : autoForm.mode === 'knockoutN' ? '淘汰赛：排位赛前 N 名按所选配对方式生成（N 需为偶数）' : '淘汰赛：排位赛前 N 名 + 突围赛前 M 名胜者，按所选配对方式生成' }}
          </span>
        </el-form-item>
      </el-form>

      <el-table
        v-if="autoRanks.length > 0"
        :data="autoRanks"
        size="small"
        max-height="220"
        empty-text="先录入排位赛比分后再计算"
      >
        <el-table-column type="index" label="名次" width="60" :index="(i: number) => i + 1" />
        <el-table-column prop="teamName" label="队伍" min-width="150" />
        <el-table-column prop="wins" label="大分（胜场）" width="110" />
        <el-table-column prop="net" label="小分（净胜局）" width="110" />
      </el-table>

      <!-- 晋级名单：区分哪些队从排位赛直接晋级、哪些从突围赛晋级 -->
      <div v-for="g in autoGroups" :key="g.key" class="auto-group">
        <div class="auto-group-head">
          <span class="auto-group-title">{{ g.title }}</span>
          <el-tag size="small" :type="g.key === 'q' ? 'primary' : 'warning'" effect="plain">
            {{ g.tag }} {{ g.rows.length }} 支
          </el-tag>
        </div>
        <el-table :data="g.rows" size="small" max-height="200">
          <el-table-column type="index" label="晋级位" width="70" :index="(i: number) => i + 1" />
          <el-table-column prop="teamName" label="队伍" min-width="150" />
          <el-table-column prop="wins" label="大分（胜场）" width="110" />
          <el-table-column prop="net" label="小分（净胜局）" width="110" />
        </el-table>
      </div>

      <!-- 第 1 轮配对预览：按半区分组展示，确认半区分组是否正确 -->
      <div v-if="autoPairGroups.length > 0" class="auto-group">
        <div class="auto-group-head">
          <span class="auto-group-title">
            第 1 轮对阵（{{ autoForm.pairMode === 'halfsplit' ? '半区分组' : '高低配' }}）
          </span>
          <el-tag
            v-if="autoForm.pairMode === 'halfsplit' && pairPoolIds.length >= 2 && !pairModeHalfSplitOk"
            size="small"
            type="warning"
            effect="plain"
          >
            队伍数非 2 的幂，生成时将回落高低配
          </el-tag>
        </div>
        <div class="pair-groups">
          <div v-for="g in autoPairGroups" :key="g.half" class="pair-group">
            <div class="pair-group-title">{{ g.half }}</div>
            <div v-for="(p, i) in g.rows" :key="i" class="pair-row">
              <span class="pair-team">{{ p.a }}</span>
              <span class="pair-vs">vs</span>
              <span class="pair-team">{{ p.b }}</span>
            </div>
          </div>
        </div>
      </div>

      <template #footer>
        <el-button @click="autoDialog = false">取消</el-button>
        <el-button type="primary" :disabled="autoRanks.length === 0" @click="generateAuto">
          生成对阵
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  gap: 12px;
  flex-wrap: wrap;
}

.filters {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.filter-select {
  width: 220px;
  flex-shrink: 0;
}

.stage-card {
  margin-bottom: 24px;
}

.stage-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.stage-title {
  font-weight: 700;
  color: var(--cs2-text);
}

.stage-time {
  color: var(--cs2-text-muted);
  font-size: 12px;
}

.matches-block {
  margin-top: 8px;
}

.match-count {
  color: var(--cs2-text-muted);
  font-size: 13px;
}

.group-filter {
  margin-bottom: 12px;
}

.matchup {
  display: flex;
  align-items: center;
  gap: 10px;
}

.op-btns {
  display: flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}

.score {
  color: var(--cs2-accent);
}

.tip {
  margin-bottom: 12px;
}

.form .vs {
  margin: 0 8px;
  color: var(--cs2-text-muted);
}

.form .map-name {
  width: 160px;
  margin-right: 12px;
}

.form .map-score {
  width: 100px;
}

.mode-hint {
  font-size: 12px;
  color: var(--cs2-text-muted);
  line-height: 1.6;
  margin-left: 12px;
}

.form-tip {
  font-size: 12px;
  color: var(--cs2-text-muted);
  line-height: 1.5;
}

.auto-group {
  margin-top: 14px;
}

.auto-group-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.auto-group-title {
  font-weight: 700;
  color: var(--cs2-text);
  font-size: 13px;
}

.pair-groups {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}

.pair-group {
  flex: 1 1 220px;
  background: var(--cs2-panel-2);
  border: 1px solid var(--cs2-border);
  border-radius: 6px;
  padding: 10px 12px;
}

.pair-group-title {
  font-weight: 700;
  font-size: 13px;
  color: var(--cs2-accent);
  margin-bottom: 8px;
}

.pair-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 0;
  font-size: 13px;
}

.pair-team {
  flex: 1;
  color: var(--cs2-text-regular, #c6ccd8);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pair-vs {
  color: var(--cs2-text-muted);
  font-size: 12px;
}
</style>
