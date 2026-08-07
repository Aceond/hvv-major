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
  updateMatchResult,
  updateStage,
} from '@/api/admin'
import { listEvents } from '@/api/event'

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
const scoreForm = reactive({ matchId: '', aScore: 0, bScore: 0 })

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

function openScore(row: Match) {
  scoreForm.matchId = row.id
  scoreForm.aScore = row.team_a_score
  scoreForm.bScore = row.team_b_score
  scoreDialog.value = true
}

async function saveScore() {
  await updateMatchResult(scoreForm.matchId, scoreForm.aScore, scoreForm.bScore)
  scoreDialog.value = false
  ElMessage.success('比分已录入')
  onFilterChange()
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
          :label="`${s.name} · ${STAGE_FORMAT_LABEL[s.format]}（${STAGE_STATUS_LABEL[s.status]}）`"
          :name="s.id"
        />
      </el-tabs>

      <div class="toolbar">
        <span class="match-count">对阵 {{ matches.length }} 场</span>
        <el-button type="primary" size="small" :disabled="stages.length === 0" @click="matchDialog = true">
          新建对阵
        </el-button>
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
          <el-table-column label="操作" width="110">
            <template #default="{ row }">
              <el-button
                v-if="row.team_a_id && row.team_b_id"
                size="small"
                type="primary"
                @click="openScore(row)"
              >
                {{ row.status === 'completed' ? '修改比分' : '录入比分' }}
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-card>
    </div>

    <!-- 比分录入 -->
    <el-dialog v-model="scoreDialog" title="录入比分" width="420px">
      <el-alert type="info" :closable="false" title="按地图比分填写，系统自动判定胜者并计入积分榜。" class="tip" />
      <el-form label-width="90px" class="form">
        <el-form-item label="比分">
          <el-input-number v-model="scoreForm.aScore" :min="0" /> <span class="vs">:</span>
          <el-input-number v-model="scoreForm.bScore" :min="0" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="scoreDialog = false">取消</el-button>
        <el-button type="primary" @click="saveScore">保存</el-button>
      </template>
    </el-dialog>

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
            <el-option v-for="s in stages" :key="s.id" :label="s.name" :value="s.id" />
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
        <el-form-item label="开赛时间"><el-input v-model="matchForm.scheduledAt" placeholder="2026-08-15 13:00" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="matchDialog = false">取消</el-button>
        <el-button type="primary" @click="addMatch">创建</el-button>
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
}

.filters {
  display: flex;
  gap: 12px;
}

.filter-select {
  width: 220px;
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
</style>
