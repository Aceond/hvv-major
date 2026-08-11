<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { listMatches, listStages, listTeams } from '@/api/admin'

const stats = ref({ teams: 0, pending: 0, completed: 0, stages: 0 })

onMounted(async () => {
  const [teams, matches, stages] = await Promise.all([
    listTeams(),
    listMatches(),
    listStages(),
  ])
  stats.value = {
    // 战队总数不含已拒绝的战队（被拒绝的队伍不计入）
    teams: teams.filter((t) => t.status !== 'rejected').length,
    pending: teams.filter((t) => t.status === 'pending').length,
    completed: matches.filter((m) => m.status === 'completed').length,
    stages: stages.length,
  }
})
</script>

<template>
  <div>
    <h2>仪表盘</h2>
    <el-row :gutter="16">
      <el-col :xs="12" :sm="6">
        <el-card class="stat-card">
          <p class="stat-label">战队总数</p>
          <p class="stat-value">{{ stats.teams }}</p>
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="6">
        <el-card class="stat-card">
          <p class="stat-label">待审核战队</p>
          <p class="stat-value warning">{{ stats.pending }}</p>
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="6">
        <el-card class="stat-card">
          <p class="stat-label">已完成场次</p>
          <p class="stat-value">{{ stats.completed }}</p>
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="6">
        <el-card class="stat-card">
          <p class="stat-label">赛事阶段</p>
          <p class="stat-value success">{{ stats.stages }}</p>
        </el-card>
      </el-col>
    </el-row>

    <el-alert
      type="info"
      :closable="false"
      title="数据接入说明"
      description="接入 Supabase 并执行 schema.sql 后，此处展示真实统计。比赛结果与队伍/个人数据均由管理员在后台手动录入（赛程管理 → 录入比分；数据录入 → 维护统计）。"
      class="tip"
    />
  </div>
</template>

<style scoped>
.stat-card {
  text-align: center;
  margin-bottom: 16px;
}

.stat-label {
  color: var(--cs2-text-muted);
  margin: 0 0 8px;
}

.stat-value {
  font-size: 32px;
  font-weight: 700;
  margin: 0;
  color: var(--cs2-accent);
}

.warning {
  color: #e6a23c;
}

.success {
  color: #67c23a;
}

.tip {
  margin-top: 16px;
}
</style>
