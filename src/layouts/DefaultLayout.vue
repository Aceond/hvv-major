<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useAuthStore } from '@/stores/auth'
import { isSupabaseConfigured } from '@/lib/supabase'
import Cs2Logo from '@/components/Cs2Logo.vue'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

/** 进入管理后台：管理员直接进入，其他人引导到登录页 */
function goAdmin() {
  if (auth.isLoggedIn && auth.isAdmin) {
    router.push({ name: 'admin-dashboard' })
  } else {
    ElMessage.info('请先以管理员身份登录后进入管理后台')
    router.push({ name: 'login' })
  }
}

/** 退出登录并返回登录页 */
async function signOut() {
  await auth.signOut()
  router.push({ name: 'login' })
}
</script>

<template>
  <el-container class="layout">
    <el-header class="header" height="60px">
      <div class="brand" @click="router.push({ name: 'home' })">
        <Cs2Logo :size="34" />
        <div class="brand-text">
          <span class="brand-name">HVV MAJOR</span>
          <span class="brand-sub">CS2 赛事平台</span>
        </div>
      </div>

      <el-tag v-if="!isSupabaseConfigured" class="demo-tag" size="small" effect="plain">
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
        <el-menu-item index="/events">赛事</el-menu-item>
        <el-sub-menu v-if="auth.isLoggedIn && !auth.isGuest && !auth.reviewBlocked" index="signup">
          <template #title>报名</template>
          <el-menu-item index="/player/register">个人注册</el-menu-item>
          <el-menu-item index="/register">战队报名</el-menu-item>
        </el-sub-menu>
        <el-sub-menu index="match">
          <template #title>比赛</template>
          <el-menu-item index="/matches">赛程</el-menu-item>
          <el-menu-item v-if="auth.isLoggedIn && !auth.isGuest && !auth.reviewBlocked" index="/booking">约战录入</el-menu-item>
        </el-sub-menu>
        <el-sub-menu index="data">
          <template #title>数据</template>
          <el-menu-item index="/standings">积分榜</el-menu-item>
          <el-menu-item index="/rankings">数据排行</el-menu-item>
        </el-sub-menu>
      </el-menu>

      <div class="user-area">
        <el-button class="admin-btn" size="small" @click="goAdmin">
          管理后台
        </el-button>
        <template v-if="auth.isLoggedIn">
          <el-dropdown>
            <span class="username">{{ auth.profile?.username }}</span>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item v-if="auth.isLoggedIn && !auth.isGuest && !auth.reviewBlocked" @click="router.push({ name: 'profile' })">个人中心</el-dropdown-item>
                <el-dropdown-item v-if="auth.reviewBlocked" @click="router.push({ name: 'review-status' })">账号审核状态</el-dropdown-item>
                <el-dropdown-item divided @click="signOut">退出登录</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </template>
        <el-button v-else class="login-btn" size="small" @click="router.push({ name: 'login' })">
          登录 / 注册
        </el-button>
      </div>
    </el-header>

    <el-main class="main">
      <router-view />
    </el-main>

    <el-footer class="footer" height="48px">
      <span class="footer-line" />
      <Cs2Logo :size="16" />
      HVV Major · 报名 / 数据 / 比赛 三合一赛事平台
    </el-footer>
  </el-container>
</template>

<style scoped>
.layout {
  min-height: 100vh;
}

.header {
  position: sticky;
  top: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 0 28px;
  background: rgba(11, 14, 20, 0.82);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--cs2-border);
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  white-space: nowrap;
}

.brand-text {
  display: flex;
  flex-direction: column;
  line-height: 1.3;
}

