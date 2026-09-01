<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useAuthStore } from '@/stores/auth'
import type { ApplicationStatus, EventItem, Group, Match, Team, TeamMember } from '@/api/types'
import { MATCH_STATUS_LABEL } from '@/api/types'
import { listEvents, listSignupEvents } from '@/api/event'
import { createTeam, listMembers, listMyTeams } from '@/api/registration'
import { listGroups, listMyMatches } from '@/api/match'
import { formatDateTime } from '@/utils/format'
import PlayerRadar from '@/components/PlayerRadar.vue'

const auth = useAuthStore()

const teams = ref<Team[]>([])
const rosters = ref<Record<string, TeamMember[]>>({})
const events = ref<EventItem[]>([])
const groups = ref<Group[]>([])
const loading = ref(false)
const submitting = ref(false)
const historyMatches = ref<Match[]>([])
const historyLoading = ref(false)

// 报名表单（无战队时展示，逻辑与「战队报名」一致）
const form = reactive({ eventId: '', teamName: '', tag: '' })

// 赛事筛选：'' = 全部；审批状态跟随所选赛事
const currentEvent = ref('')
const filteredTeams = computed(() =>
  teams.value.filter((t) => !currentEvent.value || t.event_id === currentEvent.value),
)

/** 主战队：优先取当前用户担任队长的战队，否则取所在的第一支战队（仅在按赛事筛选时才有唯一含义） */
const mainTeam = computed(
  () =>
    filteredTeams.value.find((t) => t.captain_id === auth.profile?.id) ??
    filteredTeams.value[0] ??
    null,
)
const mainStatus = computed<ApplicationStatus | null>(() =>
  currentEvent.value ? (mainTeam.value?.status ?? null) : null,
)
/** 步骤条：未报名 0 / 待审核 1 / 已通过 2（仅按赛事筛选时展示） */
const stepsActive = computed(() => (mainStatus.value === 'approved' ? 2 : mainStatus.value ? 1 : 0))

function eventName(eventId: string | null) {
  return events.value.find((e) => e.id === eventId)?.name ?? '未关联赛事'
}

function groupName(groupId: string | null) {
  return groups.value.find((g) => g.id === groupId)?.name ?? '未分组'
}

function myRoleIn(t: Team): '队长' | '队员' {
  return t.captain_id === auth.profile?.id ? '队长' : '队员'
}

function statusType(s: string) {
  return s === 'approved' ? 'success' : s === 'rejected' ? 'danger' : 'warning'
}

function statusLabel(s: string) {
  return s === 'approved' ? '已通过' : s === 'rejected' ? '已拒绝' : '待审核'
}

function memberName(m: TeamMember): string {
  return m.nickname || m.pw_username || '未知选手'
}

function memberInitial(m: TeamMember): string {
  return memberName(m).slice(0, 1)
}

/** 历史对战记录：当前筛选赛事下主战队的全部对局（按开赛时间倒序） */
async function loadHistory() {
  const t = mainTeam.value
  if (!t) {
    historyMatches.value = []
    return
  }
  historyLoading.value = true
  try {
    historyMatches.value = await listMyMatches([t.id])
  } catch {
    historyMatches.value = []
  } finally {
    historyLoading.value = false
  }
}

/** 该场比赛中「我的战队」所在侧是否获胜 */
function mySideWon(m: Match, teamId: string): boolean | null {
  if (m.status !== 'completed') return null
  if (m.team_a_id === teamId) return m.team_a_score > m.team_b_score
  if (m.team_b_id === teamId) return m.team_b_score > m.team_a_score
  return null
}

/** 对阵展示名：我队 vs 对手 */
function opponentName(m: Match, teamId: string): string {
  if (m.team_a_id === teamId) return m.team_b_name ?? '未知'
  if (m.team_b_id === teamId) return m.team_a_name ?? '未知'
  return '未知'
}

function matchScore(m: Match, teamId: string): string {
  if (m.team_a_id === teamId) return `${m.team_a_score} : ${m.team_b_score}`
  return `${m.team_b_score} : ${m.team_a_score}`
}

function matchStatusType(s: Match['status']) {
  return s === 'completed' ? 'success' : s === 'cancelled' ? 'danger' : 'warning'
}

/** 赛事筛选切换后重新加载历史对局 */
watch(filteredTeams, () => loadHistory())

async function load() {
  if (!auth.isLoggedIn) return
  loading.value = true
  try {
    events.value = await listEvents()
    groups.value = await listGroups()
    teams.value = await listMyTeams()
    // 默认选中第一支战队所属赛事，让审批状态默认就有明确的赛事上下文
    if (!currentEvent.value && teams.value[0]) {
      currentEvent.value = teams.value[0].event_id ?? ''
    }
    const map: Record<string, TeamMember[]> = {}
    for (const t of teams.value) {
      map[t.id] = await listMembers(t.id)
    }
    rosters.value = map
    await loadHistory()
  } catch (e: any) {
    ElMessage.error(e.message || '加载失败')
  } finally {
    loading.value = false
  }
}

