<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()

const features = [
  { title: '个人选手注册', desc: '先注册个人信息（昵称 + 完美 ID）进入选手池', to: 'player-register' },
  { title: '战队报名', desc: '队长创建战队，从已注册选手中挑选队员（≥5 人），管理员审核', to: 'register' },
  { title: '赛程与分组', desc: '传奇组 / 大师组 / 挑战组独立赛程，对阵与比分一目了然', to: 'matches' },
  { title: '数据排行', desc: '个人与队伍数据排行，支持按组别、阶段筛选', to: 'rankings' },
]
</script>

<template>
  <div class="page-container">
    <section class="hero">
      <h1>HVV Major · CS2</h1>
      <p class="slogan">战队报名 · 赛程赛制 · 积分排名 一站式赛事平台</p>
      <div class="cta">
        <el-button type="primary" size="large" @click="router.push({ name: 'register' })">
          立即报名
        </el-button>
        <el-button size="large" @click="router.push({ name: 'standings' })">
          查看积分榜
        </el-button>
      </div>
    </section>

    <el-row :gutter="16" class="features">
      <el-col v-for="f in features" :key="f.title" :xs="24" :sm="12" :md="6">
        <el-card class="feature-card" @click="router.push({ name: f.to as never })">
          <h3>{{ f.title }}</h3>
          <p>{{ f.desc }}</p>
        </el-card>
      </el-col>
    </el-row>

    <el-alert
      type="info"
      :closable="false"
      title="赛事公告"
      description="本系统为框架阶段骨架，赛程、比分与统计由管理员在后台录入维护。（此区域用于展示赛事公告）"
      class="notice"
    />
  </div>
</template>

<style scoped>
.hero {
  text-align: center;
  padding: 64px 16px 40px;
}

.hero h1 {
  font-size: 44px;
  margin: 0 0 12px;
  color: #409eff;
}

.slogan {
  color: #606266;
  font-size: 18px;
  margin-bottom: 28px;
}

.features {
  margin-top: 16px;
}

.feature-card {
  cursor: pointer;
  text-align: center;
  margin-bottom: 16px;
  transition: transform 0.2s;
}

.feature-card:hover {
  transform: translateY(-4px);
}

.feature-card h3 {
  margin: 8px 0;
}

.feature-card p {
  color: #909399;
  margin: 0;
}

.notice {
  margin-top: 24px;
}
</style>
