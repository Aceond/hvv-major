<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { listMyPlayerApplication } from '@/api/registration'
import type { PlayerApplication } from '@/api/types'

const router = useRouter()
const auth = useAuthStore()
const application = ref<PlayerApplication | null>(null)

onMounted(async () => {
  if (!auth.isLoggedIn) {
    router.replace({ name: 'login' })
    return
  }
  await auth.loadApplicationStatus()
  application.value = await listMyPlayerApplication()
})

function goRegister() {
  router.push({ name: 'player-register' })
}

function goHome() {
  router.push({ name: 'home' })
}
</script>

<template>
  <div class="page-container">
    <div class="audit-card">
      <!-- 审核中 -->
      <template v-if="auth.applicationStatus === 'pending'">
        <el-result icon="info" title="账号审核中" sub-title="你的注册申请已提交，正在等待管理员审核。审核通过后即可使用全部功能。">
          <template #extra>
            <el-button type="primary" @click="goHome">返回首页</el-button>
          </template>
        </el-result>
      </template>

      <!-- 审核被拒 -->
      <template v-else-if="auth.applicationStatus === 'rejected'">
        <el-result icon="warning" title="审核未通过" :sub-title="application?.review_note || '你的注册申请未通过管理员审核，可重新提交。'">
          <template #extra>
            <el-button type="primary" @click="goRegister">重新提交申请</el-button>
            <el-button @click="goHome">返回首页</el-button>
          </template>
        </el-result>
      </template>

      <!-- 兜底：未提交申请 / 已通过 -->
      <template v-else>
        <el-result
          icon="success"
          title="账号状态正常"
          :sub-title="auth.applicationStatus === 'approved' ? '你的账号已通过审核。' : '你尚未提交个人注册申请。'"
        >
          <template #extra>
            <el-button v-if="!auth.applicationStatus" type="primary" @click="goRegister">去提交注册申请</el-button>
            <el-button type="primary" @click="goHome">返回首页</el-button>
          </template>
        </el-result>
      </template>
    </div>
  </div>
</template>

<style scoped>
.audit-card {
  max-width: 560px;
  margin: 48px auto 0;
  padding: 24px 8px;
  border-radius: 12px;
  background: var(--cs2-panel);
  border: 1px solid var(--cs2-border);
}
</style>
