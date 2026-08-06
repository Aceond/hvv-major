<script setup lang="ts">
import { useRouter } from 'vue-router'

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
</script>

<template>
  <div class="page-container home">
    <section class="hero">
      <div class="hero-overline">
        <span class="hero-line" />
        HVV MAJOR 2026 · COUNTER-STRIKE 2
        <span class="hero-line" />
      </div>
      <h1 class="hero-title">
        HVV <span class="hero-accent">MAJOR</span>
      </h1>
      <p class="hero-slogan">战队报名 · 赛程赛制 · 积分排名 — 一站式 CS2 赛事平台</p>
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

    <section class="notice">
      <div class="notice-title">
        <span class="notice-icon">!</span>
        赛事公告
      </div>
      <p>
        本系统为框架阶段骨架，赛程、比分与统计由管理员在后台录入维护。
        （此区域用于展示赛事公告）
      </p>
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

.notice p {
  margin: 0;
  font-size: 13px;
  color: var(--cs2-text-muted);
}
</style>
