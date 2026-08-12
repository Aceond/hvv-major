<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useAuthStore } from '@/stores/auth'
import type { EventItem, Group, Match, Stage, Team } from '@/api/types'
import { MATCH_STATUS_LABEL } from '@/api/types'
import { listGroups, listStages } from '@/api/match'
import { listEvents } from '@/api/event'
import {
  createBookedMatches,
  deleteBookedMatch,
  listApprovedTeams,
  listMyBookedMatches,
  listMyTeam,
  setMatchTime,
} from '@/api/booking'

const auth = useAuthStore()
const router = useRouter()

const events = ref<EventItem[]>([])
const currentEventId = ref('')
const myTeam = ref<Team | null>(null)
const opponents = ref<Team[]>([])
const stages = ref<Stage[]>([])
const groups = ref<Group[]>([])
const booked = ref<Match[]>([])
const loading = ref(false)
const saving = ref(false)
const currentStageId = ref('') // 录入阶段（当前组别，含跨组决赛）

interface Row {
  opponentId: string
  scheduledAt: string
  bestOf: number
}
const rows = reactive<Row[]>([])

function groupName(id: string | null): string {
  return groups.value.find((g) => g.id === id)?.name ?? '-'
}

function teamName(id: string | null): string {
  if (id && id === myTeam.value?.id) return myTeam.value?.name ?? '本队'
  return opponents.value.find((t) => t.id === id)?.name ?? '待定'
}

function eventLabel(e: EventItem) {
  return `${e.name}${e.edition ? `（第 ${e.edition} 届）` : ''}`
}

/** 阶段下拉文案：阶段名（组别名），进行中阶段加标记 */
function stageLabel(s: Stage): string {
  const g = s.group_name ? ` · ${s.group_name}` : ''
  return `${s.name}${g}${s.status === 'running' ? '（进行中）' : ''}`
}

/** 对手分组：本组别队伍优先，其余放「其他组别」 */
const myGroupId = computed(() => myTeam.value?.group_id ?? null)
const groupOpponents = computed(() =>
  opponents.value.filter((t) => t.group_id === myGroupId.value),
)
const otherOpponents = computed(() =>
  opponents.value.filter((t) => t.group_id !== myGroupId.value),
)

/** 默认选中阶段：本组别进行中阶段优先，否则第一个 */
function selectDefaultStage() {
  const list = stages.value
  const running = list.find((s) => s.status === 'running')
  currentStageId.value = running?.id ?? list[0]?.id ?? ''
}

async function load() {
  if (!auth.isLoggedIn) return
  loading.value = true
  try {
    groups.value = await listGroups()
    // 约战按赛事上下文取「我的战队」：该赛事下我是队长的已审核战队
    myTeam.value = await listMyTeam(auth.user?.id, currentEventId.value || null)
    // 阶段：当前组别 + 跨组决赛（供录入选择）
    stages.value = await listStages(
      currentEventId.value || undefined,
      myTeam.value?.group_id || undefined,
    )
    selectDefaultStage()
    if (myTeam.value) {
      opponents.value = await listApprovedTeams(currentEventId.value || null, myTeam.value.id)
      await loadBooked()
    } else {
      opponents.value = []
      booked.value = []
    }
  } finally {
    loading.value = false
  }
}

async function init() {
  events.value = await listEvents()
  const active =
    events.value.find((e) => e.status === 'running') ??
    events.value.find((e) => e.status === 'signup') ??
    events.value[0]
  currentEventId.value = active?.id ?? ''
  await load()
}

async function loadBooked() {
  if (!myTeam.value) return
  loading.value = true
  try {
    booked.value = await listMyBookedMatches(myTeam.value.id)
  } finally {
    loading.value = false
  }
}

function addRow() {
  if (rows.length >= 5) {
    ElMessage.info('一次最多录入 5 场，可分多次提交')
    return
  }
  rows.push({ opponentId: '', scheduledAt: '', bestOf: 1 })
}

function removeRow(i: number) {
  rows.splice(i, 1)
}

async function saveRows() {
  if (!myTeam.value) return
  const valid = rows.filter((r) => r.opponentId && r.scheduledAt)
  if (valid.length === 0) {
    ElMessage.warning('请先填写至少一场约战（对手 + 时间）')
    return
  }
  const now = Date.now()
  for (const r of valid) {
    if (new Date(r.scheduledAt.replace(' ', 'T')).getTime() <= now) {
      ElMessage.warning('比赛时间需为未来时间')
      return
    }
  }
  const stage = stages.value.find((s) => s.id === currentStageId.value)
  if (!stage) {
    ElMessage.warning('请先选择录入阶段')
    return
  }
  saving.value = true
  try {
    const created = await createBookedMatches(myTeam.value, valid, stage.id)
    if (created && created.length > 0) {
      ElMessage.success(`已录入 ${created.length} 场约战，将展示在赛程页`)
      rows.splice(0, rows.length)
      await loadBooked()
    } else {
      ElMessage.error('录入失败，请确认数据库权限后重试')
    }
  } finally {
    saving.value = false
  }
}

