<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { MATCH_STATUS_LABEL } from '@/api/types'
import type { Match } from '@/api/types'
import { listThisWeekMatches, thisWeekRange } from '@/api/match'
import { getSiteConfig, DEFAULT_SITE_CONFIG } from '@/api/config'
import type { SiteConfig } from '@/api/config'

const router = useRouter()

const features = [
  {
    title: '个人选手注册',
    desc: '先注册个人信息（昵称 + 完美 ID）进入选手池',
    to: 'player-register',
    tag: 'PLAYER',
  },
  {
    title: '战队报名',
    desc: '队长创建战队，从已注册选手中挑选队员（≥5 人），管理员审核',
    to: 'register',
    tag: 'TEAM',
  },
  {
    title: '赛程与分组',
    desc: '传奇组 / 大师组 / 挑战组独立赛程，对阵与比分一目了然',
    to: 'matches',
    tag: 'SCHEDULE',
  },
  {
    title: '数据排行',
    desc: '个人与队伍数据排行，支持按组别、阶段筛选',
    to: 'rankings',
    tag: 'RANKING',
  },
]

const config = ref<SiteConfig>({ ...DEFAULT_SITE_CONFIG })
const weekMatches = ref<Match[]>([])
const weekLabel = ref('')

/** hero 大标题拆分：首个单词正常色，其余部分高亮（如 "HVV" + "MAJOR 11"） */
const heroTitleParts = computed(() => config.value.brand_title.split(' ').filter(Boolean))

function matchStatusType(status: Match['status']) {
  return status === 'completed' ? 'success' : status === 'cancelled' ? 'danger' : 'warning'
}

const pad = (n: number) => String(n).padStart(2, '0')

function parseScheduled(s: string | null): Date | null {
  if (!s) return null
  const d = new Date(s.replace(' ', 'T'))
  return isNaN(d.getTime()) ? null : d
}

function formatDate(s: string | null) {
  const d = parseScheduled(s)
  return d ? `${pad(d.getMonth() + 1)}.${pad(d.getDate())}` : '-'
}

function formatTime(s: string | null) {
  const d = parseScheduled(s)
  return d ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : '-'
}

onMounted(async () => {
  const [cfg, matches] = await Promise.all([getSiteConfig(), listThisWeekMatches()])
  config.value = cfg
  weekMatches.value = matches
  const { start, end } = thisWeekRange()
  weekLabel.value = `${start.slice(5).replace('-', '.')} - ${end.slice(5).replace('-', '.')}`
})
</script>

