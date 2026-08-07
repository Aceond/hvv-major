<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { AccountItem, ApplicationStatus } from '@/api/types'
import { listAccounts, reviewAccount } from '@/api/admin'

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
          <el-tag v-if="row.role === 'admin'" size="small" type="danger" effect="plain">管理员</el-tag>
          <el-tag v-else-if="row.role === 'player'" size="small" effect="plain">选手</el-tag>
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
      <el-table-column label="操作" width="150">
        <template #default="{ row }">
          <template v-if="row.account_status === 'pending'">
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
