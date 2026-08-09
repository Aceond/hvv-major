<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import Cs2Logo from '@/components/Cs2Logo.vue'
import { useAuthStore } from '@/stores/auth'
import { isSupabaseConfigured } from '@/lib/supabase'
import { updatePassword } from '@/api/auth'
import type { EventItem, Group, Match, PlayerApplication, PlayerStatRow, Team, TeamMember } from '@/api/types'
import { MATCH_STATUS_LABEL } from '@/api/types'
import { listEvents } from '@/api/event'
import { listMembers, listMyPlayerApplication, listMyTeams } from '@/api/registration'
import { listMyMatches, listGroups } from '@/api/match'
import { getPlayerStatsByEvent } from '@/api/stats'

const auth = useAuthStore()

const application = ref<PlayerApplication | null>(null)
const teams = ref<Team[]>([])
const rosters = ref<Record<string, TeamMember[]>>({})
const myMatches = ref<Match[]>([])
const events = ref<EventItem[]>([])
const loading = ref(false)

// ---------------- 战绩五维图 ----------------
const groups = ref<Group[]>([])
const radarEventId = ref('')
const radarRange = ref('all') // all=全部选手；否则为组别 id（平均值的对比范围）
const eventStats = ref<PlayerStatRow[]>([])
const radarLoading = ref(false)

/** 五维图维度定义（场均击杀 = 总击杀 / 比赛数，其余直接取字段） */
const RADAR_DIMS = [
  { key: 'avg_kills', label: '场均击杀' },
  { key: 'kd', label: 'KD' },
  { key: 'adr', label: 'ADR' },
  { key: 'rating', label: 'Rating' },
  { key: 'we', label: 'WE' },
] as const

function dimValue(row: PlayerStatRow, key: (typeof RADAR_DIMS)[number]['key']): number {
  switch (key) {
    case 'avg_kills':
      return row.matches > 0 ? row.total_kills / row.matches : 0
    case 'kd':
      return row.kd
    case 'adr':
      return row.adr
    case 'rating':
      return row.rating_pro
    case 'we':
      return row.we
    default:
      return 0
  }
}

/** 当前范围（全部/某组别）内的所有选手统计行。
 *  组别按「数据/比赛所属组别」判定（stage 的组别，即在哪打的），而非选手战队被分配的组别；
 *  演示数据未带 stage 组别时回退用战队组别。 */
const radarRows = computed(() => {
  if (radarRange.value === 'all') return eventStats.value
  return eventStats.value.filter((r) => (r.stage_group_id ?? r.group_id) === radarRange.value)
})

/** 当前登录选手在该赛事的统计行（每名选手一行） */
const myRadarRow = computed(
  () => eventStats.value.find((r) => r.player_id === auth.profile?.id) ?? null,
)

const radarRangeName = computed(() =>
  radarRange.value === 'all'
    ? '全部选手'
    : (groups.value.find((g) => g.id === radarRange.value)?.name ?? '未分组'),
)

/** 我的数据所属组别（按数据/比赛组别判定，与平均值口径一致） */
const myGroupName = computed(() => {
  if (!myRadarRow.value) return ''
  const gid = myRadarRow.value.stage_group_id ?? myRadarRow.value.group_id
  return groups.value.find((g) => g.id === gid)?.name ?? ''
})

/** 五维数据：我的值 / 范围内平均 / 归一化比例（同一维用同一 max，保证两线同尺度） */
const radarData = computed(() => {
  const rows = radarRows.value
  const mine = myRadarRow.value
  return RADAR_DIMS.map((d) => {
    const vals = rows.map((r) => dimValue(r, d.key))
    const mineV = mine ? dimValue(mine, d.key) : 0
    const avgV = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
    const maxV = Math.max(...vals, mineV, 0.0001)
    return {
      key: d.key,
      label: d.label,
      mine: mineV,
      avg: avgV,
      mineRatio: mineV / maxV,
      avgRatio: avgV / maxV,
    }
  })
})

// ---- SVG 雷达图几何（五边形，首个维度从正上方开始）----
const RADAR_SIZE = 260
const RADAR_R = 92
const RADAR_CX = RADAR_SIZE / 2
const RADAR_CY = RADAR_SIZE / 2
const N = RADAR_DIMS.length