<template>
  <div class="page-container home">
    <section class="hero">
      <div class="hero-overline">
        <span class="hero-line" />
        {{ config.brand_overline }}
        <span class="hero-line" />
      </div>
      <h1 class="hero-title">
        <template v-if="heroTitleParts.length > 1">
          {{ heroTitleParts[0] }}
          <span class="hero-accent">{{ heroTitleParts.slice(1).join(' ') }}</span>
        </template>
        <span v-else class="hero-accent">{{ heroTitleParts[0] }}</span>
      </h1>
      <p class="hero-slogan">{{ config.brand_slogan }}</p>
      <div class="cta">
        <el-button class="cta-primary" size="large" @click="router.push({ name: 'register' })">
          立即报名
        </el-button>
        <el-button class="cta-ghost" size="large" @click="router.push({ name: 'standings' })">
          查看积分榜
        </el-button>
      </div>
      <div class="hero-corner hero-corner-tl" />
      <div class="hero-corner hero-corner-br" />
    </section>

    <el-row :gutter="16" class="features">
      <el-col v-for="f in features" :key="f.title" :xs="24" :sm="12" :md="6">
        <div class="feature-card" @click="router.push({ name: f.to as never })">
          <span class="feature-tag">{{ f.tag }}</span>
          <h3>{{ f.title }}</h3>
          <p>{{ f.desc }}</p>
          <span class="feature-arrow">→</span>
        </div>
      </el-col>
    </el-row>

    <section class="week-matches">
      <div class="week-header">
        <div class="week-title">
          <span class="notice-icon">!</span>
          最近比赛
        </div>
        <span class="week-sub">本周赛程 {{ weekLabel }}</span>
        <el-button
          class="week-more"
          text
          size="small"
          @click="router.push({ name: 'matches' })"
        >
          查看全部 →
        </el-button>
      </div>

      <div v-if="weekMatches.length === 0" class="week-empty">本周暂无比赛</div>
      <div v-else class="match-list">
        <div
          v-for="m in weekMatches"
          :key="m.id"
          class="match-row"
          @click="router.push({ name: 'matches' })"
        >
          <div class="match-time">
            <span class="match-date">{{ formatDate(m.scheduled_at) }}</span>
            <span class="match-clock">{{ formatTime(m.scheduled_at) }}</span>
          </div>
          <div class="match-info">
            <el-tag size="small" effect="plain">{{ m.group_name ?? '跨组' }}</el-tag>
            <span class="match-stage">{{ m.stage_name }}</span>
          </div>
          <div class="matchup">
            <span class="team" :class="{ win: m.winner_id === m.team_a_id }">
              {{ m.team_a_name }}
            </span>
            <span class="score">
              {{ m.status === 'scheduled' ? 'VS' : `${m.team_a_score} : ${m.team_b_score}` }}
            </span>
            <span class="team" :class="{ win: m.winner_id === m.team_b_id }">
              {{ m.team_b_name }}
            </span>
          </div>
          <el-tag :type="matchStatusType(m.status)" size="small">
            {{ MATCH_STATUS_LABEL[m.status] }}
          </el-tag>
        </div>
      </div>
    </section>

    <section class="notice">
      <div class="notice-title">
        <span class="notice-icon">!</span>
        赛事公告
      </div>
      <p>{{ config.notice }}</p>
    </section>
  </div>
</template>

<style scoped>
.home {
  padding-top: 12px;
}

.hero {
  position: relative;
  text-align: center;
  padding: 72px 16px 56px;
  margin-bottom: 32px;
  background:
    linear-gradient(180deg, rgba(255, 176, 32, 0.05), transparent 70%),
    linear-gradient(160deg, var(--cs2-panel-2), var(--cs2-panel) 55%, var(--cs2-bg-soft));
  border: 1px solid var(--cs2-border);
  clip-path: polygon(0 0, 100% 0, 100% calc(100% - 26px), calc(100% - 26px) 100%, 0 100%);
  overflow: hidden;
}

.hero-overline {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 14px;
  font-size: 12px;
  letter-spacing: 3px;
  color: var(--cs2-text-muted);
  margin-bottom: 20px;
}

.hero-line {
  width: 48px;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--cs2-accent), transparent);
}

.hero-title {
  margin: 0 0 16px;
  font-size: 56px;
  font-weight: 800;
  letter-spacing: 6px;
  color: var(--cs2-text);
}

.hero-accent {
  color: var(--cs2-accent);
  text-shadow: 0 0 24px rgba(255, 176, 32, 0.35);
}

.hero-slogan {
  margin: 0 0 32px;
  font-size: 17px;
  letter-spacing: 2px;
  color: var(--cs2-text-muted);
}

.cta {
  display: flex;
  justify-content: center;
  gap: 14px;
}

.cta-primary {
  --el-button-bg-color: var(--cs2-accent);
  --el-button-border-color: var(--cs2-accent);
  --el-button-text-color: #14100a;
  --el-button-hover-bg-color: #ffc64d;
  --el-button-hover-border-color: #ffc64d;
  font-weight: 800;
  letter-spacing: 2px;
  clip-path: polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 10px 100%, 0 calc(100% - 10px));
}

.cta-ghost {
  --el-button-bg-color: transparent;
  --el-button-border-color: var(--cs2-border-strong);
  --el-button-text-color: var(--cs2-text);
  --el-button-hover-bg-color: var(--cs2-accent-soft);
  --el-button-hover-border-color: var(--cs2-accent);
  --el-button-hover-text-color: var(--cs2-accent);
  font-weight: 700;
  letter-spacing: 2px;
}

