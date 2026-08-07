<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import type { EventItem } from '@/api/types'
import { EVENT_STATUS_LABEL } from '@/api/types'
import { listEvents } from '@/api/event'

const router = useRouter()
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

    <div v-loading="loading" class="event-list">
      <div
        v-for="e in events"
        :key="e.id"
        class="event-row"
        :class="`status-${e.status}`"
      >
        <span class="row-accent" />
        <span class="row-deco" />

        <div class="row-info">
          <div class="row-head">
            <span v-if="e.edition" class="edition-badge">第 {{ e.edition }} 届</span>
            <el-tag :type="statusType(e.status)" size="small" effect="plain" round>
              {{ EVENT_STATUS_LABEL[e.status] }}
            </el-tag>
          </div>
          <h3 class="event-name">{{ e.name }}</h3>
          <p class="event-desc">{{ e.description || '暂无简介' }}</p>
          <div class="meta">
            <div v-if="e.signup_start || e.signup_end" class="meta-line">
              <span class="meta-label">报名时间</span>
              {{ e.signup_start ? e.signup_start.slice(0, 10) : '未定' }}
              ~ {{ e.signup_end ? e.signup_end.slice(0, 10) : '未定' }}
            </div>
            <div v-if="e.start_at" class="meta-line">
              <span class="meta-label">开赛时间</span>
              {{ e.start_at.slice(0, 10) }}{{ e.end_at ? ` ~ ${e.end_at.slice(0, 10)}` : '' }}
            </div>
          </div>
        </div>

        <div class="row-actions">
          <template v-if="e.status === 'signup'">
            <div class="cta-tip">报名通道开放中</div>
            <el-button
              type="primary"
              size="large"
              round
              @click="router.push({ name: 'player-register' })"
            >
              立即报名
            </el-button>
          </template>
          <el-tag v-else type="info" effect="plain" round class="ended-tag">本届已结束</el-tag>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.title {
  margin: 0 0 4px;
}

.subtitle {
  margin: 0 0 24px;
  color: var(--cs2-text-muted);
  font-size: 13px;
}

.event-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.event-row {
  position: relative;
  display: flex;
  align-items: stretch;
  overflow: hidden;
  border-radius: 10px;
  border: 1px solid var(--cs2-border);
  background:
    radial-gradient(120% 140% at 100% 0%, rgba(255, 176, 32, 0.05), transparent 55%),
    linear-gradient(120deg, var(--cs2-panel), var(--cs2-panel-2));
  padding: 20px 28px 20px 24px;
  transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
}

.event-row:hover {
  transform: translateY(-2px);
  border-color: var(--cs2-border-strong);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
}

.event-row.status-signup {
  border-color: rgba(255, 176, 32, 0.35);
}

.event-row.status-signup:hover {
  border-color: rgba(255, 176, 32, 0.6);
}

/* 左侧渐变条 */
.row-accent {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
  background: linear-gradient(180deg, var(--cs2-accent), rgba(255, 176, 32, 0.1));
}

/* 右上角几何装饰线 */
.row-deco {
  position: absolute;
  right: 14px;
  top: -26px;
  width: 120px;
  height: 120px;
  border: 1px solid rgba(255, 176, 32, 0.12);
  border-radius: 50%;
  pointer-events: none;
}

.row-deco::after {
  content: '';
  position: absolute;
  inset: 14px;
  border: 1px solid rgba(255, 176, 32, 0.07);
  border-radius: 50%;
}

.row-info {
  flex: 1;
  min-width: 0;
  padding-right: 24px;
}

.row-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}

.edition-badge {
  color: var(--cs2-accent);
  font-weight: 700;
  font-size: 13px;
  letter-spacing: 2px;
}

.event-name {
  margin: 0 0 6px;
  font-size: 22px;
  font-weight: 800;
  letter-spacing: 1px;
  color: var(--cs2-text);
  background: linear-gradient(120deg, #fff, var(--cs2-text-muted));
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}

.event-desc {
  margin: 0 0 10px;
  color: var(--cs2-text-muted);
  font-size: 13px;
  line-height: 1.6;
}

.meta {
  display: flex;
  gap: 28px;
  flex-wrap: wrap;
  color: var(--cs2-text-regular, #c6ccd8);
  font-size: 12px;
  line-height: 1.8;
}

.meta-line {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.meta-label {
  color: var(--cs2-text-muted);
  white-space: nowrap;
}

.row-actions {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  justify-content: center;
  gap: 8px;
  min-width: 150px;
}

.cta-tip {
  font-size: 12px;
  color: var(--cs2-accent);
  letter-spacing: 1px;
}

.ended-tag {
  color: var(--cs2-text-muted);
}
</style>