function angle(i: number) {
  return (Math.PI * 2 * i) / N - Math.PI / 2
}
function pointAt(i: number, ratio: number) {
  const a = angle(i)
  const r = RADAR_R * Math.max(0, Math.min(1, ratio))
  return { x: RADAR_CX + r * Math.cos(a), y: RADAR_CY + r * Math.sin(a) }
}
function gridPoints(level: number) {
  return Array.from({ length: N }, (_, i) => {
    const p = pointAt(i, level)
    return `${p.x.toFixed(1)},${p.y.toFixed(1)}`
  }).join(' ')
}
function radarPoints(ratios: number[]) {
  return ratios.map((r, i) => {
    const p = pointAt(i, r)
    return `${p.x.toFixed(1)},${p.y.toFixed(1)}`
  }).join(' ')
}
function axisEnd(i: number) {
  return pointAt(i, 1)
}
function labelPos(i: number) {
  const a = angle(i)
  const x = RADAR_CX + (RADAR_R + 20) * Math.cos(a)
  const y = RADAR_CY + (RADAR_R + 20) * Math.sin(a)
  let anchor = 'middle'
  if (Math.cos(a) > 0.4) anchor = 'start'
  else if (Math.cos(a) < -0.4) anchor = 'end'
  return { x: x.toFixed(1), y: y.toFixed(1), anchor }
}
function vertexPos(i: number, ratio: number) {
  const p = pointAt(i, ratio)
  return { x: p.x.toFixed(1), y: p.y.toFixed(1) }
}

async function loadRadar() {
  if (!radarEventId.value) return
  radarLoading.value = true
  try {
    eventStats.value = await getPlayerStatsByEvent(radarEventId.value)
  } finally {
    radarLoading.value = false
  }
}

/** 数值展示：最多两位小数，去掉无意义的小数尾零 */
function fmtNum(v: number) {
  if (!Number.isFinite(v)) return '-'
  return String(Math.round(v * 100) / 100)
}
function cmpCls(mine: number, avg: number) {
  return mine >= avg ? 'cmp-up' : 'cmp-down'
}

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
    groups.value = await listGroups()
    application.value = await listMyPlayerApplication()
    teams.value = await listMyTeams()
    for (const t of teams.value) {
      rosters.value[t.id] = await listMembers(t.id)
    }
    myMatches.value = await listMyMatches(myTeamIds.value)
    // 五维图：默认选最近一届赛事（列表按届数倒序，最新在前）
    if (!radarEventId.value && events.value[0]) {
      radarEventId.value = events.value[0].id
    }
    await loadRadar()
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

      <!-- 战绩五维图 -->
      <el-card class="card">
        <template #header>
          <div class="radar-header">
            <span class="card-title">战绩五维图</span>
            <div class="radar-filters">
              <el-select
                v-model="radarEventId"
                size="small"
                style="width: 190px"
                placeholder="选择赛事"
                @change="loadRadar"
              >
                <el-option
                  v-for="e in events"
                  :key="e.id"
                  :label="`${e.name}${e.edition ? `（第 ${e.edition} 届）` : ''}`"
                  :value="e.id"
                />
              </el-select>
              <el-radio-group v-model="radarRange" size="small">
                <el-radio-button value="all">全部</el-radio-button>
                <el-radio-button v-for="g in groups" :key="g.id" :value="g.id">{{ g.name }}</el-radio-button>
              </el-radio-group>
            </div>
          </div>
        </template>

        <div v-loading="radarLoading" class="radar-wrap">
          <template v-if="myRadarRow && radarData.length">
            <div class="radar-body">
              <svg
                :viewBox="`0 0 ${RADAR_SIZE} ${RADAR_SIZE}`"
                class="radar-svg"
                role="img"
                aria-label="个人战绩五维图"
              >
                <polygon v-for="lvl in [1, 2, 3]" :key="lvl" :points="gridPoints(lvl / 3)" class="grid" />
                <line
                  v-for="(d, i) in radarData"
                  :key="`axis-${d.key}`"
                  :x1="RADAR_CX"
                  :y1="RADAR_CY"
                  :x2="axisEnd(i).x.toFixed(1)"
                  :y2="axisEnd(i).y.toFixed(1)"
                  class="axis"
                />
                <polygon :points="radarPoints(radarData.map((d) => d.avgRatio))" class="poly avg" />
                <polygon :points="radarPoints(radarData.map((d) => d.mineRatio))" class="poly mine" />
                <circle
                  v-for="(d, i) in radarData"
                  :key="`avg-dot-${d.key}`"
                  :cx="vertexPos(i, d.avgRatio).x"
                  :cy="vertexPos(i, d.avgRatio).y"
                  r="2.5"
                  class="dot avg"
                />
                <circle
                  v-for="(d, i) in radarData"
                  :key="`mine-dot-${d.key}`"
                  :cx="vertexPos(i, d.mineRatio).x"
                  :cy="vertexPos(i, d.mineRatio).y"
                  r="3"
                  class="dot mine"
                />
                <text
                  v-for="(d, i) in radarData"
                  :key="`label-${d.key}`"
                  :x="labelPos(i).x"
                  :y="labelPos(i).y"
                  :text-anchor="labelPos(i).anchor"
                  class="dim-label"
                >
                  {{ d.label }}
                </text>
              </svg>
              <div class="radar-side">
                <div class="radar-legend">
                  <span class="legend-item"><i class="swatch mine"></i>我的{{ myGroupName ? `（${myGroupName}）` : '' }}</span>
                  <span class="legend-item"><i class="swatch avg"></i>平均（{{ radarRangeName }}）</span>
                </div>
                <el-table :data="radarData" size="small" border class="radar-table">
                  <el-table-column prop="label" label="维度" width="96" />
                  <el-table-column label="我的" width="96">
                    <template #default="{ row }">{{ fmtNum(row.mine) }}</template>
                  </el-table-column>
                  <el-table-column label="平均" width="96">
                    <template #default="{ row }">{{ fmtNum(row.avg) }}</template>
                  </el-table-column>
                  <el-table-column label="对比">
                    <template #default="{ row }">
                      <span :class="cmpCls(row.mine, row.avg)">{{ row.mine >= row.avg ? '高' : '低' }}</span>
                    </template>
                  </el-table-column>
                </el-table>
                <div class="radar-tip">
                  场均击杀 = 总击杀 ÷ 比赛数；数据与后台「数据录入 / 个人排行」同源，管理员保存后自动同步。
                </div>
              </div>
            </div>
          </template>
          <el-empty
            v-else-if="radarEventId"
            description="该赛事暂无你的个人统计数据（个人注册审核通过后自动生成，或由管理员在数据录入中维护）"
            :image-size="60"
          />
          <el-empty v-else description="暂无赛事，请先在后台发布赛事" :image-size="60" />
        </div>
      </el-card>

      <!-- 比赛记录 -->
      <el-card class="card">
        <template #header><span class="card-title">比赛记录</span></template>
        <el-table :data="myMatches" stripe empty-text="暂无比赛记录">
          <el-table-column prop="scheduled_at" label="时间" min-width="130" />
          <el-table-column label="阶段" min-width="150">
            <template #default="{ row }">
              {{ row.stage_name ?? '-' }}{{ row.stage_name && row.group_name ? ' · ' + row.group_name : '' }}
            </template>
          </el-table-column>
          <el-table-column label="对阵" min-width="260">
            <template #default="{ row }">
              <div class="matchup">
                <span :class="{ win: row.status === 'completed' && row.team_a_score > row.team_b_score }">{{ row.team_a_name }}</span>
                <b class="score">{{ row.team_a_score }} : {{ row.team_b_score }}</b>
                <span :class="{ win: row.status === 'completed' && row.team_b_score > row.team_a_score }">{{ row.team_b_name }}</span>
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

