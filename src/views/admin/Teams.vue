<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { EventItem, Group, PlayerItem, Team, TeamMember, TeamStatus } from '@/api/types'
import {
  addTeamMember,
  listGroups,
  listMembers,
  listPlayers,
  listTeams,
  removeTeamMember,
  updateTeamGroup,
  updateTeamMemberRole,
  updateTeamStatus,
} from '@/api/admin'
import { listEvents } from '@/api/event'

const rows = ref<Team[]>([])
const groups = ref<Group[]>([])
const events = ref<EventItem[]>([])
const membersMap = ref<Record<string, TeamMember[]>>({})
const loading = ref(false)
const filter = ref<'all' | TeamStatus>('all')
const currentEvent = ref('') // 赛事筛选：'' = 全部

// 管理名册对话框
const rosterVisible = ref(false)
const rosterTeam = ref<Team | null>(null)
const roster = ref<TeamMember[]>([])
const pool = ref<PlayerItem[]>([])
const selectedPlayer = ref('')
const addRole = ref<'active' | 'benched'>('active') // 添加成员角色：正式队员 / 替补
const adding = ref(false)

const MIN_MEMBERS = 5

const filteredRows = computed(() =>
  rows.value
    .filter((t) => (filter.value === 'all' ? true : t.status === filter.value))
    .filter((t) => !currentEvent.value || t.event_id === currentEvent.value),
)

function memberCount(teamId: string) {
  return (membersMap.value[teamId] ?? []).length
}

function groupName(groupId: string | null) {
  return groups.value.find((g) => g.id === groupId)?.name ?? '未分组'
}

function eventName(eventId: string | null) {
  return events.value.find((e) => e.id === eventId)?.name ?? '未指定赛事'
}

const counts = computed(() => {
  const inEvent = rows.value.filter((t) => !currentEvent.value || t.event_id === currentEvent.value)
  return {
    all: inEvent.length,
    pending: inEvent.filter((t) => t.status === 'pending').length,
    approved: inEvent.filter((t) => t.status === 'approved').length,
    rejected: inEvent.filter((t) => t.status === 'rejected').length,
  }
})

async function load() {
  loading.value = true
  try {
    rows.value = await listTeams()
    groups.value = await listGroups()
    events.value = await listEvents()
    // 拉取各战队名册，供展开行展示与成员数校验
    const map: Record<string, TeamMember[]> = {}
    await Promise.all(
      rows.value.map(async (t) => {
        map[t.id] = await listMembers(t.id)
      }),
    )
    membersMap.value = map
  } finally {
    loading.value = false
  }
}

async function changeGroup(team: Team, groupId: string | null) {
  await updateTeamGroup(team.id, groupId)
  team.group_id = groupId
  ElMessage.success(`已将「${team.name}」调整到 ${groupName(groupId)}`)
}