async function submit() {
  if (!form.eventId) {
    ElMessage.warning('请选择报名的赛事')
    return
  }
  if (!form.teamName.trim()) {
    ElMessage.warning('请填写战队名称')
    return
  }
  if (form.tag && !/^[a-zA-Z0-9]+$/.test(form.tag)) {
    ElMessage.warning('战队 ID 仅限字母或数字')
    return
  }
  submitting.value = true
  try {
    const team = await createTeam(form.teamName.trim(), form.tag, form.eventId)
    if (!team) {
      ElMessage.error('创建失败')
      return
    }
    ElMessage.success(`战队已提交（${team.name}），等待管理员审核`)
    await load()
  } catch (e: any) {
    ElMessage.error(e.message || '提交失败')
  } finally {
    submitting.value = false
  }
}

onMounted(async () => {
  if (!auth.isLoggedIn) await auth.refresh()
  const signupEvents = await listSignupEvents()
  form.eventId = signupEvents[0]?.id ?? ''
  await load()
})
</script>

<template>
  <div class="page-container">
    <h2 class="page-title">我的战队</h2>

    <el-alert
      v-if="!auth.isLoggedIn"
      type="warning"
      :closable="false"
      title="请先登录"
      description="登录后可查看我的战队、报名状态与战队名册。"
      class="tip"
    />

    <template v-if="auth.isLoggedIn">
      <el-steps :active="stepsActive" align-center class="steps">
        <el-step title="提交战队报名" />
        <el-step title="管理员审核" />
        <el-step title="组队参赛" />
      </el-steps>

      <el-card class="register-card" v-loading="loading">
        <el-alert
          v-if="mainStatus === 'pending'"
          type="warning"
          :closable="false"
          title="战队报名审核中"
          description="你的战队报名已提交，管理员将为战队配齐队员并审核。审核通过后战队将出现在赛程与积分榜中。"
          class="tip"
        />
        <el-alert
          v-else-if="mainStatus === 'approved'"
          type="success"
          :closable="false"
          title="战队已通过审核"
          description="你的战队已通过审核，队员名单见下方；如需调整队员请联系管理员。"
          class="tip"
        />
        <el-alert
          v-else-if="mainStatus === 'rejected'"
          type="error"
          :closable="false"
          title="战队报名未通过"
          description="你的战队报名未通过审核，成员已自动释放，可重新提交报名。"
          class="tip"
        />

        <!-- 已有战队：按赛事筛选展示战队信息与名册 -->
        <template v-if="teams.length > 0">
          <div class="filters-bar">
            <el-select
              v-model="currentEvent"
              placeholder="全部赛事"
              clearable
              style="width: 220px"
            >
              <el-option
                v-for="e in events"
                :key="e.id"
                :label="`${e.name}${e.edition ? `（第 ${e.edition} 届）` : ''}`"
                :value="e.id"
              />
            </el-select>
            <span class="filter-hint">审批状态跟随所选赛事显示</span>
          </div>

          <template v-if="filteredTeams.length > 0">
            <div v-for="t in filteredTeams" :key="t.id" class="team-card">
              <div class="team-card-head">
                <div class="team-identity">
                  <span class="team-name">{{ t.name }}</span>
                  <span v-if="t.tag" class="team-tag">#{{ t.tag }}</span>
                </div>
                <div class="team-badges">
                  <el-tag size="small" :type="myRoleIn(t) === '队长' ? 'danger' : 'info'" effect="plain">
                    {{ myRoleIn(t) }}
                  </el-tag>
                  <el-tag size="small" :type="statusType(t.status)" effect="plain">
                    {{ statusLabel(t.status) }}
                  </el-tag>
                </div>
              </div>

              <div class="team-meta">
                <span class="meta-item">
                  <span class="meta-label">赛事</span>
                  <span class="meta-value">{{ eventName(t.event_id) }}</span>
                </span>
                <span class="meta-item">
                  <span class="meta-label">组别</span>
                  <span class="meta-value">{{ groupName(t.group_id) }}</span>
                </span>
                <span class="meta-item">
                  <span class="meta-label">报名</span>
                  <span class="meta-value">{{ formatDateTime(t.created_at) }}</span>
                </span>
              </div>

              <div class="roster">
                <span
                  v-for="m in rosters[t.id]"
                  :key="m.id"
                  class="roster-item"
                  :class="{ captain: m.is_captain }"
                >
                  <span class="avatar">{{ memberInitial(m) }}</span>
                  <span class="roster-name">{{ memberName(m) }}</span>
                  <el-tag v-if="m.is_captain" size="small" type="danger" effect="plain">队长</el-tag>
                  <el-tag v-else-if="m.status === 'benched'" size="small" type="info" effect="plain">替补</el-tag>
                </span>
              </div>
              <div v-if="(rosters[t.id] ?? []).length === 0" class="roster-empty">
                名册为空，等待管理员分配队员
              </div>
            </div>
          </template>
          <el-empty v-else description="该赛事暂无你的战队报名" :image-size="60" />

          <!-- 历史对战记录（当前赛事下主战队） -->
          <div v-if="mainTeam" class="history-card" v-loading="historyLoading">
            <div class="history-head">
              <span class="history-title">⚔ 历史对战记录</span>
              <span class="history-sub">{{ eventName(mainTeam.event_id) }} · {{ mainTeam.name }}</span>
            </div>

            <div v-if="historyMatches.length === 0" class="history-empty">
              暂无对战记录，约战或赛程对阵录入后会显示在这里
            </div>
            <el-table
              v-else
              :data="historyMatches"
              stripe
              size="small"
              class="history-table"
              @row-click="() => $router.push({ name: 'matches' })"
            >
              <el-table-column label="时间" width="150">
                <template #default="{ row }">
                  <span class="cell-time">{{ formatDateTime(row.scheduled_at) }}</span>
                </template>
              </el-table-column>
              <el-table-column label="阶段" width="150">
                <template #default="{ row }">
                  <div class="cell-stage">
                    <el-tag v-if="row.group_name" size="small" effect="plain">{{ row.group_name }}</el-tag>
                    <span class="stage-name">{{ row.stage_name ?? '-' }}</span>
                  </div>
                </template>
              </el-table-column>
              <el-table-column label="对阵">
                <template #default="{ row }">
                  <div class="cell-vs">
                    <span class="vs-team vs-self">{{ mainTeam.name }}</span>
                    <span
                      class="vs-score"
                      :class="{
                        win: mySideWon(row, mainTeam.id) === true,
                        lose: mySideWon(row, mainTeam.id) === false,
                      }"
                    >
                      {{ row.status === 'scheduled' ? 'VS' : matchScore(row, mainTeam.id) }}
                    </span>
                    <span class="vs-team">{{ opponentName(row, mainTeam.id) }}</span>
                  </div>
                </template>
              </el-table-column>
              <el-table-column label="状态" width="90">
                <template #default="{ row }">
                  <el-tag :type="matchStatusType(row.status)" size="small" effect="plain">
                    {{ MATCH_STATUS_LABEL[row.status as Match['status']] }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column label="结果" width="70" align="center">
                <template #default="{ row }">
                  <el-tag
                    v-if="row.status === 'completed' && mySideWon(row, mainTeam.id) === true"
                    type="success"
                    size="small"
                    effect="dark"
                  >胜</el-tag>
                  <el-tag
                    v-else-if="row.status === 'completed' && mySideWon(row, mainTeam.id) === false"
                    type="danger"
                    size="small"
                    effect="dark"
                  >负</el-tag>
                  <span v-else class="cell-dash">-</span>
                </template>
              </el-table-column>
            </el-table>
          </div>
        </template>

        <!-- 无战队：报名表单（逻辑与「战队报名」一致） -->
        <template v-else>
          <div class="sec-title form-title">战队报名</div>
          <el-alert
            type="info"
            :closable="false"
            title="报名流程"
            description="选择本次要参加的赛事，填写战队信息提交报名（提交后你自动成为队长）。队员由管理员在后台从已通过个人注册的选手中为你的战队选择，队员不少于 5 人后战队即可通过审核。"
            class="tip"
          />
          <el-form label-width="90px" class="form">
            <el-form-item label="报名赛事">
              <el-select v-model="form.eventId" placeholder="选择本次报名的赛事" style="width: 100%">
                <el-option
                  v-for="e in events"
                  :key="e.id"
                  :label="`${e.name}${e.edition ? `（第 ${e.edition} 届）` : ''}`"
                  :value="e.id"
                />
              </el-select>
            </el-form-item>
            <el-form-item label="战队名称">
              <el-input v-model="form.teamName" placeholder="例如：Nova Velocity" maxlength="30" />
            </el-form-item>
            <el-form-item label="战队 ID">
              <el-input v-model="form.tag" placeholder="例如：NV11（字母或数字，长度不限）" />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" :loading="submitting" @click="submit">提交报名</el-button>
              <el-button @click="$router.push({ name: 'player-register' })">先去个人注册</el-button>
            </el-form-item>
          </el-form>
        </template>
      </el-card>

      <!-- 战绩五维图 -->
      <PlayerRadar mode="team" />
    </template>
  </div>
</template>

<style scoped>
.tip {
  margin-bottom: 16px;
}

.steps {
  margin-bottom: 24px;
}

.filters-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.filter-hint {
  font-size: 12px;
  color: var(--cs2-text-muted);
}

/* ---- 战队卡（斜切角战术风） ---- */
.team-card {
  position: relative;
  padding: 20px 22px 18px;
  margin-bottom: 16px;
  background: linear-gradient(180deg, var(--cs2-panel-2), var(--cs2-panel));
  border: 1px solid var(--cs2-border);
  clip-path: polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 0 100%);
  transition: border-color 0.25s cubic-bezier(0.22, 1, 0.36, 1);
}

