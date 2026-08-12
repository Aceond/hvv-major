<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { EventItem, Group, Match, Stage, StageFormat, StageStatus, Team } from '@/api/types'
import { MATCH_STATUS_LABEL, STAGE_FORMAT_LABEL, STAGE_STATUS_LABEL } from '@/api/types'
import {
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
const mapRows = reactive<MapRow[]>([
  { mapName: '', a: 0, b: 0 },
  { mapName: '', a: 0, b: 0 },
  { mapName: '', a: 0, b: 0 },
])

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
  startAt: string
  endAt: string
}>({ name: '', format: 'round_robin', status: 'upcoming', groupId: '', startAt: '', endAt: '' })

// 新建对阵
const matchDialog = ref(false)
const matchForm = reactive({
  stageId: '',
  groupId: '',
  roundNumber: 1,
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
  for (let i = 0; i < 3; i++) {
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
  stageForm.startAt = stage?.start_at ?? ''
  stageForm.endAt = stage?.end_at ?? ''
  stageDialog.value = true
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
    start_at: stageForm.startAt || null,
    end_at: stageForm.endAt || null,
  }
  if (stageEditId.value) {
    await updateStage(stageEditId.value, payload)
    ElMessage.success('阶段已更新')
  } else {
    await createStage({ ...payload, event_id: currentEventId.value || null })
    ElMessage.success('阶段已创建')
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
const autoGenerated = ref(false)
const autoForm = reactive({
  srcStageId: '',
  dstStageId: '',
  mode: 'playoff' as 'playoff' | 'knockout8' | 'knockout6+2',
})

const AUTO_MODE_LABEL: Record<string, string> = {
  playoff: '突围赛（7vs10、8vs9）',
  knockout8: '淘汰赛（8 队高低配 1vs8…）',
  'knockout6+2': '淘汰赛（前 6 + 突围胜者 2 队）',
}

function openAutoDialog() {
  autoForm.srcStageId = stages.value[0]?.id ?? ''
  autoForm.dstStageId = stages.value[1]?.id ?? ''
  autoForm.mode = 'playoff'
  autoRanks.value = []
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

/** 高低配：第 i 名 vs 倒数第 i 名（1vs8、2vs7…） */
function seedPairs(ids: string[]): Array<[string, string]> {
  const n = ids.length
  return Array.from({ length: Math.floor(n / 2) }, (_, i) => [ids[i], ids[n - 1 - i]])
}

async function previewAuto() {
  if (!autoForm.srcStageId) {
    ElMessage.warning('请选择排位赛（源）阶段')
    return
  }
  autoLoading.value = true
  try {
    const ms = await listMatches(autoForm.srcStageId)
    autoRanks.value = computeRanks(ms)
    if (autoRanks.value.length === 0) {
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
  let pairs: Array<[string, string]> = []
  const bestOf = 3
  if (autoForm.mode === 'playoff') {
    if (ranks.length < 10) {
      ElMessage.warning('突围赛需要 10 支队伍完成排位赛')
      return
    }
    // 7打10、8打9（排名第 8 位的打第 9 位）
    pairs = [
      [ranks[6].teamId, ranks[9].teamId],
      [ranks[7].teamId, ranks[8].teamId],
    ]
  } else if (autoForm.mode === 'knockout8') {
    if (ranks.length < 8) {
      ElMessage.warning('淘汰赛需要至少 8 支队伍完成排位赛')
      return
    }
    pairs = seedPairs(ranks.slice(0, 8).map((r) => r.teamId))
  } else {
    // 挑战组淘汰赛：排位赛前 6 直接晋级 + 突围赛胜者 2 队（按突围赛大小分排 7/8 位）
    const playoffStage = stages.value.find(
      (s) => s.id !== dst && (s.format === 'single_elim' || s.name.includes('突围')),
    )
    if (!playoffStage) {
      ElMessage.warning('未找到突围赛阶段')
      return
    }
    const pm = await listMatches(playoffStage.id)
    if (!pm.some((m) => m.status === 'completed' && m.winner_id)) {
      ElMessage.warning('突围赛尚未有结果，请先录入突围赛比分')
      return
    }
    const pr = computeRanks(pm)
    const challengers = pr.filter((r) => pm.some((m) => m.winner_id === r.teamId)).slice(0, 2)
    if (challengers.length < 2) {
      ElMessage.warning('突围赛未全部结束，无法生成淘汰赛')
      return
    }
    if (ranks.length < 6) {
      ElMessage.warning('排位赛需至少 6 支队伍完成')
      return
    }
    pairs = seedPairs([
      ...ranks.slice(0, 6).map((r) => r.teamId),
      ...challengers.slice(0, 2).map((r) => r.teamId),
    ])
  }
  for (const [a, b] of pairs) {
    await createMatch({ stage_id: dst, round_number: 1, team_a_id: a, team_b_id: b, best_of: bestOf })
  }
  ElMessage.success(`已生成 ${pairs.length} 场对阵`)
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
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag
              size="small"
              :type="row.status === 'running' ? 'success' : row.status === 'ended' ? 'info' : 'warning'"
            >
              {{ STAGE_STATUS_LABEL[row.status as StageStatus] }}
            </el-tag>
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
          <el-table-column label="对阵" min-width="260">
            <template #default="{ row }">
              <div class="matchup">
                <span>{{ row.team_a_name }}</span>
                <b class="score">{{ row.team_a_score }} : {{ row.team_b_score }}</b>
                <span>{{ row.team_b_name }}</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="赛制" width="70">
            <template #default="{ row }">BO{{ row.best_of }}</template>
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
          <el-table-column label="状态" width="90">
            <template #default="{ row }">
              <el-tag :type="row.status === 'completed' ? 'success' : 'warning'">
                {{ MATCH_STATUS_LABEL[row.status as Match['status']] }}
              </el-tag>
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
          </el-radio-group>
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
    <el-dialog v-model="autoDialog" title="自动排阵" width="640px">
      <el-alert
        type="info"
        :closable="false"
        title="从「源阶段」已结束的比赛统计大小分排名，按所选模式生成对阵到「目标阶段」。目标阶段若已有对阵将无法生成。"
        class="tip"
      />
      <el-form label-width="90px">
        <el-form-item label="源阶段（排位赛）">
          <el-select v-model="autoForm.srcStageId" style="width: 100%">
            <el-option v-for="s in stages" :key="s.id" :label="stageDisplayName(s)" :value="s.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="目标阶段">
          <el-select v-model="autoForm.dstStageId" style="width: 100%">
            <el-option v-for="s in stages" :key="s.id" :label="stageDisplayName(s)" :value="s.id" />
          </el-select>
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
        <el-form-item>
          <el-button :loading="autoLoading" @click="previewAuto">计算大小分排名</el-button>
          <span class="mode-hint">
            挑战组：突围赛(7vs10、8vs9) → 淘汰赛(前6+突围2)；
            大师/传奇组：淘汰赛(8队高低配)
          </span>
        </el-form-item>
      </el-form>

      <el-table
        v-if="autoRanks.length > 0"
        :data="autoRanks"
        size="small"
        max-height="260"
        empty-text="先录入排位赛比分后再计算"
      >
        <el-table-column type="index" label="名次" width="60" :index="(i: number) => i + 1" />
        <el-table-column prop="teamName" label="队伍" min-width="150" />
        <el-table-column prop="wins" label="大分（胜场）" width="110" />
        <el-table-column prop="net" label="小分（净胜局）" width="110" />
      </el-table>

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
</style>