async function decide(team: Team, status: TeamStatus) {
  if (status === 'approved' && memberCount(team.id) < MIN_MEMBERS) {
    ElMessage.warning(`队员不足（${memberCount(team.id)}/${MIN_MEMBERS} 人），无法通过审核`)
    return
  }
  const action = status === 'approved' ? '通过' : '拒绝'
  try {
    await ElMessageBox.confirm(
      `确认${action}「${team.name}」的报名吗？`,
      '审核确认',
      { type: 'warning', confirmButtonText: action, cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  await updateTeamStatus(team.id, status)
  ElMessage.success(`已${action}「${team.name}」`)
  load()
}

function playerLabel(p: PlayerItem) {
  return `${p.nickname || '未命名'}${p.pw_username ? `（${p.pw_username}）` : ''}`
}

async function openRoster(team: Team) {
  rosterTeam.value = team
  selectedPlayer.value = ''
  addRole.value = 'active'
  roster.value = await listMembers(team.id)
  pool.value = await listPlayers()
  rosterVisible.value = true
}

async function addPlayer() {
  if (!rosterTeam.value || !selectedPlayer.value) return
  adding.value = true
  try {
    await addTeamMember(rosterTeam.value.id, selectedPlayer.value, addRole.value)
    ElMessage.success(addRole.value === 'benched' ? '已添加替补' : '已添加队员')
    roster.value = await listMembers(rosterTeam.value.id)
    membersMap.value[rosterTeam.value.id] = roster.value
    selectedPlayer.value = ''
  } catch (e: any) {
    // 违反「同赛事正式队员一人一队」时数据库抛错，提示改选替补
    ElMessage.warning(e.message || '添加失败')
  } finally {
    adding.value = false
  }
}

async function removeMember(m: TeamMember) {
  if (!rosterTeam.value) return
  await removeTeamMember(rosterTeam.value.id, m.profile_id)
  ElMessage.success('已移除队员')
  roster.value = await listMembers(rosterTeam.value.id)
  membersMap.value[rosterTeam.value.id] = roster.value
}

/** 名册成员角色：队长 / 队员 / 替补 */
function memberRole(m: TeamMember): 'captain' | 'member' | 'bench' {
  if (m.is_captain) return 'captain'
  return m.status === 'benched' ? 'bench' : 'member'
}

/** 修改名册成员角色（设队长时原队长自动降为队员） */
async function changeMemberRole(m: TeamMember, role: 'captain' | 'member' | 'bench') {
  if (!rosterTeam.value) return
  if (role === 'captain') {
    try {
      await ElMessageBox.confirm(
        `将「${m.nickname || m.pw_username || '-'}」设为队长？原队长将自动降为队员。`,
        '设置队长',
        { type: 'warning', confirmButtonText: '设为队长', cancelButtonText: '取消' },
      )
    } catch {
      return
    }
  }
  try {
    await updateTeamMemberRole(rosterTeam.value.id, m.id, m.profile_id, role)
    ElMessage.success(role === 'captain' ? '已设为队长' : role === 'bench' ? '已设为替补' : '已设为队员')
  } catch (e: any) {
    ElMessage.error(e.message || '更新失败，请检查数据库权限')
    return
  }
  roster.value = await listMembers(rosterTeam.value.id)
  membersMap.value[rosterTeam.value.id] = roster.value
}

onMounted(load)
</script>

<template>
  <div>
    <h2>战队报名审核</h2>

    <div class="filters-bar">
      <el-radio-group v-model="filter" @change="load">
        <el-radio-button value="all">全部（{{ counts.all }}）</el-radio-button>
        <el-radio-button value="pending">待审核（{{ counts.pending }}）</el-radio-button>
        <el-radio-button value="approved">已通过（{{ counts.approved }}）</el-radio-button>
        <el-radio-button value="rejected">已拒绝（{{ counts.rejected }}）</el-radio-button>
      </el-radio-group>

      <el-select
        v-model="currentEvent"
        placeholder="全部赛事"
        clearable
        class="event-filter"
        @change="load"
      >
        <el-option v-for="e in events" :key="e.id" :label="e.name" :value="e.id" />
      </el-select>
    </div>

    <el-table v-loading="loading" :data="filteredRows" stripe>
      <el-table-column type="expand">
        <template #default="{ row }">
          <el-table :data="membersMap[row.id] ?? []" size="small" class="member-table">
            <el-table-column prop="nickname" label="选手姓名" width="84">
              <template #default="{ row: m }">{{ m.nickname ?? '-' }}</template>
            </el-table-column>
            <el-table-column prop="pw_username" label="完美 ID" width="96" />
            <el-table-column label="角色" width="70">
              <template #default="{ row: m }">
                <el-tag v-if="m.is_captain" size="small" type="warning">队长</el-tag>
                <el-tag v-else-if="m.status === 'benched'" size="small" type="info">替补</el-tag>
                <el-tag v-else size="small" effect="plain">队员</el-tag>
              </template>
            </el-table-column>
          </el-table>
        </template>
      </el-table-column>
      <el-table-column prop="name" label="战队名称" min-width="150" />
      <el-table-column label="赛事" min-width="140">
        <template #default="{ row }">
          <el-tag size="small" effect="plain">{{ eventName(row.event_id) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="tag" label="战队 ID" width="90">
        <template #default="{ row }">{{ row.tag ?? '-' }}</template>
      </el-table-column>
      <el-table-column label="组别" width="120">
        <template #default="{ row }">
          <el-select
            :model-value="row.group_id"
            size="small"
            placeholder="未分组"
            @change="(v: string) => changeGroup(row, v)"
          >
            <el-option v-for="g in groups" :key="g.id" :label="g.name" :value="g.id" />
          </el-select>
        </template>
      </el-table-column>
      <el-table-column label="成员数" width="90">
        <template #default="{ row }">
          <span :class="{ insufficient: memberCount(row.id) < MIN_MEMBERS }">
            {{ memberCount(row.id) }}/{{ MIN_MEMBERS }}
          </span>
        </template>
      </el-table-column>
      <el-table-column prop="created_at" label="报名时间" min-width="130" />
      <el-table-column label="状态" width="90">
        <template #default="{ row }">
          <el-tag
            :type="row.status === 'approved' ? 'success' : row.status === 'rejected' ? 'danger' : 'warning'"
          >
            {{ row.status === 'approved' ? '已通过' : row.status === 'rejected' ? '已拒绝' : '待审核' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="200">
        <template #default="{ row }">
          <el-button size="small" type="primary" plain @click="openRoster(row)">管理名册</el-button>
          <template v-if="row.status === 'pending'">
            <el-button size="small" type="success" @click="decide(row, 'approved')">通过</el-button>
            <el-button size="small" type="danger" @click="decide(row, 'rejected')">拒绝</el-button>
          </template>
        </template>
      </el-table-column>
    </el-table>

    <!-- 管理名册对话框 -->
    <el-dialog v-model="rosterVisible" :title="`管理名册：${rosterTeam?.name ?? ''}`" width="580px">
      <div class="add-bar">
        <el-select
          v-model="selectedPlayer"
          filterable
          placeholder="从选手池选择选手"
          style="flex: 1"
        >
          <el-option
            v-for="p in pool"
            :key="p.id"
            :label="`${playerLabel(p)}${p.in_team ? '（已是正式队员）' : ''}`"
            :value="p.id"
          />
        </el-select>
        <el-select v-model="addRole" style="width: 100px">
          <el-option label="队员" value="active" />
          <el-option label="替补" value="benched" />
        </el-select>
        <el-button
          type="primary"
          :loading="adding"
          :disabled="!selectedPlayer"
          @click="addPlayer"
        >
          添加
        </el-button>
      </div>

      <el-alert
        v-if="pool.length === 0"
        type="warning"
        :closable="false"
        title="选手池为空"
        description="请先在「个人选手审核」中通过个人注册申请，选手才会进入选手池。"
        class="roster-tip"
      />

      <el-table :data="roster" stripe size="small">
        <el-table-column prop="nickname" label="选手姓名" width="82">
          <template #default="{ row: m }">{{ m.nickname ?? '-' }}</template>
        </el-table-column>
        <el-table-column prop="pw_username" label="完美 ID" width="96" />
        <el-table-column label="角色" width="80">
          <template #default="{ row: m }">
            <el-select
              :model-value="memberRole(m)"
              size="small"
              style="width: 100%"
              @change="(v: 'captain' | 'member' | 'bench') => changeMemberRole(m, v)"
            >
              <el-option label="队长" value="captain" />
              <el-option label="队员" value="member" />
              <el-option label="替补" value="bench" />
            </el-select>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="52">
          <template #default="{ row: m }">
            <el-button
              v-if="!m.is_captain"
              link
              type="danger"
              @click="removeMember(m)"
            >
              移除
            </el-button>
          </template>
        </el-table-column>
      </el-table>
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

.event-filter {
  width: 200px;
  flex-shrink: 0;
}

.member-table {
  padding: 0 12px;
}

.insufficient {
  color: #f56c6c;
  font-weight: 700;
}

.add-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.roster-tip {
  margin-bottom: 12px;
}
</style>
