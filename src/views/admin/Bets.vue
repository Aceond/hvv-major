<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import type { EventItem, Group, Match, Stage, Team } from '@/api/types'
import { listEvents } from '@/api/event'
import { listGroups, listMatches, listStages } from '@/api/match'
import { listTeams } from '@/api/admin'
import {
  createPoll,
  deletePoll,
  listPolls,
  settlePoll,
  updatePoll,
  computeMatchOdds,
  newOptionId,
  BET_KIND_LABEL,
  BET_STATUS_LABEL,
  type BetKind,
  type BetOption,
  type BetPoll,
} from '@/api/bet'
import { formatDateTime } from '@/utils/format'

const events = ref<EventItem[]>([])
const groups = ref<Group[]>([])
const teams = ref<Team[]>([])
const stages = ref<Stage[]>([])
const currentEvent = ref('')
const polls = ref<BetPoll[]>([])
const loading = ref(false)

const filteredPolls = computed(() =>
  polls.value.filter((p) => !currentEvent.value || p.event_id === currentEvent.value),
)

function eventName(id: string | null) {
  return events.value.find((e) => e.id === id)?.name ?? '未关联赛事'
}

function statusType(s: BetPoll['status']) {
  return s === 'settled' ? 'success' : s === 'closed' ? 'info' : 'warning'
}

async function load() {
  loading.value = true
  try {
    events.value = await listEvents()
    groups.value = await listGroups()
    teams.value = await listTeams()
    stages.value = await listStages()
    polls.value = await listPolls()
  } finally {
    loading.value = false
  }
}

// ---------------- 新建竞猜 ----------------
const dialogVisible = ref(false)
const saving = ref(false)
const form = reactive({ eventId: '', title: '', kind: 'custom' as BetKind })

/** 编辑中的选项草稿 */
const draftOptions = ref<BetOption[]>([])
// 组别冠军：组别
const draftGroup = ref('')
// 比赛胜者 / 阶段晋级：阶段 → 比赛
const draftStage = ref('')
const stageMatches = ref<Match[]>([])
const draftMatch = ref('')

function openCreate() {
  dialogVisible.value = true
  form.eventId = currentEvent.value || events.value[0]?.id || ''
  form.title = ''
  form.kind = 'custom'
  draftOptions.value = []
  draftGroup.value = ''
  draftStage.value = ''
  draftMatch.value = ''
  stageMatches.value = []
}

function onKindChange() {
  draftOptions.value = []
  draftGroup.value = ''
  draftStage.value = ''
  draftMatch.value = ''
  stageMatches.value = []
}

/** 组别冠军 / 阶段晋级：由所选组别/阶段的队伍生成选项 */
function buildTeamOptions(teamIds: string[]) {
  const map = new Map(teams.value.map((t) => [t.id, t]))
  draftOptions.value = [...new Set(teamIds)].map((tid) => {
    const t = map.get(tid)
    return { id: newOptionId(), label: t?.name ?? '未知队伍', team_id: tid, odds: 1.5 }
  })
}

/** 组别冠军：从所选组别的已通过战队生成 */
function onGroupSelect() {
  if (!draftGroup.value) return
  buildTeamOptions(
    teams.value
      .filter((t) => t.group_id === draftGroup.value && t.status === 'approved')
      .map((t) => t.id),
  )
}

/** 阶段晋级：优先取该阶段已有对阵的队伍，无对阵记录时回退用组别战队 */
async function onStageForAdvance() {
  if (!draftStage.value) return
  const ms = await listMatches(draftStage.value)
  const ids = [...new Set(ms.flatMap((m) => [m.team_a_id, m.team_b_id].filter(Boolean) as string[]))]
  if (ids.length > 0) {
    buildTeamOptions(ids)
    return
  }
  const stage = stages.value.find((s) => s.id === draftStage.value)
  buildTeamOptions(
    teams.value
      .filter((t) => t.group_id === stage?.group_id && t.status === 'approved')
      .map((t) => t.id),
  )
}

