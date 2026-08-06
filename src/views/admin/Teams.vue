<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { Group, Team, TeamMember, TeamStatus } from '@/api/types'
import { listGroups, listMembers, listTeams, updateTeamGroup, updateTeamStatus } from '@/api/admin'

const rows = ref<Team[]>([])
const groups = ref<Group[]>([])
const membersMap = ref<Record<string, TeamMember[]>>({})
const loading = ref(false)
const filter = ref<'all' | TeamStatus>('all')

const MIN_MEMBERS = 5

const filteredRows = computed(() =>
  filter.value === 'all'
    ? rows.value
    : rows.value.filter((t) => t.status === filter.value),
)

function memberCount(teamId: string) {
  return (membersMap.value[teamId] ?? []).length
}

function groupName(groupId: string | null) {
  return groups.value.find((g) => g.id === groupId)?.name ?? '未分组'
}

const counts = computed(() => ({
  all: rows.value.length,
  pending: rows.value.filter((t) => t.status === 'pending').length,
  approved: rows.value.filter((t) => t.status === 'approved').length,
  rejected: rows.value.filter((t) => t.status === 'rejected').length,
}))

async function load() {
  loading.value = true
  try {
    rows.value = await listTeams()
    groups.value = await listGroups()
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

onMounted(load)
</script>

<template>
  <div>
    <h2>战队报名审核</h2>

    <el-radio-group v-model="filter" class="filters" @change="load">
      <el-radio-button value="all">全部（{{ counts.all }}）</el-radio-button>
      <el-radio-button value="pending">待审核（{{ counts.pending }}）</el-radio-button>
      <el-radio-button value="approved">已通过（{{ counts.approved }}）</el-radio-button>
      <el-radio-button value="rejected">已拒绝（{{ counts.rejected }}）</el-radio-button>
    </el-radio-group>

    <el-table v-loading="loading" :data="filteredRows" stripe>
      <el-table-column type="expand">
        <template #default="{ row }">
          <el-table :data="membersMap[row.id] ?? []" size="small" class="member-table">
            <el-table-column prop="nickname" label="游戏昵称" min-width="120" />
            <el-table-column prop="pw_username" label="完美 ID（用户名）" min-width="160" />
            <el-table-column label="角色" width="80">
              <template #default="{ row: m }">
                <el-tag v-if="m.is_captain" size="small" type="warning">队长</el-tag>
              </template>
            </el-table-column>
          </el-table>
        </template>
      </el-table-column>
      <el-table-column prop="name" label="战队名称" min-width="150" />
      <el-table-column prop="tag" label="队标" width="70">
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
      <el-table-column label="操作" width="160">
        <template #default="{ row }">
          <template v-if="row.status === 'pending'">
            <el-button size="small" type="success" @click="decide(row, 'approved')">通过</el-button>
            <el-button size="small" type="danger" @click="decide(row, 'rejected')">拒绝</el-button>
          </template>
          <span v-else class="done-text">已处理</span>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<style scoped>
.filters {
  margin-bottom: 16px;
}

.done-text {
  color: #c0c4cc;
}

.member-table {
  padding: 0 24px;
}

.insufficient {
  color: #f56c6c;
  font-weight: 700;
}
</style>
