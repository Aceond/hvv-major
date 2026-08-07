import { createRouter, createWebHistory } from 'vue-router'
import DefaultLayout from '@/layouts/DefaultLayout.vue'
import AdminLayout from '@/layouts/AdminLayout.vue'
import { useAuthStore } from '@/stores/auth'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      component: DefaultLayout,
      children: [
        { path: '', name: 'home', component: () => import('@/views/Home.vue') },
        { path: 'events', name: 'events', component: () => import('@/views/Events.vue') },
        { path: 'player/register', name: 'player-register', component: () => import('@/views/PlayerRegister.vue') },
        { path: 'register', name: 'register', component: () => import('@/views/Register.vue') },
        { path: 'matches', name: 'matches', component: () => import('@/views/Matches.vue') },
        { path: 'booking', name: 'booking', component: () => import('@/views/Booking.vue') },
        { path: 'standings', name: 'standings', component: () => import('@/views/Standings.vue') },
        { path: 'rankings', name: 'rankings', component: () => import('@/views/Rankings.vue') },
        { path: 'profile', name: 'profile', component: () => import('@/views/Profile.vue') },
        { path: 'login', name: 'login', component: () => import('@/views/Login.vue') },
      ],
    },
    {
      path: '/admin',
      component: AdminLayout,
      meta: { requiresAdmin: true },
      children: [
        { path: '', name: 'admin-dashboard', component: () => import('@/views/admin/Dashboard.vue') },
        { path: 'events', name: 'admin-events', component: () => import('@/views/admin/Events.vue') },
        { path: 'players', name: 'admin-players', component: () => import('@/views/admin/Players.vue') },
        { path: 'teams', name: 'admin-teams', component: () => import('@/views/admin/Teams.vue') },
        { path: 'matches', name: 'admin-matches', component: () => import('@/views/admin/Matches.vue') },
        { path: 'stats', name: 'admin-stats', component: () => import('@/views/admin/Stats.vue') },
        { path: 'settings', name: 'admin-settings', component: () => import('@/views/admin/Settings.vue') },
      ],
    },
    // 重置密码落地页（邮件链接进入，独立页面不带导航）
    { path: '/reset-password', name: 'reset-password', component: () => import('@/views/ResetPassword.vue') },
    { path: '/:pathMatch(.*)*', redirect: { name: 'home' } },
  ],
})

// 路由守卫：进入 /admin 前校验管理员角色
router.beforeEach(async (to) => {
  const auth = useAuthStore()
  if (!auth.isLoggedIn) await auth.refresh()
  if (to.meta.requiresAdmin && !auth.isAdmin) {
    return { name: 'home' }
  }
})

export default router
