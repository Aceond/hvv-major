<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import Cs2Logo from '@/components/Cs2Logo.vue'
import { useAuthStore } from '@/stores/auth'
import { isSupabaseConfigured } from '@/lib/supabase'
import { updatePassword } from '@/api/auth'
import type { EventItem, Match, PlayerApplication, Team, TeamMember } from '@/api/types'
import { MATCH_STATUS_LABEL } from '@/api/types'
import { listEvents } from '@/api/event'
import { listMembers, listMyPlayerApplication, listMyTeams } from '@/api/registration'
import { listMyMatches } from '@/api/match'

const auth = useAuthStore()

const application = ref<PlayerApplication | null>(null)
const teams = ref<Team[]>([])
const rosters = ref<Record<string, TeamMember[]>>({})
const myMatches = ref<Match[]>([])
const events = ref<EventItem[]>([])
const loading = ref(false)

// 修改密码
const pwdDialog = ref(false)
const pwdSubmitting = ref(false)
const pwdForm = reactive({ oldPassword: '', newPassword: '', confirm: '' })

const myTeamIds = computed(() => teams.value.map((t) => t.id))

const stats = computed(() => {
  let wins = 0
  let losses = 0
  for (const m of myMatches.value) {
    if (m.status !== 'completed' || !m.team_a_id || !m.team_b_id) continue
    if (m.team_a_score === m.team_b_score) continue
    const myIsA = myTeamIds.value.includes(m.team_a_id)
    const myWin = myIsA ? m.team_a_score > m.team_b_score : m.team_b_score > m.team_a_score
    myWin ? wins++ : losses++
  }
  const played = wins + losses
  return {
    played,
    wins,
    losses,
    rate: played ? Math.round((wins / played) * 100) : 0,
  }
})

function eventName(eventId: string | null) {
  return events.value.find((e) => e.id === eventId)?.name ?? '未关联赛事'
}

function myRoleIn(team: Team): '队长' | '队员' {
  return team.captain_id === auth.profile?.id ? '队长' : '队员'
}

function matchResult(m: Match): '胜' | '负' | '待赛' | '平' {
  if (m.status !== 'completed' || !m.team_a_id || !m.team_b_id) return '待赛'
  if (m.team_a_score === m.team_b_score) return '平'
  const myIsA = myTeamIds.value.includes(m.team_a_id)
  return (myIsA ? m.team_a_score > m.team_b_score : m.team_b_score > m.team_a_score)
    ? '胜'
    : '负'
}

async function load() {
  if (!auth.isLoggedIn) return
  loading.value = true
  try {
    events.value = await listEvents()
    application.value = await listMyPlayerApplication()
    teams.value = await listMyTeams()
    for (const t of teams.value) {
      rosters.value[t.id] = await listMembers(t.id)
    }
    myMatches.value = await listMyMatches(myTeamIds.value)
  } catch (e: any) {
    ElMessage.error(e.message || '加载失败')
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  if (!auth.isLoggedIn) await auth.refresh()
  await load()
})

async function savePassword() {
  if (pwdSubmitting.value) return
  if (!pwdForm.oldPassword || !pwdForm.newPassword) {
    ElMessage.warning('请填写当前密码和新密码')
    return
  }
  if (pwdForm.newPassword.length < 8) {
    ElMessage.warning('新密码至少 8 位')
    return
  }
  if (pwdForm.newPassword !== pwdForm.confirm) {
    ElMessage.warning('两次输入的新密码不一致')
    return
  }
  pwdSubmitting.value = true
  try {
    const res = await updatePassword(pwdForm.oldPassword, pwdForm.newPassword)
    if (res.demo) {
      ElMessage.warning('演示模式不支持修改密码')
      return
    }
    if (res.error) {
      ElMessage.error(res.error.message)
      return
    }
    pwdDialog.value = false
    Object.assign(pwdForm, { oldPassword: '', newPassword: '', confirm: '' })
    ElMessage.success('密码已修改')
  } finally {
    pwdSubmitting.value = false
  }
}
</script>