.brand-name {
  font-size: 16px;
  font-weight: 800;
  letter-spacing: 2px;
  background: linear-gradient(120deg, #fff, var(--cs2-accent));
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}

.brand-sub {
  font-size: 10px;
  letter-spacing: 3px;
  color: var(--cs2-text-muted);
}

.demo-tag {
  --el-tag-bg-color: var(--cs2-accent-soft);
  --el-tag-border-color: rgba(255, 176, 32, 0.4);
  --el-tag-text-color: var(--cs2-accent);
}

.nav {
  flex: 1;
  border-bottom: none;
  --el-menu-bg-color: transparent;
  --el-menu-hover-bg-color: transparent;
  --el-menu-active-color: var(--cs2-accent);
  --el-menu-text-color: var(--cs2-text-muted);
  --el-menu-hover-text-color: var(--cs2-text);
}

.nav :deep(.el-menu-item) {
  border-bottom: none;
  font-weight: 600;
  letter-spacing: 1px;
}

.nav :deep(.el-sub-menu__title) {
  border-bottom: none;
  font-weight: 600;
  letter-spacing: 1px;
}

.nav :deep(.el-sub-menu.is-active > .el-sub-menu__title) {
  color: var(--cs2-accent);
}

.nav :deep(.el-sub-menu .el-sub-menu__title .el-icon) {
  color: inherit;
}

.nav :deep(.el-menu-item.is-active) {
  position: relative;
}

.nav :deep(.el-menu-item.is-active)::after {
  content: '';
  position: absolute;
  left: 16px;
  right: 16px;
  bottom: 0;
  height: 2px;
  background: linear-gradient(90deg, var(--cs2-accent), transparent);
}

.user-area {
  display: flex;
  align-items: center;
  gap: 12px;
  white-space: nowrap;
}

.admin-btn {
  --el-button-bg-color: var(--cs2-accent-soft);
  --el-button-border-color: rgba(255, 176, 32, 0.4);
  --el-button-text-color: var(--cs2-accent);
}

.login-btn {
  --el-button-bg-color: var(--cs2-accent);
  --el-button-border-color: var(--cs2-accent);
  --el-button-text-color: #14100a;
  font-weight: 700;
}

.username {
  cursor: pointer;
  color: var(--cs2-text-regular, #c6ccd8);
}

.main {
  flex: 1;
}

.footer {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--cs2-text-muted);
  font-size: 13px;
  letter-spacing: 1px;
  border-top: 1px solid var(--cs2-border);
}

.footer-line {
  width: 26px;
  height: 2px;
  background: var(--cs2-accent);
  opacity: 0.6;
}
</style>

<!-- 二级菜单弹出面板（渲染在 body，需全局样式） -->
<style>
.el-menu--popup {
  background: var(--cs2-panel) !important;
  border: 1px solid var(--cs2-border) !important;
  border-radius: 8px;
  padding: 4px !important;
  min-width: 140px;
}

.el-menu--popup .el-menu-item {
  background: transparent;
  color: var(--cs2-text-muted);
  border-radius: 6px;
  font-weight: 600;
  letter-spacing: 1px;
}

.el-menu--popup .el-menu-item:hover {
  background: var(--cs2-panel-2) !important;
  color: var(--cs2-text);
}

.el-menu--popup .el-menu-item.is-active {
  color: var(--cs2-accent);
}

/* ---------- 移动端适配 ---------- */
@media (max-width: 768px) {
  .header {
    padding: 0 12px;
    gap: 10px;
  }

  .brand-text .brand-sub {
    display: none;
  }

  .brand-name {
    font-size: 14px;
  }

  /* 导航：横向可滑动（隐藏滚动条），保留全部入口 */
  .nav {
    overflow-x: auto;
    scrollbar-width: none;
    -ms-overflow-style: none;
  }
  .nav::-webkit-scrollbar {
    display: none;
  }
  .nav :deep(.el-menu-item),
  .nav :deep(.el-sub-menu__title) {
    padding: 0 12px;
    font-size: 13px;
  }

  .user-area {
    gap: 8px;
  }

  .admin-btn {
    padding: 4px 8px;
    font-size: 12px;
  }

  .username {
    max-width: 80px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px;
  }
}
</style>
