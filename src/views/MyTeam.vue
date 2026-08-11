<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useAuthStore } from '@/stores/auth'
import type { ApplicationStatus, EventItem, Team, TeamMember } from '@/api/types'
import { listEvents, listSignupEvents } from '@/api/event'
import { createTeam, listMembers, listMyTeams } from '@/api/registration'
import { formatDateTime } from '@/utils/format'

const auth = useAuthStore()

const teams = ref<Team[]>([])
const rosters = ref<Record<string, TeamMember[]>>({})
const events = ref<EventItem[]>([])
const loading = ref(false)
const submitting = ref(false)

// 报名表单（无战队时展示，逻辑与「战队报名」一致）
const form = reactive({ eventId: '', teamName: '', tag: '' })

/** 主战队：优先取当前用户担任队长的战队，否则取所在的第一支战队 */
const mainTeam = computed(
  () => teams.value.find((t) => t.captain_id === auth.profile?.id) ?? teams.value[0] ?? null,
)
const mainStatus = computed<ApplicationStatus | null>(() => mainTeam.value?.status ?? null)
/** 步骤条：未报名 0 / 待审核 1 / 已通过 2 */
const stepsActive = computed(() => (mainStatus.value === 'approved' ? 2 : mainStatus.value ? 1 : 0))

function eventName(eventId: string | null) {
  return events.value.find((e) => e.id === eventId)?.name ?? '未关联赛事'
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

async function load() {
  if (!auth.isLoggedIn) return
  loading.value = true
  try {
    events.value = await listEvents()
    teams.value = await listMyTeams()
    const map: Record<string, TeamMember[]> = {}
    for (const t of teams.value) {
      map[t.id] = await listMembers(t.id)
    }
    rosters.value = map
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
    <h2 class="title">我的战队</h2>

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

        <!-- 已有战队：展示战队信息与名册 -->
        <template v-if="teams.length > 0">
          <div v-for="t in teams" :key="t.id" class="team-block">
            <div class="team-head">
              <span class="team-name">{{ t.name }}</span>
              <el-tag size="small" :type="myRoleIn(t) === '队长' ? 'danger' : 'info'" effect="plain">
                {{ myRoleIn(t) }}
              </el-tag>
              <el-tag size="small" :type="statusType(t.status)" effect="plain">
                {{ statusLabel(t.status) }}
              </el-tag>
              <el-tag size="small" effect="plain">{{ eventName(t.event_id) }}</el-tag>
              <span v-if="t.tag" class="team-tag">ID：{{ t.tag }}</span>
              <span class="team-time">报名：{{ formatDateTime(t.created_at) }}</span>
            </div>
            <div class="roster">
              <span v-for="m in rosters[t.id]" :key="m.id" class="roster-item">
                {{ m.nickname || m.pw_username || '未知选手' }}
                <el-tag v-if="m.is_captain" size="small" type="danger" effect="plain">队长</el-tag>
                <el-tag v-else-if="m.status === 'benched'" size="small" type="info" effect="plain">替补</el-tag>
              </span>
            </div>
            <div v-if="(rosters[t.id] ?? []).length === 0" class="roster-empty">
              名册为空，等待管理员分配队员
            </div>
          </div>
        </template>

        <!-- 无战队：报名表单（逻辑与「战队报名」一致） -->
        <template v-else>
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
    </template>
  </div>
</template>

<style scoped>
.title {
  margin: 0 0 16px;
}

.tip {
  margin-bottom: 16px;
}

.steps {
  margin-bottom: 24px;
}

.register-card {
  max-width: 680px;
}

.team-block {
  padding: 12px 0;
  border-bottom: 1px solid var(--cs2-border);
}

.team-block:last-child {
  border-bottom: none;
}

.team-head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
}

.team-name {
  font-weight: 700;
  color: var(--cs2-text);
  margin-right: 4px;
}

.team-tag {
  font-size: 12px;
  color: var(--cs2-text-muted);
}

.team-time {
  font-size: 12px;
  color: var(--cs2-text-muted);
  margin-left: auto;
}

.roster {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.roster-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--cs2-text-regular, #c6ccd8);
  padding: 2px 10px;
  border-radius: 12px;
  background: var(--cs2-panel-2);
}

.roster-empty {
  font-size: 12px;
  color: var(--cs2-text-muted);
}
</style>