<template>
  <div class="page-container" v-loading="loading">
    <h2 class="title">个人中心</h2>

    <el-alert
      v-if="!auth.isLoggedIn"
      type="warning"
      :closable="false"
      title="请先登录"
      description="登录后可查看个人信息、我的战队、战绩与比赛记录。"
      class="tip"
    />

    <template v-if="auth.isLoggedIn">
      <el-row :gutter="16">
        <!-- 个人信息 -->
        <el-col :xs="24" :md="9">
          <el-card class="card">
            <div class="profile-head">
              <div class="avatar">
                <Cs2Logo :size="44" />
              </div>
              <div>
                <div class="name">{{ application?.display_name || auth.profile?.nickname || '未填写姓名' }}</div>
                <div class="sub">{{ auth.user?.email }}</div>
              </div>
            </div>
            <el-descriptions :column="1" size="small" class="descriptions">
              <el-descriptions-item label="选手姓名">{{ application?.display_name || '-' }}</el-descriptions-item>
              <el-descriptions-item label="完美 ID">{{ application?.pw_username || auth.profile?.pw_username || '-' }}</el-descriptions-item>
              <el-descriptions-item label="角色">
                <el-tag size="small" :type="auth.isAdmin ? 'danger' : 'primary'" effect="plain">
                  {{ auth.isAdmin ? '管理员' : '选手' }}
                </el-tag>
              </el-descriptions-item>
              <el-descriptions-item label="在职状态">
                <template v-if="application?.employment_status === 'employed'">
                  在职（{{ application.location }} · 工号 {{ application.employee_no }}）
                </template>
                <el-tag v-else size="small" type="info" effect="plain">离职</el-tag>
              </el-descriptions-item>
              <el-descriptions-item label="注册状态">
                <el-tag
                  size="small"
                  :type="application?.status === 'approved' ? 'success' : application?.status === 'rejected' ? 'danger' : 'warning'"
                  effect="plain"
                >
                  {{ application?.status === 'approved' ? '已通过' : application?.status === 'rejected' ? '已拒绝' : application ? '审核中' : '未提交' }}
                </el-tag>
              </el-descriptions-item>
            </el-descriptions>
            <div v-if="isSupabaseConfigured" class="pwd-entry">
              <el-button size="small" @click="pwdDialog = true">修改密码</el-button>
            </div>
          </el-card>

          <!-- 战绩统计 -->
          <el-card class="card">
            <template #header><span class="card-title">战绩统计</span></template>
            <div class="stats-row">
              <div class="stat"><b>{{ stats.played }}</b><span>参赛</span></div>
              <div class="stat win"><b>{{ stats.wins }}</b><span>胜</span></div>
              <div class="stat loss"><b>{{ stats.losses }}</b><span>负</span></div>
              <div class="stat"><b>{{ stats.rate }}%</b><span>胜率</span></div>
            </div>
          </el-card>
        </el-col>

        <!-- 我的战队 -->
        <el-col :xs="24" :md="15">
          <el-card class="card">
            <template #header><span class="card-title">我的战队</span></template>
            <el-empty v-if="teams.length === 0" description="尚未加入任何战队（个人注册审核通过后，可由队长选入战队）" :image-size="60" />
            <div v-for="t in teams" :key="t.id" class="team-block">
              <div class="team-head">
                <span class="team-name">{{ t.name }}</span>
                <el-tag size="small" effect="plain">{{ eventName(t.event_id) }}</el-tag>
                <el-tag size="small" :type="myRoleIn(t) === '队长' ? 'danger' : 'info'" effect="plain">
                  {{ myRoleIn(t) }}
                </el-tag>
                <el-tag size="small" :type="t.status === 'approved' ? 'success' : t.status === 'rejected' ? 'danger' : 'warning'" effect="plain">
                  {{ t.status === 'approved' ? '已通过' : t.status === 'rejected' ? '已拒绝' : '待审核' }}
                </el-tag>
              </div>
              <div class="roster">
                <span v-for="m in rosters[t.id]" :key="m.id" class="roster-item">
                  {{ m.nickname || m.pw_username || '未知选手' }}
                  <el-tag v-if="m.is_captain" size="small" type="danger" effect="plain">队长</el-tag>
                </span>
              </div>
            </div>
          </el-card>
        </el-col>
      </el-row>

      <!-- 比赛记录 -->
      <el-card class="card">
        <template #header><span class="card-title">比赛记录</span></template>
        <el-table :data="myMatches" stripe empty-text="暂无比赛记录">
          <el-table-column prop="scheduled_at" label="时间" min-width="130" />
          <el-table-column prop="stage_name" label="阶段" min-width="140" />
          <el-table-column label="对阵" min-width="260">
            <template #default="{ row }">
              <div class="matchup">
                <span :class="{ win: row.winner_id === row.team_a_id }">{{ row.team_a_name }}</span>
                <b class="score">{{ row.team_a_score }} : {{ row.team_b_score }}</b>
                <span :class="{ win: row.winner_id === row.team_b_id }">{{ row.team_b_name }}</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="结果" width="80">
            <template #default="{ row }">
              <el-tag
                size="small"
                :type="matchResult(row) === '胜' ? 'success' : matchResult(row) === '负' ? 'danger' : matchResult(row) === '平' ? 'info' : 'warning'"
                effect="plain"
              >
                {{ matchResult(row) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="90">
            <template #default="{ row }">
              <el-tag size="small" effect="plain">{{ MATCH_STATUS_LABEL[row.status as Match['status']] }}</el-tag>
            </template>
          </el-table-column>
        </el-table>
      </el-card>

      <!-- 修改密码 -->
      <el-dialog v-model="pwdDialog" title="修改密码" width="400px">
        <el-alert type="info" :closable="false" title="需验证当前密码后方可设置新密码。" class="tip" />
        <el-form label-width="90px" class="form">
          <el-form-item label="当前密码">
            <el-input v-model="pwdForm.oldPassword" type="password" show-password placeholder="请输入当前密码" @keyup.enter.prevent="savePassword" />
          </el-form-item>
          <el-form-item label="新密码">
            <el-input v-model="pwdForm.newPassword" type="password" show-password placeholder="至少 8 位" @keyup.enter.prevent="savePassword" />
          </el-form-item>
          <el-form-item label="确认新密码">
            <el-input v-model="pwdForm.confirm" type="password" show-password placeholder="再次输入新密码" @keyup.enter.prevent="savePassword" />
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="pwdDialog = false">取消</el-button>
          <el-button type="primary" :loading="pwdSubmitting" @click="savePassword">保存</el-button>
        </template>
      </el-dialog>
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

.card {
  margin-bottom: 16px;
}

.card-title {
  font-weight: 700;
  letter-spacing: 1px;
}

.profile-head {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 16px;
}

.avatar {
  width: 56px;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  background: var(--cs2-accent-soft);
  border: 1px solid rgba(255, 176, 32, 0.35);
}

.name {
  font-size: 17px;
  font-weight: 800;
  color: var(--cs2-text);
}

.sub {
  font-size: 12px;
  color: var(--cs2-text-muted);
}

.descriptions {
  --el-descriptions-item-label-color: var(--cs2-text-muted);
}

.pwd-entry {
  margin-top: 12px;
  text-align: right;
}

.stats-row {
  display: flex;
  gap: 8px;
}

.stat {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 10px 0;
  border-radius: 8px;
  background: var(--cs2-panel-2);
}

.stat b {
  font-size: 20px;
  color: var(--cs2-accent);
}

.stat span {
  font-size: 12px;
  color: var(--cs2-text-muted);
}

.stat.win b {
  color: #67c23a;
}

.stat.loss b {
  color: #f56c6c;
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
  gap: 8px;
  margin-bottom: 8px;
}

.team-name {
  font-weight: 700;
  color: var(--cs2-text);
  margin-right: 4px;
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

.matchup {
  display: flex;
  align-items: center;
  gap: 10px;
}

.matchup .win {
  color: #67c23a;
  font-weight: 700;
}

.score {
  color: var(--cs2-accent);
  white-space: nowrap;
}
</style>
