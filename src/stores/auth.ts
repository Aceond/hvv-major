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
  role: 'admin' | 'player' | null
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const profile = ref<Profile | null>(null)
  const loading = ref(false)
  // 个人注册申请审核状态（pending/approved/rejected，null = 未提交申请）
  const applicationStatus = ref<ApplicationStatus | null>(null)

  const isLoggedIn = computed(() => user.value !== null)
  const isAdmin = computed(() => profile.value?.role === 'admin')
  // 账号是否被审核拦截（待审核 / 被拒）
  const reviewBlocked = computed(
    () => isLoggedIn.value && !isAdmin.value && (applicationStatus.value === 'pending' || applicationStatus.value === 'rejected'),
  )

  /** 拉取当前用户最新一条注册申请的审核状态 */
  async function loadApplicationStatus() {
    applicationStatus.value = null
    if (!isSupabaseConfigured || !supabase) return
    const {
      data: { user: u },
    } = await supabase.auth.getUser()
    if (!u) return
    const { data } = await supabase
      .from('player_applications')
      .select('status')
      .eq('profile_id', u.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    applicationStatus.value = (data?.status as ApplicationStatus | undefined) ?? null
  }

  /** 拉取当前登录用户及其资料（演示模式下跳过） */
  async function refresh() {
    if (!isSupabaseConfigured || !supabase) return
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
        await loadApplicationStatus()
      } else {
        profile.value = null
        applicationStatus.value = null
      }
    } finally {
      loading.value = false
    }
  }

  /** 演示模式登录：未配置 Supabase 时以本地身份进入，便于预览页面 */
  async function demoLogin(role: 'admin' | 'player') {
    user.value = {
      id: `demo-${role}`,
      email: `demo-${role}@hvv-major.local`,
      user_metadata: {},
      app_metadata: {},
      aud: 'authenticated',
      created_at: new Date().toISOString(),
    } as User
    profile.value = {
      id: `demo-${role}`,
      username: role === 'admin' ? '演示管理员' : '演示选手',
      nickname: role === 'admin' ? 'KillerAce' : '炎龙',
      pw_username: role === 'admin' ? 'killerace' : 'yanlong',
      role,
    }
    // 演示选手视为已通过审核，演示管理员不受审核限制
    applicationStatus.value = role === 'admin' ? null : 'approved'
  }

  async function signOut() {
    if (supabase) await supabase.auth.signOut()
    user.value = null
    profile.value = null
    applicationStatus.value = null
  }

  return {
    user,
    profile,
    loading,
    applicationStatus,
    isLoggedIn,
    isAdmin,
    reviewBlocked,
    refresh,
    loadApplicationStatus,
    demoLogin,
    signOut,
  }
})
