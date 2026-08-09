import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { User } from '@supabase/supabase-js'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import type { ApplicationStatus } from '@/api/types'

export interface Profile {
  id: string
  username: string | null
  nickname: string | null
  pw_username: string | null
  role: 'admin' | 'caster' | 'player' | null
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const profile = ref<Profile | null>(null)
  const loading = ref(false)
  // 账号人工审核状态（pending/approved/rejected，读 profiles.account_status）
  const accountStatus = ref<ApplicationStatus | null>(null)
  // 游客浏览模式：无需注册/登录直接浏览公开内容，可刷新被清除（临时身份）
  const guestMode = ref(false)

  const isLoggedIn = computed(() => user.value !== null)
  const isAdmin = computed(() => profile.value?.role === 'admin')
  const isCaster = computed(() => profile.value?.role === 'caster')
  const isGuest = computed(() => guestMode.value)

  // 账号是否被审核拦截（待审核 / 被拒的新账号；管理员与已通过账号不受限）
  const reviewBlocked = computed(
    () => isLoggedIn.value && !isAdmin.value && (accountStatus.value === 'pending' || accountStatus.value === 'rejected'),
  )

  /** 拉取当前用户账号的审核状态（profiles.account_status） */
  async function loadAccountStatus() {
    accountStatus.value = null
    if (!isSupabaseConfigured || !supabase) return
    const {
      data: { user: u },
    } = await supabase.auth.getUser()
    if (!u) return
    const { data } = await supabase
      .from('profiles')
      .select('account_status')
      .eq('id', u.id)
      .maybeSingle()
    accountStatus.value = (data?.account_status as ApplicationStatus | undefined) ?? null
  }

  /** 拉取当前登录用户及其资料（演示模式下跳过） */
  async function refresh() {
    if (!isSupabaseConfigured || !supabase) return
    if (guestMode.value) return // 游客身份是临时的，不重复拉取真实会话
    loading.value = true
    try {
      const { data } = await supabase.auth.getUser()
      user.value = data.user ?? null
      if (data.user) {
        const { data: p } = await supabase
          .from('profiles')
          .select('id, username, nickname, pw_username, role')
          .eq('id', data.user.id)
          .maybeSingle()
        profile.value = (p as Profile | null) ?? null
        await loadAccountStatus()
      } else {
        profile.value = null
        accountStatus.value = null
      }
    } finally {
      loading.value = false
    }
  }

  /** 演示模式登录：未配置 Supabase 时以本地身份进入，便于预览页面 */
  async function demoLogin(role: 'admin' | 'caster' | 'player' | 'captain') {
    const DEMO_PROFILE: Record<string, { username: string; nickname: string; pw: string; status: ApplicationStatus | null }> = {
      admin: { username: '演示管理员', nickname: 'KillerAce', pw: 'killerace', status: null },
      caster: { username: '演示解说', nickname: '赛事解说', pw: 'castor2026', status: 'approved' },
      player: { username: '演示选手', nickname: '炎龙', pw: 'yanlong', status: 'approved' },
      // 演示队长：固定绑定「烈焰竞技」战队（mock team-13，队长账号 demo-captain），可体验约战/比分/队员数据录入
      captain: { username: '演示队长', nickname: '演示队长', pw: 'demo_captain', status: 'approved' },
    }
    const d = DEMO_PROFILE[role]
    const isCaptain = role === 'captain'
    user.value = {
      id: isCaptain ? 'demo-captain' : `demo-${role}`,
      email: isCaptain ? 'demo-captain@hvv-major.local' : `demo-${role}@hvv-major.local`,
      user_metadata: {},
      app_metadata: {},
      aud: 'authenticated',
      created_at: new Date().toISOString(),
    } as User
    profile.value = {
      id: isCaptain ? 'demo-captain' : `demo-${role}`,
      username: d.username,
      nickname: d.nickname,
      pw_username: d.pw,
      role: isCaptain ? 'player' : role, // 队长本质是选手角色 + 拥有战队
    }
    // 演示解说/选手/队长视为已通过审核，演示管理员不受审核限制
    accountStatus.value = d.status
  }

  /** 游客登录：无需注册，以临时游客身份浏览公开内容（约战/个人中心等需登录的功能不可用） */
  async function guestLogin() {
    guestMode.value = true
    user.value = {
      id: 'guest',
      email: 'guest@hvv-major.local',
      user_metadata: {},
      app_metadata: {},
      aud: 'authenticated',
      created_at: new Date().toISOString(),
    } as User
    profile.value = {
      id: 'guest',
      username: '游客',
      nickname: null,
      pw_username: null,
      role: null,
    }
    accountStatus.value = null
  }

  async function signOut() {
    if (supabase) await supabase.auth.signOut()
    user.value = null
    profile.value = null
    accountStatus.value = null
    guestMode.value = false
  }

  return {
    user,
    profile,
    loading,
    accountStatus,
    isLoggedIn,
    isAdmin,
    isCaster,
    isGuest,
    reviewBlocked,
    refresh,
    loadAccountStatus,
    demoLogin,
    guestLogin,
    signOut,
  }
})
