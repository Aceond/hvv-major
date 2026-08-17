<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { ApplicationStatus, EventItem, PlayerApplication } from '@/api/types'
import { CS2_RANKS } from '@/api/types'
import { listEvents } from '@/api/event'
import { listPlayerApplications, reviewPlayerApplication } from '@/api/admin'
import { formatDateTime } from '@/utils/format'

const rows = ref<PlayerApplication[]>([])
const events = ref<EventItem[]>([])
const loading = ref(false)
const filter = ref<'all' | ApplicationStatus>('all')
const currentEvent = ref('') // 赛事筛选：'' = 全部
/** 待审核行管理员选定的近 3 赛季最高段位（key = 申请 id） */
const rankDraft = ref<Record<string, string>>({})
/** 待审核行管理员确认的最高段位 Rating（key = 申请 id） */
const ratingDraft = ref<Record<string, number | null>>({})

const filteredRows = computed(() =>
  rows.value.filter((a) =>
    (filter.value === 'all' ? true : a.status === filter.value) &&
    (!currentEvent.value || a.event_id === currentEvent.value),
  ),
)

const counts = computed(() => {
  const inEvent = rows.value.filter((a) => !currentEvent.value || a.event_id === currentEvent.value)
  return {
    all: inEvent.length,
    pending: inEvent.filter((a) => a.status === 'pending').length,
    approved: inEvent.filter((a) => a.status === 'approved').length,
    rejected: inEvent.filter((a) => a.status === 'rejected').length,
  }
})

async function load() {
  loading.value = true
  try {
    rows.value = await listPlayerApplications(currentEvent.value || undefined)
    events.value = await listEvents()
    // 重置段位/rating 草稿（以已记录值回显）
    rankDraft.value = Object.fromEntries(
      rows.value.filter((a) => a.status === 'pending' && a.highest_rank).map((a) => [a.id, a.highest_rank as string]),
    )
    ratingDraft.value = Object.fromEntries(
      rows.value
        .filter((a) => a.status === 'pending' && a.highest_rating != null)
        .map((a) => [a.id, a.highest_rating as number]),
    )
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
  const rank = rankDraft.value[app.id]
  const rating = ratingDraft.value[app.id]
  const confirmLines = [
    `确认${action}「${label}」的个人注册申请吗？通过后将进入选手池。`,
  ]
  if (rank) confirmLines.push(`近 3 赛季最高段位：${rank}`)
  if (rating != null && !Number.isNaN(rating)) confirmLines.push(`最高段位 Rating：${rating}`)
  try {
    await ElMessageBox.confirm(
      confirmLines.join('\n'),
      '审核确认',
      { type: 'warning', confirmButtonText: action, cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  try {
    await reviewPlayerApplication(app.id, status, rank, rating)
  } catch (e: any) {
    ElMessage.error(e.message || '审核操作失败，请检查数据库权限')
    return
  }
  ElMessage.success(`已${action}「${label}」`)
  load()
}

onMounted(load)
</script>

<template>
  <div>
    <h2>个人选手审核</h2>

    <div class="filters-bar">
      <el-radio-group v-model="filter">
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
        <el-option
          v-for="e in events"
          :key="e.id"
          :label="`${e.name}${e.edition ? `（第 ${e.edition} 届）` : ''}`"
          :value="e.id"
        />
      </el-select>
    </div>

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
      <el-table-column label="在职状态" min-width="140">
        <template #default="{ row }">
          <template v-if="row.employment_status === 'employed'">
            <el-tag size="small" type="success" effect="plain">在职</el-tag>
            <div class="emp-sub">{{ row.location }} · 工号 {{ row.employee_no }}</div>
          </template>
          <el-tag v-else size="small" type="info" effect="plain">离职</el-tag>
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
      <el-table-column label="近3赛季最高段位" min-width="150">
        <template #default="{ row }">
          <el-select
            v-if="row.status === 'pending'"
            v-model="rankDraft[row.id]"
            placeholder="查看战绩后选择"
            clearable
            size="small"
            style="width: 130px"
          >
            <el-option v-for="r in CS2_RANKS" :key="r" :label="r" :value="r" />
          </el-select>
          <el-tag v-else-if="row.highest_rank" size="small" type="warning" effect="plain">
            {{ row.highest_rank }}
          </el-tag>
          <span v-else class="no-rank">未记录</span>
        </template>
      </el-table-column>
      <el-table-column label="最高Rating" min-width="140">
        <template #default="{ row }">
          <el-input-number
            v-if="row.status === 'pending'"
            v-model="ratingDraft[row.id]"
            :min="0"
            :max="10"
            :precision="2"
            :step="0.1"
            size="small"
            controls-position="right"
            placeholder="最高段位 Rating"
            style="width: 120px"
          />
          <el-tag v-else-if="row.highest_rating != null" size="small" type="warning" effect="plain">
            {{ row.highest_rating }}
          </el-tag>
          <span v-else class="no-rank">未记录</span>
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
      <el-table-column label="提交时间" min-width="140">
        <template #default="{ row }">{{ formatDateTime(row.created_at) }}</template>
      </el-table-column>
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
.filters-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.event-filter {
  width: 220px;
  flex-shrink: 0;
}

.done-text {
  color: #c0c4cc;
}

.pw-name {
  font-weight: 700;
  color: var(--cs2-accent);
}

.emp-sub {
  font-size: 12px;
  color: var(--cs2-text-muted);
  line-height: 1.5;
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

.no-rank {
  color: var(--cs2-text-muted);
  font-size: 12px;
}
</style>
