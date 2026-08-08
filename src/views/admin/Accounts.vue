<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { AccountItem, ApplicationStatus } from '@/api/types'
import { ROLE_LABEL } from '@/api/types'
import { listAccounts, reviewAccount, setAccountRole } from '@/api/admin'

const rows = ref<AccountItem[]>([])
const loading = ref(false)
const filter = ref<'all' | ApplicationStatus>('all')

const filteredRows = computed(() =>
  filter.value === 'all' ? rows.value : rows.value.filter((a) => a.account_status === filter.value),
)

const counts = computed(() => ({
  all: rows.value.length,
  pending: rows.value.filter((a) => a.account_status === 'pending').length,
  approved: rows.value.filter((a) => a.account_status === 'approved').length,
  rejected: rows.value.filter((a) => a.account_status === 'rejected').length,
}))

async function load() {
  loading.value = true
  try {
    rows.value = await listAccounts()
  } finally {
    loading.value = false
  }
}

async function decide(row: AccountItem, status: ApplicationStatus) {
  const action = status === 'approved' ? '通过' : '拒绝'
  const label = row.email || row.username || '未命名账号'
  try {
    await ElMessageBox.confirm(`确认${action}账号「${label}」吗？${action === '通过' ? '通过后该账号即可使用全部功能。' : '拒绝后该账号将无法使用系统功能。'}`, '账号审核', {
      type: 'warning',
      confirmButtonText: action,
      cancelButtonText: '取消',
    })
  } catch {
    return
  }
  try {
    await reviewAccount(row.id, status)
  } catch (e: any) {
    ElMessage.error(e.message || '审核操作失败')
    return
  }
  ElMessage.success(`已${action}账号「${label}」`)
  load()
}

/** 切换账号角色（设为解说 / 设回选手；管理员账号不可改） */
async function changeRole(row: AccountItem, role: 'caster' | 'player') {
  const label = row.email || row.username || '未命名账号'
  const roleName = ROLE_LABEL[role]
  try {
    await ElMessageBox.confirm(`确认将「${label}」的角色设为「${roleName}」吗？`, '设置角色', {
      type: 'warning',
      confirmButtonText: '确定',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }
  try {
    await setAccountRole(row.id, role)
  } catch (e: any) {
    ElMessage.error(e.message || '设置角色失败')
    return
  }
  ElMessage.success(`已将「${label}」设为${roleName}`)
  load()
}

onMounted(load)
</script>

<template>
  <div>
    <h2>账号审核</h2>
    <el-alert
      type="info"
      :closable="false"
      title="新注册账号需审核通过后方可正常使用；待审核/被拒账号仅能访问首页、赛事、赛程、积分榜、数据排行。"
      class="tip"
    />

    <el-radio-group v-model="filter" class="filters">
      <el-radio-button value="all">全部（{{ counts.all }}）</el-radio-button>
      <el-radio-button value="pending">待审核（{{ counts.pending }}）</el-radio-button>
      <el-radio-button value="approved">已通过（{{ counts.approved }}）</el-radio-button>
      <el-radio-button value="rejected">已拒绝（{{ counts.rejected }}）</el-radio-button>
    </el-radio-group>

    <el-table v-loading="loading" :data="filteredRows" stripe empty-text="暂无账号">
      <el-table-column prop="username" label="用户名" min-width="140">
        <template #default="{ row }">
          <span class="acc-name">{{ row.username || '-' }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="email" label="邮箱" min-width="180">
        <template #default="{ row }">{{ row.email || '-' }}</template>
      </el-table-column>
      <el-table-column label="角色" width="90">
        <template #default="{ row }">
          <el-tag
            v-if="row.role"
            size="small"
            :type="row.role === 'admin' ? 'danger' : row.role === 'caster' ? 'warning' : 'info'"
            effect="plain"
          >
            {{ ROLE_LABEL[row.role] }}
          </el-tag>
          <span v-else>-</span>
        </template>
      </el-table-column>
      <el-table-column label="账号状态" width="100">
        <template #default="{ row }">
          <el-tag
            size="small"
            :type="row.account_status === 'approved' ? 'success' : row.account_status === 'rejected' ? 'danger' : 'warning'"
            effect="plain"
          >
            {{ row.account_status === 'approved' ? '已通过' : row.account_status === 'rejected' ? '已拒绝' : '待审核' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="created_at" label="注册时间" min-width="150" />
      <el-table-column label="操作" width="210">
        <template #default="{ row }">
          <template v-if="row.account_status === 'pending'">
            <el-button size="small" type="success" @click="decide(row, 'approved')">通过</el-button>
            <el-button size="small" type="danger" @click="decide(row, 'rejected')">拒绝</el-button>
          </template>
          <template v-else>
            <template v-if="row.role !== 'admin'">
              <el-button
                v-if="row.role !== 'caster'"
                size="small"
                type="warning"
                plain
                @click="changeRole(row, 'caster')"
              >
                设为解说
              </el-button>
              <el-button
                v-if="row.role === 'caster'"
                size="small"
                @click="changeRole(row, 'player')"
              >
                设为选手
              </el-button>
            </template>
            <span v-else class="done-text">管理员</span>
          </template>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<style scoped>
.tip {
  margin-bottom: 12px;
}

.filters {
  margin-bottom: 16px;
}

.done-text {
  color: #c0c4cc;
}

.acc-name {
  font-weight: 700;
  color: var(--cs2-accent);
}
</style>
