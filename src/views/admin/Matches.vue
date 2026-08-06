<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import type { Group, Match, Stage, StageFormat, Team } from '@/api/types'
import { MATCH_STATUS_LABEL, STAGE_FORMAT_LABEL, STAGE_STATUS_LABEL } from '@/api/types'
import {
  createMatch,
  createStage,
  listGroups,
  listMatches,
  listStages,
  listTeams,
  updateMatchResult,
} from '@/api/admin'

const stages = ref<Stage[]>([])
const groups = ref<Group[]>([])
const teams = ref<Team[]>([])
const currentStage = ref<string>('')
const currentGroup = ref<string>('')
const matches = ref<Match[]>([])
const loading = ref(false)

// 比分录入
const scoreDialog = ref(false)
const scoreForm = reactive({ matchId: '', aScore: 0, bScore: 0 })

// 新建阶段
const stageDialog = ref(false)
const stageForm = reactive<{
  name: string
  format: StageFormat
  status: Stage['status']
}>({ name: '', format: 'round_robin', status: 'upcoming' })

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

async function load() {
  loading.value = true
  try {
    stages.value = await listStages()
    groups.value = await listGroups()
    teams.value = await listTeams()
    if (!stages.value.some((s) => s.id === currentStage.value)) {
      currentStage.value = stages.value[0]?.id ?? ''
    }
    matches.value = await listMatches(currentStage.value, currentGroup.value || undefined)
  } finally {
    loading.value = false
  }
}

async function onFilterChange() {
  matches.value = await listMatches(currentStage.value, currentGroup.value || undefined)
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

async function addStage() {
  if (!stageForm.name) return
  await createStage({ ...stageForm })
  stageDialog.value = false
  ElMessage.success('阶段已创建')
  load()
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
      <div>
        <el-button @click="stageDialog = true">新建阶段</el-button>
        <el-button type="primary" @click="matchDialog = true">新建对阵</el-button>
      </div>
    </div>

    <el-tabs v-model="currentStage" @tab-change="onFilterChange">
      <el-tab-pane
        v-for="s in stages"
        :key="s.id"
        :label="`${s.name} · ${STAGE_FORMAT_LABEL[s.format]}（${STAGE_STATUS_LABEL[s.status]}）`"
        :name="s.id"
      />
    </el-tabs>

    <el-radio-group v-model="currentGroup" class="group-filter" @change="onFilterChange">
      <el-radio-button value="">全部组别</el-radio-button>
      <el-radio-button v-for="g in groups" :key="g.id" :value="g.id">{{ g.name }}</el-radio-button>
    </el-radio-group>

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

    <!-- 新建阶段 -->
    <el-dialog v-model="stageDialog" title="新建阶段" width="420px">
      <el-form label-width="80px">
        <el-form-item label="阶段名称"><el-input v-model="stageForm.name" placeholder="海选 / 预选赛 / 正赛" /></el-form-item>
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
      </el-form>
      <template #footer>
        <el-button @click="stageDialog = false">取消</el-button>
        <el-button type="primary" @click="addStage">创建</el-button>
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

.group-filter {
  margin-bottom: 16px;
}

.matchup {
  display: flex;
  align-items: center;
  gap: 10px;
}

.score {
  color: #409eff;
}

.tip {
  margin-bottom: 12px;
}

.form .vs {
  margin: 0 8px;
  color: #909399;
}
</style>