async function onStageForMatch() {
  const stage = stages.value.find((s) => s.id === draftStage.value)
  if (!stage) return
  draftMatch.value = ''
  stageMatches.value = await listMatches(stage.id)
}

async function onMatchSelect() {
  const m = stageMatches.value.find((x) => x.id === draftMatch.value)
  if (!m || !m.team_a_id || !m.team_b_id) return
  const { a, b } = await computeMatchOdds(m.team_a_id, m.team_b_id)
  const nameOf = (tid: string | null) => teams.value.find((t) => t.id === tid)?.name ?? '未知队伍'
  draftOptions.value = [
    { id: newOptionId(), label: `${nameOf(m.team_a_id)} 胜`, team_id: m.team_a_id, odds: a },
    { id: newOptionId(), label: `${nameOf(m.team_b_id)} 胜`, team_id: m.team_b_id, odds: b },
  ]
}

function addCustomOption() {
  draftOptions.value.push({ id: newOptionId(), label: '', team_id: null, odds: 1.5 })
}

function removeDraftOption(id: string) {
  draftOptions.value = draftOptions.value.filter((o) => o.id !== id)
}

async function submitCreate() {
  if (!form.eventId) {
    ElMessage.warning('请选择赛事')
    return
  }
  if (!form.title.trim()) {
    ElMessage.warning('请填写竞猜标题')
    return
  }
  const valid = draftOptions.value.filter((o) => o.label.trim())
  if (valid.length < 2) {
    ElMessage.warning('至少需要 2 个有效竞猜选项')
    return
  }
  for (const o of valid) {
    if (!(o.odds > 1)) {
      ElMessage.warning(`「${o.label}」的赔率必须大于 1`)
      return
    }
  }
  saving.value = true
  try {
    await createPoll({
      event_id: form.eventId,
      title: form.title.trim(),
      kind: form.kind,
      options: valid,
    })
    ElMessage.success('竞猜已发布')
    dialogVisible.value = false
    await load()
  } catch (e: any) {
    ElMessage.error(e.message || '发布失败')
  } finally {
    saving.value = false
  }
}

// ---------------- 操作：截止 / 重开 / 结算 / 删除 ----------------
async function toggleClose(poll: BetPoll) {
  const to = poll.status === 'open' ? 'closed' : 'open'
  try {
    await updatePoll(poll.id, { status: to })
    ElMessage.success(to === 'closed' ? '已截止投注' : '已重新开放')
    await load()
  } catch (e: any) {
    ElMessage.error(e.message || '操作失败')
  }
}

const settleDialog = ref(false)
const settlePollRef = ref<BetPoll | null>(null)
const settleWinner = ref('')

function openSettle(poll: BetPoll) {
  settlePollRef.value = poll
  settleWinner.value = ''
  settleDialog.value = true
}

async function confirmSettle() {
  if (!settlePollRef.value || !settleWinner.value) {
    ElMessage.warning('请选择中奖选项')
    return
  }
  try {
    await settlePoll(settlePollRef.value.id, settleWinner.value)
    ElMessage.success('已结算，中奖积分已发放')
    settleDialog.value = false
    await load()
  } catch (e: any) {
    ElMessage.error(e.message || '结算失败')
  }
}

