<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type { EventItem } from '@/api/types'
import { EVENT_STATUS_LABEL } from '@/api/types'
import { listEvents } from '@/api/event'

const events = ref<EventItem[]>([])
const loading = ref(false)

function statusType(s: EventItem['status']) {
  return s === 'signup' ? 'success' : s === 'running' ? 'warning' : 'info'
}

async function load() {
  loading.value = true
  try {
    events.value = await listEvents()
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="page-container">
    <h2 class="title">赛事</h2>
    <p class="subtitle">
      HVV Major 为持续举办的系列赛事（当前已到第十一届）。选择本次要参加的赛事进行个人注册报名。
    </p>

    <div v-loading="loading" class="event-grid">
      <el-card v-for="e in events" :key="e.id" shadow="hover" class="event-card">
        <div class="card-head">
          <span class="edition-badge" v-if="e.edition">第 {{ e.edition }} 届</span>
          <el-tag :type="statusType(e.status)" size="small" effect="plain">
            {{ EVENT_STATUS_LABEL[e.status] }}
          </el-tag>
        </div>
        <h3 class="event-name">{{ e.name }}</h3>
        <p class="event-desc">{{ e.description || '暂无简介' }}</p>
        <div class="meta">
          <div v-if="e.signup_start || e.signup_end" class="meta-line">
            <span class="meta-label">报名时间</span>
            {{ e.signup_start }} ~ {{ e.signup_end ?? '未定' }}
          </div>
          <div v-if="e.start_at" class="meta-line">
            <span class="meta-label">开赛时间</span>
            {{ e.start_at }}{{ e.end_at ? ` ~ ${e.end_at}` : '' }}
          </div>
        </div>
        <div class="card-actions">
          <el-button
            v-if="e.status === 'signup'"
            type="primary"
            @click="$router.push({ name: 'player-register' })"
          >
            立即报名
          </el-button>
          <el-tag v-else type="info" effect="plain">已结束</el-tag>
        </div>
      </el-card>
    </div>
  </div>
</template>

<style scoped>
.title {
  margin: 0 0 4px;
}

.subtitle {
  margin: 0 0 20px;
  color: var(--cs2-text-muted);
  font-size: 13px;
}

.event-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
}

.event-card {
  display: flex;
  flex-direction: column;
  background: var(--cs2-panel);
}

.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.edition-badge {
  color: var(--cs2-accent);
  font-weight: 700;
  font-size: 13px;
  letter-spacing: 1px;
}

.event-name {
  margin: 0 0 8px;
  font-size: 20px;
  font-weight: 800;
  color: var(--cs2-text);
  letter-spacing: 1px;
}

.event-desc {
  margin: 0 0 12px;
  color: var(--cs2-text-muted);
  font-size: 13px;
  line-height: 1.6;
  min-height: 40px;
}

.meta {
  margin-bottom: 14px;
  color: var(--cs2-text-regular, #c6ccd8);
  font-size: 12px;
  line-height: 1.8;
}

.meta-line {
  display: flex;
  gap: 8px;
}

.meta-label {
  color: var(--cs2-text-muted);
  white-space: nowrap;
}

.card-actions {
  margin-top: auto;
}
</style>
