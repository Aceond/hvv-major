<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { ApplicationStatus, EventItem, PlayerApplication } from '@/api/types'
import { listEvents } from '@/api/event'
import { listPlayerApplications, reviewPlayerApplication } from '@/api/admin'

const rows = ref<PlayerApplication[]>([])
const events = ref<EventItem[]>([])
const loading = ref(false)
const filter = ref<'all' | ApplicationStatus>('all')

const filteredRows = computed(() =>
  filter.value === 'all' ? rows.value : rows.value.filter((a) => a.status === filter.value),
)

const counts = computed(() => ({
  all: rows.value.length,
  pending: rows.value.filter((a) => a.status === 'pending').length,
  approved: rows.value.filter((a) => a.status === 'approved').length,
  rejected: rows.value.filter((a) => a.status === 'rejected').length,
}))

async function load() {
  loading.value = true
  try {
    rows.value = await listPlayerApplications()
    events.value = await listEvents()
  } finally {
    loading.value = false
  }
}

function eventName(eventId: string | null) {
  return events.value.find((e) => e.id === eventId)?.name ?? '-'
}

async function decide(app: PlayerApplication, status: ApplicationStatus) {
  const action = status === 'approved' ? '通过' : '拒绝'
  const label = `${app.display_name || '未填写姓名'}（${app.pw_username}）`
  try {
    await ElMessageBox.confirm(
      `确认${action}「${label}」的个人注册申请吗？通过后将进入选手池。`,
      '审核确认',
      { type: 'warning', confirmButtonText: action, cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  await reviewPlayerApplication(app.id, status)
  ElMessage.success(`已${action}「${label}」`)
  load()
}

onMounted(load)
</script>

<template>
  <div>
    <h2>个人选手审核</h2>

    <el-radio-group v-model="filter" class="filters">
      <el-radio-button value="all">全部（{{ counts.all }}）</el-radio-button>
      <el-radio-button value="pending">待审核（{{ counts.pending }}）</el-radio-button>
      <el-radio-button value="approved">已通过（{{ counts.approved }}）</el-radio-button>
      <el-radio-button value="rejected">已拒绝（{{ counts.rejected }}）</el-radio-button>
    </el-radio-group>

    <el-table v-loading="loading" :data="filteredRows" stripe empty-text="暂无个人注册申请">
      <el-table-column prop="display_name" label="选手姓名" min-width="110">
        <template #default="{ row }">
          <span class="pw-name">{{ row.display_name || '-' }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="pw_username" label="完美 ID" min-width="140">
        <template #default="{ row }">
          <span class="pw-name">{{ row.pw_username }}</span>
        </template>
      </el-table-column>
      <el-table-column label="报名赛事" min-width="130">
        <template #default="{ row }">
          <el-tag size="small" effect="plain">{{ eventName(row.event_id) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="赛季截图" min-width="260">
        <template #default="{ row }">
          <div class="shots">
            <el-image
              v-for="(s, i) in row.screenshots"
              :key="i"
              :src="s"
              :preview-src-list="row.screenshots"
              :initial-index="i"
              fit="cover"
              preview-teleported
              class="shot"
            />
            <span v-if="row.screenshots.length === 0" class="no-shot">未上传</span>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="90">
        <template #default="{ row }">
          <el-tag
            :type="row.status === 'approved' ? 'success' : row.status === 'rejected' ? 'danger' : 'warning'"
          >
            {{ row.status === 'approved' ? '已通过' : row.status === 'rejected' ? '已拒绝' : '待审核' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="created_at" label="提交时间" min-width="140" />
      <el-table-column label="操作" width="150">
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

.pw-name {
  font-weight: 700;
  color: var(--cs2-accent);
}

.shots {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.shot {
  width: 56px;
  height: 56px;
  border-radius: 4px;
  border: 1px solid var(--cs2-border);
  cursor: zoom-in;
}

.no-shot {
  color: var(--cs2-text-muted);
  font-size: 12px;
}
</style>