async function remove(poll: BetPoll) {
  try {
    await ElMessageBox.confirm(
      `确认删除「${poll.title}」吗？该竞猜的全部投注记录将一并删除，且无法恢复。`,
      '删除竞猜',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  try {
    await deletePoll(poll.id)
    ElMessage.success('已删除')
    await load()
  } catch (e: any) {
    ElMessage.error(e.message || '删除失败')
  }
}

onMounted(load)
</script>

<template>
  <div>
    <h2>竞猜管理</h2>

    <div class="filters-bar">
      <el-select
        v-model="currentEvent"
        placeholder="全部赛事"
        clearable
        style="width: 220px"
        @change="load"
      >
        <el-option
          v-for="e in events"
          :key="e.id"
          :label="`${e.name}${e.edition ? `（第 ${e.edition} 届）` : ''}`"
          :value="e.id"
        />
      </el-select>
      <el-button type="primary" :icon="Plus" @click="openCreate">发布竞猜</el-button>
    </div>

    <el-table v-loading="loading" :data="filteredPolls" stripe>
      <el-table-column type="expand">
        <template #default="{ row }">
          <div class="options-list">
            <div
              v-for="opt in row.options"
              :key="opt.id"
              class="opt-row"
              :class="{ 'opt-winner': opt.id === row.winning_option_id }"
            >
              <span class="opt-label">{{ opt.label }}</span>
              <el-tag size="small" type="danger" effect="plain">赔率 {{ opt.odds }}</el-tag>
              <el-tag v-if="opt.id === row.winning_option_id" size="small" type="success" effect="dark">中奖</el-tag>
            </div>
          </div>
        </template>
      </el-table-column>
      <el-table-column prop="title" label="竞猜标题" min-width="200" />
      <el-table-column label="类型" width="100">
        <template #default="{ row }">{{ BET_KIND_LABEL[row.kind as BetKind] }}</template>
      </el-table-column>
      <el-table-column label="赛事" min-width="140">
        <template #default="{ row }">{{ eventName(row.event_id) }}</template>
      </el-table-column>
      <el-table-column label="选项" width="70">
        <template #default="{ row }">{{ row.options.length }}</template>
      </el-table-column>
      <el-table-column label="状态" width="90">
        <template #default="{ row }">
          <el-tag size="small" :type="statusType(row.status as BetPoll['status'])" effect="plain">
            {{ BET_STATUS_LABEL[row.status as BetPoll['status']] }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="发布时间" min-width="130">
        <template #default="{ row }">{{ formatDateTime(row.created_at) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="200">
        <template #default="{ row }">
          <el-button v-if="row.status === 'open'" size="small" @click="toggleClose(row)">截止</el-button>
          <el-button v-else-if="row.status === 'closed'" size="small" @click="toggleClose(row)">重开</el-button>
          <el-button v-if="row.status !== 'settled'" size="small" type="success" @click="openSettle(row)">
            结算
          </el-button>
          <el-button size="small" type="danger" link @click="remove(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 发布竞猜 -->
    <el-dialog v-model="dialogVisible" title="发布竞猜" width="620px">
      <el-form label-width="90px">
        <el-form-item label="赛事">
          <el-select v-model="form.eventId" placeholder="选择赛事" style="width: 100%">
            <el-option
              v-for="e in events"
              :key="e.id"
              :label="`${e.name}${e.edition ? `（第 ${e.edition} 届）` : ''}`"
              :value="e.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="竞猜标题">
          <el-input v-model="form.title" placeholder="例如：传奇组冠军 / 小组赛第2轮胜者 / 淘汰赛晋级队伍" maxlength="60" />
        </el-form-item>
        <el-form-item label="竞猜类型">
          <el-select v-model="form.kind" style="width: 100%" @change="onKindChange">
            <el-option v-for="(label, k) in BET_KIND_LABEL" :key="k" :label="label" :value="k" />
          </el-select>
        </el-form-item>

        <!-- 组别冠军 -->
        <template v-if="form.kind === 'group_champion'">
          <el-form-item label="选择组别">
            <el-select
              v-model="draftGroup"
              placeholder="选择组别"
              style="width: 100%"
              @change="onGroupSelect"
            >
              <el-option v-for="g in groups" :key="g.id" :label="g.name" :value="g.id" />
            </el-select>
          </el-form-item>
        </template>

        <!-- 阶段晋级 -->
        <template v-if="form.kind === 'stage_advance'">
          <el-form-item label="选择阶段">
            <el-select v-model="draftStage" placeholder="选择阶段" style="width: 100%" @change="onStageForAdvance">
              <el-option
                v-for="s in stages.filter((x) => !form.eventId || x.event_id === form.eventId)"
                :key="s.id"
                :label="s.name"
                :value="s.id"
              />
            </el-select>
          </el-form-item>
        </template>

        <!-- 比赛胜者 -->
        <template v-if="form.kind === 'match_winner'">
          <el-form-item label="选择阶段">
            <el-select v-model="draftStage" placeholder="选择阶段" style="width: 100%" @change="onStageForMatch">
              <el-option
                v-for="s in stages.filter((x) => !form.eventId || x.event_id === form.eventId)"
                :key="s.id"
                :label="s.name"
                :value="s.id"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="选择比赛">
            <el-select
              v-model="draftMatch"
              placeholder="选择要竞猜的比赛"
              style="width: 100%"
              :disabled="stageMatches.length === 0"
              @change="onMatchSelect"
            >
              <el-option
                v-for="m in stageMatches"
                :key="m.id"
                :label="`${m.team_a_name ?? '?'} vs ${m.team_b_name ?? '?'}${m.scheduled_at ? `（${m.scheduled_at}）` : ''}`"
                :value="m.id"
              />
            </el-select>
          </el-form-item>
        </template>

        <el-form-item label="竞猜选项">
          <div class="draft-options">
            <div v-for="opt in draftOptions" :key="opt.id" class="draft-row">
              <el-input
                v-if="form.kind === 'custom'"
                v-model="opt.label"
                size="small"
                placeholder="选项名称"
                style="flex: 1"
                maxlength="40"
              />
              <span v-else class="draft-label">{{ opt.label }}</span>
              <el-input-number
                v-model="opt.odds"
                :min="1.2"
                :max="5"
                :step="0.1"
                :precision="2"
                size="small"
                :disabled="form.kind === 'match_winner'"
                title="赔率"
              />
              <el-button
                v-if="form.kind === 'custom'"
                size="small"
                type="danger"
                link
                @click="removeDraftOption(opt.id)"
              >
                移除
              </el-button>
            </div>
            <div v-if="form.kind === 'custom'" class="custom-add">
              <el-button size="small" :icon="Plus" @click="addCustomOption">添加选项</el-button>
            </div>
            <div v-if="draftOptions.length === 0" class="draft-empty">选择上方类型/条件后生成选项，赔率可手动调整</div>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitCreate">发布</el-button>
      </template>
    </el-dialog>

    <!-- 结算 -->
    <el-dialog v-model="settleDialog" title="结算竞猜" width="480px">
      <el-alert
        type="warning"
        :closable="false"
        title="结算后不可修改"
        description="选择中奖选项，系统将按投注赔率向猜中的用户发放积分。"
        class="tip"
      />
      <div class="settle-options">
        <el-radio-group v-model="settleWinner" class="settle-group">
          <el-radio
            v-for="opt in settlePollRef?.options ?? []"
            :key="opt.id"
            :value="opt.id"
            class="settle-opt"
          >
            {{ opt.label }}（赔率 {{ opt.odds }}）
          </el-radio>
        </el-radio-group>
      </div>
      <template #footer>
        <el-button @click="settleDialog = false">取消</el-button>
        <el-button type="success" :disabled="!settleWinner" @click="confirmSettle">确认结算</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.filters-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.options-list {
  padding: 4px 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.opt-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 6px;
  background: var(--cs2-panel-2);
}

.opt-row.opt-winner {
  outline: 1px solid #67c23a;
  background: rgba(103, 194, 58, 0.08);
}

.opt-label {
  font-weight: 600;
  color: var(--cs2-text-regular, #c6ccd8);
}

.draft-options {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.draft-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.draft-label {
  flex: 1;
  font-weight: 600;
  color: var(--cs2-text-regular, #c6ccd8);
}

.custom-add {
  margin-top: 4px;
}

.draft-empty {
  font-size: 12px;
  color: var(--cs2-text-muted);
}

.tip {
  margin-bottom: 12px;
}

.settle-options {
  max-height: 300px;
  overflow-y: auto;
}

.settle-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: flex-start;
}

.settle-opt {
  margin-right: 0;
}
</style>