.team-card:last-child {
  margin-bottom: 0;
}

.team-card:hover {
  border-color: var(--cs2-accent);
}

.team-card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.team-identity {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
}

.team-name {
  font-size: 20px;
  font-weight: 800;
  letter-spacing: 0.5px;
  color: var(--cs2-text);
}

.team-tag {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 1px;
  color: var(--cs2-accent);
  opacity: 0.85;
}

.team-badges {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.team-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 22px;
  margin: 12px 0 14px;
}

.meta-item {
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  font-size: 13px;
}

.meta-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 1px;
  color: var(--cs2-text-muted);
  opacity: 0.75;
}

.meta-value {
  color: var(--cs2-text);
}

.roster {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.roster-item {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 5px 12px 5px 6px;
  background: var(--cs2-panel-2);
  border: 1px solid var(--cs2-border);
  border-radius: 8px;
  font-size: 13px;
  color: var(--cs2-text);
  transition: border-color 0.2s, transform 0.2s;
}

.roster-item:hover {
  border-color: var(--cs2-border-strong);
  transform: translateY(-1px);
}

.avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 6px;
  background: var(--cs2-accent-soft);
  color: var(--cs2-accent);
  font-weight: 700;
  font-size: 13px;
}

.roster-item.captain {
  border-color: rgba(255, 176, 32, 0.35);
}

