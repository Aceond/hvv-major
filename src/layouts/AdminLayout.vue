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
      <div class="aside-brand" @click="router.push({ name: 'admin-dashboard' })">
        <span class="brand-mark">HVV</span>
        <span class="brand-title">管理后台</span>
      </div>
      <el-menu
        :default-active="route.path"
        router
        class="aside-menu"
      >
        <el-menu-item index="/admin">
          <span class="menu-label">仪表盘</span>
        </el-menu-item>
        <el-menu-item index="/admin/events">
          <span class="menu-label">赛事管理</span>
        </el-menu-item>
        <el-menu-item index="/admin/players">
          <span class="menu-label">选手审核</span>
        </el-menu-item>
        <el-menu-item index="/admin/teams">
          <span class="menu-label">战队审核</span>
        </el-menu-item>
        <el-menu-item index="/admin/matches">
          <span class="menu-label">赛程管理</span>
        </el-menu-item>
        <el-menu-item index="/admin/stats">
          <span class="menu-label">数据录入</span>
        </el-menu-item>
        <el-menu-item index="/admin/settings">
          <span class="menu-label">站点设置</span>
        </el-menu-item>
      </el-menu>
    </el-aside>

    <el-container>
      <el-header class="header" height="56px">
        <span class="header-title">赛事运营中心</span>
        <div class="header-actions">
          <el-button class="ghost-btn" text size="small" @click="router.push({ name: 'home' })">
            返回前台
          </el-button>
          <span class="divider" />
          <span class="admin-name">{{ auth.profile?.username || auth.user?.email }}</span>
          <el-button class="ghost-btn" text size="small" @click="auth.signOut()">
            退出登录
          </el-button>
        </div>
      </el-header>
      <el-main class="main">
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
  display: flex;
  flex-direction: column;
  background: linear-gradient(180deg, var(--cs2-bg-soft), var(--cs2-panel));
  border-right: 1px solid var(--cs2-border);
}

.aside-brand {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 18px 20px;
  cursor: pointer;
}

.brand-mark {
  font-size: 20px;
  font-weight: 800;
  letter-spacing: 1px;
  color: var(--cs2-accent);
}

.brand-title {
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 2px;
  color: var(--cs2-text);
}

.aside-menu {
  flex: 1;
  border-right: none;
  --el-menu-bg-color: transparent;
  --el-menu-text-color: var(--cs2-text-muted);
  --el-menu-hover-bg-color: var(--cs2-panel-2);
  --el-menu-active-color: var(--cs2-accent);
}

.aside-menu :deep(.el-menu-item) {
  height: 46px;
  margin: 2px 10px;
  border-radius: 6px;
  font-weight: 600;
  letter-spacing: 1px;
}

.aside-menu :deep(.el-menu-item.is-active) {
  position: relative;
  background: var(--cs2-accent-soft);
  color: var(--cs2-accent);
}

.aside-menu :deep(.el-menu-item.is-active)::before {
  content: '';
  position: absolute;
  left: 0;
  top: 20%;
  bottom: 20%;
  width: 3px;
  background: var(--cs2-accent);
  border-radius: 2px;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: rgba(16, 20, 29, 0.7);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--cs2-border);
}

.header-title {
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 2px;
  color: var(--cs2-text);
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.admin-name {
  color: var(--cs2-text-muted);
  font-size: 13px;
}

.ghost-btn {
  color: var(--cs2-text-muted);
}

.ghost-btn:hover {
  color: var(--cs2-accent);
}

.divider {
  width: 1px;
  height: 16px;
  background: var(--cs2-border-strong);
}

.main {
  background: var(--cs2-bg);
}
</style>
