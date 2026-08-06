<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { isSupabaseConfigured } from '@/lib/supabase'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
</script>

<template>
  <el-container class="layout">
    <el-header class="header">
      <div class="logo" @click="router.push({ name: 'home' })">HVV Major</div>
      <el-tag v-if="!isSupabaseConfigured" type="warning" size="small" effect="plain">
        演示模式
      </el-tag>
      <el-menu
        mode="horizontal"
        :ellipsis="false"
        :default-active="route.path"
        router
        class="nav"
      >
        <el-menu-item index="/">首页</el-menu-item>
        <el-menu-item index="/player/register">个人注册</el-menu-item>
        <el-menu-item index="/register">战队报名</el-menu-item>
        <el-menu-item index="/matches">赛程</el-menu-item>
        <el-menu-item index="/standings">积分榜</el-menu-item>
        <el-menu-item index="/rankings">数据排行</el-menu-item>
      </el-menu>
      <div class="user-area">
        <template v-if="auth.isLoggedIn">
          <el-button
            v-if="auth.isAdmin"
            text
            type="primary"
            @click="router.push({ name: 'admin-dashboard' })"
          >
            管理后台
          </el-button>
          <el-dropdown>
            <span class="username">{{ auth.profile?.username || auth.user?.email }}</span>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item @click="auth.signOut()">退出登录</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </template>
        <el-button v-else type="primary" @click="router.push({ name: 'login' })">
          登录 / 注册
        </el-button>
      </div>
    </el-header>

    <el-main class="main">
      <router-view />
    </el-main>

    <el-footer class="footer">HVV Major · 报名 / 数据 / 比赛 三合一平台</el-footer>
  </el-container>
</template>

<style scoped>
.layout {
  min-height: 100vh;
}

.header {
  display: flex;
  align-items: center;
  gap: 24px;
  background: #fff;
  border-bottom: 1px solid #e4e7ed;
}

.logo {
  font-size: 20px;
  font-weight: 700;
  color: #409eff;
  cursor: pointer;
  white-space: nowrap;
}

.nav {
  flex: 1;
  border-bottom: none;
}

.user-area {
  display: flex;
  align-items: center;
  gap: 12px;
  white-space: nowrap;
}

.username {
  cursor: pointer;
  color: #606266;
}

.main {
  flex: 1;
}

.footer {
  text-align: center;
  color: #909399;
  font-size: 13px;
}
</style>