.roster-item.captain .avatar {
  background: var(--cs2-accent);
  color: #1a1400;
}

.roster-name {
  font-weight: 500;
}

.roster-empty {
  font-size: 13px;
  color: var(--cs2-text-muted);
}

.form-title {
  margin-bottom: 12px;
}

.form {
  max-width: 560px;
}

/* ---- 历史对战记录 ---- */
.history-card {
  margin-top: 16px;
  padding: 18px 22px 8px;
  background: var(--cs2-panel);
  border: 1px solid var(--cs2-border);
}

.history-head {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 14px;
  flex-wrap: wrap;
}

.history-title {
  font-size: 16px;
  font-weight: 800;
  letter-spacing: 1px;
  color: var(--cs2-text);
}

.history-sub {
  font-size: 12px;
  letter-spacing: 1px;
  color: var(--cs2-text-muted);
}

.history-empty {
  padding: 24px 0;
  text-align: center;
  font-size: 13px;
  color: var(--cs2-text-muted);
}

/* 历史对战记录表格 */
.history-table {
  --el-table-border-color: var(--cs2-border);
  --el-table-header-bg-color: var(--cs2-panel-2);
  --el-table-tr-bg-color: var(--cs2-panel);
  --el-table-row-hover-bg-color: var(--cs2-panel-2);
  --el-table-text-color: var(--cs2-text);
  --el-table-header-text-color: var(--cs2-text-muted);
}

.history-table :deep(.el-table__row) {
  cursor: pointer;
}

.cell-time {
  font-size: 12px;
  color: var(--cs2-text-muted);
}

.cell-stage {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.stage-name {
  font-size: 12px;
  color: var(--cs2-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cell-vs {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 14px;
  min-width: 0;
}

.vs-team {
  min-width: 90px;
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: center;
  font-size: 13px;
  color: var(--cs2-text-regular, #c6ccd8);
}

.vs-self {
  font-weight: 600;
  color: var(--cs2-text);
}

.vs-score {
  font-weight: 700;
  color: var(--cs2-accent);
  white-space: nowrap;
  min-width: 42px;
  text-align: center;
}

.vs-score.win {
  color: #67c23a;
}

.vs-score.lose {
  color: #f56c6c;
}

.cell-dash {
  color: var(--cs2-text-muted);
}

/* ---- 移动端 ---- */
@media (max-width: 768px) {
  .team-card {
    padding: 16px 16px 14px;
  }

  .team-card-head {
    flex-direction: column;
    gap: 8px;
  }

  .team-name {
    font-size: 18px;
  }

  .team-meta {
    gap: 6px 16px;
  }

  .form {
    max-width: 100%;
  }
}
</style>
