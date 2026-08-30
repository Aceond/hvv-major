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
        { path: 'my-team', name: 'my-team', component: () => import('@/views/MyTeam.vue') },
        { path: 'bet', name: 'bet', component: () => import('@/views/Bet.vue') },
        { path: 'forum', name: 'forum', component: () => import('@/views/Forum.vue') },
        { path: 'forum/:id', name: 'post-detail', component: () => import('@/views/PostDetail.vue') },
        { path: 'matches', name: 'matches', component: () => import('@/views/Matches.vue') },
        { path: 'booking', name: 'booking', component: () => import('@/views/Booking.vue') },
        { path: 'standings', name: 'standings', component: () => import('@/views/Standings.vue') },
        { path: 'rankings', name: 'rankings', component: () => import('@/views/Rankings.vue') },
        { path: 'profile', name: 'profile', component: () => import('@/views/Profile.vue') },
        { path: 'login', name: 'login', component: () => import('@/views/Login.vue') },
        { path: 'review-status', name: 'review-status', component: () => import('@/views/AuditStatus.vue') },
      ],
    },
    {
      path: '/admin',
      component: AdminLayout,
      meta: { requiresAdmin: true },
      children: [
        { path: '', name: 'admin-dashboard', component: () => import('@/views/admin/Dashboard.vue') },
        { path: 'events', name: 'admin-events', component: () => import('@/views/admin/Events.vue') },
        { path: 'champions', name: 'admin-champions', component: () => import('@/views/admin/Champions.vue') },
        { path: 'accounts', name: 'admin-accounts', component: () => import('@/views/admin/Accounts.vue') },
        { path: 'players', name: 'admin-players', component: () => import('@/views/admin/Players.vue') },
        { path: 'teams', name: 'admin-teams', component: () => import('@/views/admin/Teams.vue') },
        { path: 'matches', name: 'admin-matches', component: () => import('@/views/admin/Matches.vue') },
        { path: 'stats', name: 'admin-stats', component: () => import('@/views/admin/Stats.vue') },
        { path: 'bets', name: 'admin-bets', component: () => import('@/views/admin/Bets.vue') },
        { path: 'settings', name: 'admin-settings', component: () => import('@/views/admin/Settings.vue') },
      ],
    },
    // 重置密码落地页（邮件链接进入，独立页面不带导航）
    { path: '/reset-password', name: 'reset-password', component: () => import('@/views/ResetPassword.vue') },
    { path: '/:pathMatch(.*)*', redirect: { name: 'home' } },
  ],
})

// 待审核/被拒账号仅可访问的页面白名单（公开浏览 + 审核状态提示页 + 两个报名入口，否则新注册用户永远报不了名）
const REVIEW_OPEN_PAGES = ['home', 'events', 'matches', 'standings', 'rankings', 'review-status', 'login', 'player-register', 'register', 'my-team', 'forum', 'post-detail']
// 需登录才能使用的页面（未登录 / 游客一律跳转登录页，权限与游客一致）
const AUTH_PAGES = ['booking', 'profile', 'player-register', 'register', 'my-team', 'bet']

/** 给 Promise 加超时竞速：超过 timeoutMs 直接放行，避免导航被挂起的请求无限阻塞 */
function withTimeout<T>(p: Promise<T>, timeoutMs: number): Promise<T | undefined> {
  return Promise.race([
    p,
    new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), timeoutMs)),
  ])
}

// 路由守卫：进入 /admin 前校验管理员角色；未登录/游客只能浏览公开页面；未过审账号仅开放白名单页面
router.beforeEach(async (to) => {
  const auth = useAuthStore()
  if (!auth.isLoggedIn) await withTimeout(auth.refresh(), 3000)
  if (to.meta.requiresAdmin && !auth.isAdmin) {
    return { name: 'home' }
  }
  if ((!auth.isLoggedIn || auth.isGuest) && AUTH_PAGES.includes(to.name as string)) {
    return { name: 'login' }
  }
  if (auth.reviewBlocked && !REVIEW_OPEN_PAGES.includes(to.name as string)) {
    return { name: 'home' }
  }
})

export default router
