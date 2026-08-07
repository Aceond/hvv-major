<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const auth = useAuthStore()

onMounted(async () => {
  if (!auth.isLoggedIn) {
    router.replace({ name: 'login' })
    return
  }
  await auth.loadAccountStatus()
})

function goHome() {
  router.push({ name: 'home' })
}
</script>

<template>
  <div class="page-container">
    <div class="audit-card">
      <!-- 审核中 -->
      <template v-if="auth.accountStatus === 'pending'">
        <el-result icon="info" title="账号审核中" sub-title="你的账号已注册成功，正在等待管理员审核。审核通过后即可使用全部功能。">
          <template #extra>
            <el-button type="primary" @click="goHome">返回首页</el-button>
          </template>
        </el-result>
      </template>

      <!-- 审核被拒 -->
      <template v-else-if="auth.accountStatus === 'rejected'">
        <el-result icon="warning" title="账号审核未通过" sub-title="你的账号未通过管理员审核，暂时无法使用系统功能。如有疑问请联系管理员。">
          <template #extra>
            <el-button type="primary" @click="goHome">返回首页</el-button>
          </template>
        </el-result>
      </template>

      <!-- 兜底：已通过 / 状态未知 -->
      <template v-else>
        <el-result
          icon="success"
          title="账号状态正常"
          :sub-title="auth.accountStatus === 'approved' ? '你的账号已通过审核，可以正常使用。' : '账号状态正常，可以正常使用。'"
        >
          <template #extra>
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