/* ---------------- 战绩五维图 ---------------- */
.radar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
}

.radar-filters {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.radar-wrap {
  min-height: 120px;
}

.radar-body {
  display: flex;
  align-items: center;
  gap: 24px;
  flex-wrap: wrap;
}

.radar-svg {
  width: 260px;
  height: 260px;
  flex-shrink: 0;
}

.radar-svg .grid {
  fill: none;
  stroke: var(--cs2-border);
  stroke-width: 1;
}

.radar-svg .axis {
  stroke: var(--cs2-border);
  stroke-width: 1;
}

.radar-svg .poly.avg {
  fill: rgba(90, 140, 255, 0.16);
  stroke: #5a8cff;
  stroke-width: 1.5;
  stroke-dasharray: 4 3;
}

.radar-svg .poly.mine {
  fill: rgba(255, 176, 32, 0.22);
  stroke: #ffb020;
  stroke-width: 2;
}

.radar-svg .dot.avg {
  fill: #5a8cff;
}

.radar-svg .dot.mine {
  fill: #ffb020;
}

.radar-svg .dim-label {
  font-size: 11px;
  fill: var(--cs2-text-muted);
}

.radar-side {
  flex: 1;
  min-width: 280px;
}

.radar-legend {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 8px;
}

.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--cs2-text-muted);
}

.swatch {
  display: inline-block;
  width: 12px;
  height: 12px;
  border-radius: 3px;
}

.swatch.mine {
  background: #ffb020;
}

.swatch.avg {
  background: #5a8cff;
}

.radar-table {
  width: 100%;
}

.cmp-up {
  color: #67c23a;
  font-weight: 700;
}

.cmp-down {
  color: #f56c6c;
  font-weight: 700;
}

.radar-tip {
  margin-top: 8px;
  font-size: 12px;
  color: var(--cs2-text-muted);
}
</style>
