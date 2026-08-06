<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
</script>

<template>
  <el-container class="admin-layout">
    <el-aside width="220px" class="aside">
      <div class="aside-title">HVV Major 管理后台</div>
      <el-menu
        :default-active="route.path"
        router
        background-color="#001529"
        text-color="#a6adb4"
        active-text-color="#fff"
      >
        <el-menu-item index="/admin">仪表盘</el-menu-item>
        <el-menu-item index="/admin/teams">战队审核</el-menu-item>
        <el-menu-item index="/admin/matches">赛程管理</el-menu-item>
        <el-menu-item index="/admin/stats">数据录入</el-menu-item>
      </el-menu>
    </el-aside>

    <el-container>
      <el-header class="header">
        <span>管理员：{{ auth.profile?.username || auth.user?.email }}</span>
        <div>
          <el-button text type="primary" @click="router.push({ name: 'home' })">
            返回前台
          </el-button>
          <el-button text @click="auth.signOut()">退出登录</el-button>
        </div>
      </el-header>
      <el-main>
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<style scoped>
.admin-layout {
  min-height: 100vh;
}

.aside {
  background: #001529;
}

.aside-title {
  color: #fff;
  font-weight: 700;
  padding: 18px 16px;
  font-size: 15px;
}

.aside :deep(.el-menu) {
  border-right: none;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #fff;
  border-bottom: 1px solid #e4e7ed;
}
</style>