.hero-corner {
  position: absolute;
  width: 46px;
  height: 46px;
  border-color: var(--cs2-accent);
  opacity: 0.35;
}

.hero-corner-tl {
  top: 18px;
  left: 18px;
  border-top: 2px solid;
  border-left: 2px solid;
}

.hero-corner-br {
  right: 18px;
  bottom: 18px;
  border-right: 2px solid;
  border-bottom: 2px solid;
}

.features {
  margin-bottom: 8px;
}

.feature-card {
  position: relative;
  cursor: pointer;
  height: 168px;
  padding: 22px 20px 16px;
  margin-bottom: 16px;
  background: linear-gradient(180deg, var(--cs2-panel-2), var(--cs2-panel));
  border: 1px solid var(--cs2-border);
  clip-path: polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 0 100%);
  transition: border-color 0.2s, transform 0.2s;
}

.feature-card:hover {
  border-color: var(--cs2-accent);
  transform: translateY(-4px);
}

.feature-card:hover .feature-arrow {
  color: var(--cs2-accent);
  transform: translateX(4px);
}

.feature-tag {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 2px;
  color: var(--cs2-accent);
  opacity: 0.85;
}

.feature-card h3 {
  margin: 10px 0 8px;
  font-size: 17px;
  color: var(--cs2-text);
}

.feature-card p {
  margin: 0;
  font-size: 13px;
  line-height: 1.7;
  color: var(--cs2-text-muted);
}

.feature-arrow {
  position: absolute;
  right: 16px;
  bottom: 14px;
  font-size: 18px;
  color: var(--cs2-text-muted);
  transition: color 0.2s, transform 0.2s;
}

/* 最近比赛（本周赛程） */
.week-matches {
  margin-top: 24px;
  padding: 18px 22px 8px;
  background: var(--cs2-panel);
  border: 1px solid var(--cs2-border);
}

.week-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
}

.week-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 700;
  letter-spacing: 1px;
  color: var(--cs2-text);
}

.week-sub {
  font-size: 12px;
  letter-spacing: 1px;
  color: var(--cs2-text-muted);
}

.week-more {
  margin-left: auto;
  color: var(--cs2-accent);
}

.notice-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  background: var(--cs2-accent);
  color: #14100a;
  font-size: 12px;
  font-weight: 800;
  clip-path: polygon(0 0, 100% 0, 100% calc(100% - 4px), calc(100% - 4px) 100%, 0 100%);
}

.week-empty {
  padding: 28px 0;
  text-align: center;
  color: var(--cs2-text-muted);
  font-size: 13px;
}

.match-row {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 10px 12px;
  margin-bottom: 10px;
  background: linear-gradient(180deg, var(--cs2-panel-2), var(--cs2-panel));
  border: 1px solid var(--cs2-border);
  cursor: pointer;
  transition: border-color 0.2s;
}

.match-row:hover {
  border-color: var(--cs2-accent);
}

.match-time {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 58px;
}

.match-date {
  font-size: 13px;
  font-weight: 700;
  color: var(--cs2-accent);
}

.match-clock {
  font-size: 11px;
  color: var(--cs2-text-muted);
}

.match-info {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 120px;
}

.match-stage {
  font-size: 12px;
  color: var(--cs2-text-muted);
}

.matchup {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  min-width: 0;
}

.team {
  min-width: 90px;
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: center;
  color: var(--cs2-text-regular, #c6ccd8);
}

.team.win {
  color: #67c23a;
  font-weight: 700;
}

.score {
  font-weight: 700;
  color: var(--cs2-accent);
  white-space: nowrap;
}

.notice {
  margin-top: 24px;
  padding: 18px 22px;
  background: var(--cs2-panel);
  border: 1px solid var(--cs2-border);
  border-left: 3px solid var(--cs2-accent);
}

.notice-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 700;
  letter-spacing: 1px;
  margin-bottom: 8px;
  color: var(--cs2-text);
}

.notice p {
  margin: 0;
  font-size: 13px;
  color: var(--cs2-text-muted);
}
</style>