async function removeMatch(m: Match) {
  try {
    await ElMessageBox.confirm(
      `确认删除 ${teamName(m.team_a_id)} vs ${teamName(m.team_b_id)} 这场比赛吗？`,
      '删除约战',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  await deleteBookedMatch(m.id)
  ElMessage.success('已删除')
  await loadBooked()
}

// 为系统自动排阵的比赛补录约战时间
const timeDialog = ref(false)
const timeForm = reactive({ matchId: '', scheduledAt: '' })
const savingTime = ref(false)

function openTimeDialog(m: Match) {
  timeForm.matchId = m.id
  timeForm.scheduledAt = ''
  timeDialog.value = true
}

async function saveTime() {
  if (!timeForm.scheduledAt) {
    ElMessage.warning('请选择比赛时间')
    return
  }
  if (new Date(timeForm.scheduledAt.replace(' ', 'T')).getTime() <= Date.now()) {
    ElMessage.warning('比赛时间需为未来时间')
    return
  }
  savingTime.value = true
  try {
    await setMatchTime(timeForm.matchId, timeForm.scheduledAt)
    ElMessage.success('时间已保存，赛程页将公开展示')
    timeDialog.value = false
    await loadBooked()
  } catch (e: any) {
    ElMessage.error(e.message || '保存失败，请检查权限')
  } finally {
    savingTime.value = false
  }
}

onMounted(init)
</script>

<template>
  <div class="page-container booking-page">
    <h2 class="title">约战录入</h2>
    <p class="subtitle">
      本次比赛为自由约战制：由各战队队长自行约对手、定时间（仅队长可录入）。录入后会在「赛程」页公开展示，双方战队均可看到。
    </p>

    <div class="event-bar" v-if="events.length">
      <el-select v-model="currentEventId" placeholder="选择赛事" @change="load">
        <el-option v-for="e in events" :key="e.id" :label="eventLabel(e)" :value="e.id" />
      </el-select>
    </div>

    <!-- 未登录 -->
    <el-empty v-if="!auth.isLoggedIn" description="请先登录后录入约战">
      <el-button type="primary" @click="router.push({ name: 'login' })">去登录</el-button>
    </el-empty>

    <!-- 已登录但不是队长 -->
    <el-empty
      v-else-if="!myTeam"
      description="仅战队队长可录入约战。请使用队长账号登录，或联系本队队长录入。"
    >
      <el-button type="primary" plain @click="router.push({ name: 'home' })">返回首页</el-button>
    </el-empty>

    <template v-else>
      <!-- 我的战队 -->
      <el-card class="my-team" shadow="never">
        <div class="team-info">
          <div class="team-name">
            {{ myTeam.name }}
            <el-tag v-if="myTeam.tag" size="small" effect="plain">{{ myTeam.tag }}</el-tag>
          </div>
          <el-tag type="info" size="small" effect="plain">
            组别：{{ groupName(myTeam.group_id) }}
          </el-tag>
        </div>
        <div v-if="myTeam.captain_name || myTeam.captain_pw" class="captain-info">
          队长：{{ myTeam.captain_name || '-' }}（完美 ID：{{ myTeam.captain_pw || '-' }}）
        </div>
        <div class="stage-info">
          <span>录入阶段：</span>
          <el-select
            v-model="currentStageId"
            size="small"
            placeholder="选择阶段"
            class="stage-select"
          >
            <el-option v-for="s in stages" :key="s.id" :label="stageLabel(s)" :value="s.id" />
          </el-select>
        </div>
      </el-card>

      <!-- 录入表单 -->
      <el-card class="form-card" shadow="never">
        <template #header>
          <div class="card-header">
            <span>录入接下来的比赛</span>
            <el-button size="small" type="primary" plain @click="addRow">+ 添加一场</el-button>
          </div>
        </template>

        <div v-if="rows.length === 0" class="empty-rows">
          点击右上角「添加一场」开始录入约战（对手 + 时间）。
        </div>

        <div v-for="(r, i) in rows" :key="i" class="booking-row">
          <el-select
            v-model="r.opponentId"
            filterable
            placeholder="选择对手战队"
            class="row-opponent"
          >
            <el-option-group v-if="groupOpponents.length" label="本组别">
              <el-option v-for="t in groupOpponents" :key="t.id" :label="t.name" :value="t.id" />
            </el-option-group>
            <el-option-group v-if="otherOpponents.length" label="其他组别">
              <el-option
                v-for="t in otherOpponents"
                :key="t.id"
                :label="`${t.name}（${groupName(t.group_id)}）`"
                :value="t.id"
              />
            </el-option-group>
          </el-select>

          <el-date-picker
            v-model="r.scheduledAt"
            type="datetime"
            placeholder="选择比赛时间"
            format="YYYY-MM-DD HH:mm"
            value-format="YYYY-MM-DD HH:mm"
            :disabled-date="(d: Date) => d.getTime() < Date.now() - 86400000"
            class="row-time"
          />

          <el-select v-model="r.bestOf" class="row-bo">
            <el-option label="BO1" :value="1" />
            <el-option label="BO3" :value="3" />
          </el-select>

          <el-button link type="danger" class="row-remove" @click="removeRow(i)">
            移除
          </el-button>
        </div>

        <div class="form-actions">
          <el-button
            type="primary"
            :loading="saving"
            :disabled="rows.length === 0"
            @click="saveRows"
          >
            提交约战
          </el-button>
        </div>
      </el-card>

      <!-- 我的未来比赛 -->
      <el-card class="list-card" shadow="never" v-loading="loading">
        <template #header>
          <span>我的未来比赛（{{ booked.length }}）</span>
        </template>
        <el-table :data="booked" stripe empty-text="暂无已录入的约战">
          <el-table-column label="时间" min-width="150">
            <template #default="{ row }">
              <span v-if="row.scheduled_at">{{ row.scheduled_at }}</span>
              <el-tag v-else size="small" type="warning" effect="plain">待定（系统排阵）</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="对阵" min-width="220">
            <template #default="{ row }">
              <span class="vs">{{ teamName(row.team_a_id) }}</span>
              <span class="vs-tag">vs</span>
              <span class="vs">{{ teamName(row.team_b_id) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="赛制" width="80">
            <template #default="{ row }">BO{{ row.best_of }}</template>
          </el-table-column>
          <el-table-column label="状态" width="90">
            <template #default="{ row }">
              <el-tag type="warning" size="small">
                {{ MATCH_STATUS_LABEL[row.status as Match['status']] }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="110">
            <template #default="{ row }">
              <el-button
                v-if="!row.scheduled_at"
                link
                type="primary"
                @click="openTimeDialog(row)"
              >
                录时间
              </el-button>
              <el-button v-else link type="danger" @click="removeMatch(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-card>

      <!-- 为系统排阵比赛补录时间 -->
      <el-dialog v-model="timeDialog" title="补录比赛时间" width="380px">
        <el-alert
          type="info"
          :closable="false"
          title="该比赛由系统自动排阵生成，对阵已确定，只需补录约战时间。保存后将在赛程页公开展示。"
          class="time-tip"
        />
        <el-form label-width="80px" class="time-form">
          <el-form-item label="比赛时间">
            <el-date-picker
              v-model="timeForm.scheduledAt"
              type="datetime"
              placeholder="选择比赛时间"
              format="YYYY-MM-DD HH:mm"
              value-format="YYYY-MM-DD HH:mm"
              style="width: 100%"
            />
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="timeDialog = false">取消</el-button>
          <el-button type="primary" :loading="savingTime" @click="saveTime">保存</el-button>
        </template>
      </el-dialog>
    </template>
  </div>
</template>

<style scoped>
.title {
  margin: 0 0 4px;
}

.subtitle {
  margin: 0 0 20px;
  color: var(--cs2-text-muted);
  font-size: 13px;
}

.event-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.captain-info {
  margin-top: 8px;
  font-size: 13px;
  color: var(--cs2-text-regular, #c6ccd8);
}

.my-team {
  margin-bottom: 16px;
  background: linear-gradient(120deg, rgba(255, 176, 32, 0.06), transparent);
  border: 1px solid rgba(255, 176, 32, 0.25);
}

.team-info {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.team-name {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 18px;
  font-weight: 700;
  color: var(--cs2-accent);
}

.stage-info {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--cs2-text-regular, #c6ccd8);
  font-size: 13px;
}

.stage-select {
  width: 220px;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.form-card {
  margin-bottom: 16px;
}

.empty-rows {
  padding: 20px 0;
  text-align: center;
  color: var(--cs2-text-muted);
  border: 1px dashed var(--cs2-border-strong);
  border-radius: 8px;
}

.booking-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.row-opponent {
  flex: 1;
  min-width: 220px;
}

.row-time {
  width: 200px;
}

.row-bo {
  width: 96px;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 8px;
}

.list-card {
  margin-bottom: 16px;
}

.time-tip {
  margin-bottom: 12px;
}

.vs {
  color: var(--cs2-text-regular, #c6ccd8);
}

.vs-tag {
  margin: 0 8px;
  color: var(--cs2-accent);
  font-weight: 700;
}

/* ---------- 移动端适配 ---------- */
@media (max-width: 768px) {
  .booking-row {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
    padding: 10px;
    border: 1px solid var(--cs2-border);
    border-radius: 8px;
  }

  .row-opponent,
  .row-time,
  .row-bo {
    width: 100%;
    min-width: 0;
  }

  .row-remove {
    align-self: flex-end;
  }

  .form-actions .el-button {
    width: 100%;
  }

  .stage-select {
    width: 100%;
    flex: 1;
  }
}
</style>
