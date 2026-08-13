// 论坛数据访问层：版块 / 帖子 / 回帖 / 点赞 / 收藏
// 发帖回帖仅限审核通过账号（RLS：can_post_forum）；点赞收藏走 RPC 保证计数原子性。
// 未配置 Supabase（演示模式）时返回 mock 数据。
import { supabase, isSupabaseConfigured } from '@/lib/supabase'

export interface ForumSection {
  id: string
  name: string
  description: string | null
  sort_order: number
  post_count: number
}

export type ForumPostStatus = 'visible' | 'hidden'

export interface ForumPost {
  id: string
  section_id: string
  author_id: string
  title: string
  content: string
  status: ForumPostStatus
  pinned: boolean
  featured: boolean
  like_count: number
  comment_count: number
  created_at: string
  updated_at: string
  author?: { username: string | null; nickname: string | null } | null
  section_name?: string | null
}

export interface ForumComment {
  id: string
  post_id: string
  author_id: string
  content: string
  status: 'visible' | 'hidden'
  created_at: string
  author?: { username: string | null; nickname: string | null } | null
}

export interface CreatePostInput {
  section_id: string
  title: string
  content: string
}

// ---------------- 演示模式 mock ----------------
const mockSections: ForumSection[] = [
  { id: 'fs-1', name: '赛事讨论', description: '赛程、比赛结果、赛事资讯讨论', sort_order: 1, post_count: 1 },
  { id: 'fs-2', name: '战队交流', description: '战队招募、组队、队员交流', sort_order: 2, post_count: 0 },
  { id: 'fs-3', name: '闲聊灌水', description: '日常闲聊、灌水区', sort_order: 3, post_count: 0 },
]

let mockPosts: ForumPost[] = [
  {
    id: 'fp-1',
    section_id: 'fs-1',
    author_id: 'demo-admin',
    title: '大师组淘汰赛对阵已公布',
    content: '大师组 8 强淘汰赛对阵已经由系统按排位赛成绩自动生成，大家可以去赛程页查看。',
    status: 'visible',
    pinned: true,
    featured: true,
    like_count: 3,
    comment_count: 1,
    created_at: '2026-08-11 20:00:00',
    updated_at: '2026-08-11 20:00:00',
    author: { username: '演示管理员', nickname: 'KillerAce' },
    section_name: '赛事讨论',
  },
]

let mockComments: ForumComment[] = [
  {
    id: 'fc-1',
    post_id: 'fp-1',
    author_id: 'demo-player',
    content: '收到，明天去看对阵！',
    status: 'visible',
    created_at: '2026-08-11 20:30:00',
    author: { username: '演示选手', nickname: '炎龙' },
  },
]

// 演示模式下已登录用户固定为 demo-player（发帖/回帖/点赞收藏）
const DEMO_UID = 'demo-player'
let mockIdSeq = 100
const mockUid = () => `demo-${Date.now()}-${mockIdSeq++}`
const mockTime = () => {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 真实环境获取当前登录用户 ID（未登录返回 null） */
async function currentUserId(): Promise<string | null> {
  if (!isSupabaseConfigured || !supabase) return DEMO_UID
  const { data } = await supabase.auth.getUser()
  return data.user?.id ?? null
}

/** 演示模式下查找作者资料 */
function mockAuthor(id: string): { username: string | null; nickname: string | null } {
  if (id === 'demo-admin') return { username: '演示管理员', nickname: 'KillerAce' }
  return { username: '演示选手', nickname: '炎龙' }
}

// ---------------- 版块 ----------------
export async function listForumSections(): Promise<ForumSection[]> {
  if (!isSupabaseConfigured || !supabase) return [...mockSections]
  const { data } = await supabase.from('forum_sections').select('*').order('sort_order')
  return (data as ForumSection[]) ?? []
}

// ---------------- 帖子 ----------------
export async function listForumPosts(params?: {
  sectionId?: string
  keyword?: string
}): Promise<ForumPost[]> {
  if (!isSupabaseConfigured || !supabase) {
    let list = [...mockPosts]
    if (params?.sectionId) list = list.filter((p) => p.section_id === params.sectionId)
    if (params?.keyword) {
      const kw = params.keyword.trim().toLowerCase()
      list = list.filter(
        (p) => p.title.toLowerCase().includes(kw) || p.content.toLowerCase().includes(kw),
      )
    }
    return list.sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.created_at.localeCompare(a.created_at))
  }
  let q = supabase
    .from('forum_posts')
    .select('*, author:profiles!forum_posts_author_id_fkey(username, nickname), section:forum_sections!forum_posts_section_id_fkey(name)')
  if (params?.sectionId) q = q.eq('section_id', params.sectionId)
  if (params?.keyword) {
    const kw = `%${params.keyword.trim()}%`
    q = q.or(`title.ilike.${kw},content.ilike.${kw}`)
  }
  q = q.order('pinned', { ascending: false }).order('created_at', { ascending: false })
  const { data } = await q
  return ((data as ForumPost[]) ?? []).map((p) => ({
    ...p,
    section_name: (p as unknown as { section?: { name: string } | null }).section?.name ?? null,
    author: p.author ?? null,
  }))
}

export async function getForumPost(id: string): Promise<ForumPost | null> {
  if (!isSupabaseConfigured || !supabase) {
    return mockPosts.find((p) => p.id === id) ?? null
  }
  const { data } = await supabase
    .from('forum_posts')
    .select('*, author:profiles!forum_posts_author_id_fkey(username, nickname), section:forum_sections!forum_posts_section_id_fkey(name)')
    .eq('id', id)
    .maybeSingle()
  if (!data) return null
  return {
    ...(data as ForumPost),
    section_name: (data as unknown as { section?: { name: string } | null }).section?.name ?? null,
    author: (data as ForumPost).author ?? null,
  }
}

export async function createForumPost(input: CreatePostInput): Promise<ForumPost> {
  const uid = await currentUserId()
  if (!uid) throw new Error('请先登录')
  if (!input.title.trim()) throw new Error('请填写帖子标题')
  if (!input.content.trim()) throw new Error('请填写帖子内容')
  if (!isSupabaseConfigured || !supabase) {
    const post: ForumPost = {
      id: mockUid(),
      section_id: input.section_id,
      author_id: DEMO_UID,
      title: input.title.trim(),
      content: input.content.trim(),
      status: 'visible',
      pinned: false,
      featured: false,
      like_count: 0,
      comment_count: 0,
      created_at: mockTime(),
      updated_at: mockTime(),
      author: mockAuthor(DEMO_UID),
      section_name: mockSections.find((s) => s.id === input.section_id)?.name ?? null,
    }
    mockPosts.push(post)
    return post
  }
  const { data, error } = await supabase
    .from('forum_posts')
    .insert({
      section_id: input.section_id,
      author_id: uid,
      title: input.title.trim(),
      content: input.content.trim(),
    })
    .select()
    .single()
  if (error) throw new Error(friendlyError(error.message))
  return data as ForumPost
}

/** 管理员更新帖子（置顶 / 加精 / 隐藏） */
export async function updatePostAdmin(id: string, patch: Partial<ForumPost>): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    const p = mockPosts.find((x) => x.id === id)
    if (p) Object.assign(p, patch)
    return
  }
  const { error } = await supabase.from('forum_posts').update(patch).eq('id', id)
  if (error) throw new Error(friendlyError(error.message))
}

/** 管理员删除帖子 */
export async function deletePostAdmin(id: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    mockPosts = mockPosts.filter((p) => p.id !== id)
    return
  }
  const { error } = await supabase.from('forum_posts').delete().eq('id', id)
  if (error) throw new Error(friendlyError(error.message))
}

// ---------------- 回帖 ----------------
export async function listForumComments(postId: string): Promise<ForumComment[]> {
  if (!isSupabaseConfigured || !supabase) {
    return mockComments
      .filter((c) => c.post_id === postId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
  }
  const { data } = await supabase
    .from('forum_comments')
    .select('*, author:profiles!forum_comments_author_id_fkey(username, nickname)')
    .eq('post_id', postId)
    .order('created_at')
  return ((data as ForumComment[]) ?? []).map((c) => ({ ...c, author: c.author ?? null }))
}

export async function createForumComment(postId: string, content: string): Promise<ForumComment> {
  const uid = await currentUserId()
  if (!uid) throw new Error('请先登录')
  if (!content.trim()) throw new Error('请填写回帖内容')
  if (!isSupabaseConfigured || !supabase) {
    const comment: ForumComment = {
      id: mockUid(),
      post_id: postId,
      author_id: DEMO_UID,
      content: content.trim(),
      status: 'visible',
      created_at: mockTime(),
      author: mockAuthor(DEMO_UID),
    }
    mockComments.push(comment)
    const p = mockPosts.find((x) => x.id === postId)
    if (p) p.comment_count += 1
    return comment
  }
  const { data, error } = await supabase
    .from('forum_comments')
    .insert({ post_id: postId, author_id: uid, content: content.trim() })
    .select('*, author:profiles!forum_comments_author_id_fkey(username, nickname)')
    .single()
  if (error) throw new Error(friendlyError(error.message))
  // 回帖计数由数据库触发器维护（trg_sync_comment_count），普通用户对 forum_posts 无 update 权限，
  // 前端不再手动 +1，避免被 RLS 静默拦截导致计数恒为 0
  return data as ForumComment
}

/** 管理员删除回帖 */
export async function deleteCommentAdmin(id: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    mockComments = mockComments.filter((c) => c.id !== id)
    return
  }
  const { error } = await supabase.from('forum_comments').delete().eq('id', id)
  if (error) throw new Error(friendlyError(error.message))
}

// ---------------- 点赞 / 收藏 ----------------
export async function likePost(postId: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    const p = mockPosts.find((x) => x.id === postId)
    if (p) p.like_count += 1
    return
  }
  const { error } = await supabase.rpc('forum_like', { p_post_id: postId })
  if (error) throw new Error(friendlyError(error.message))
}

export async function unlikePost(postId: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    const p = mockPosts.find((x) => x.id === postId)
    if (p) p.like_count = Math.max(0, p.like_count - 1)
    return
  }
  const { error } = await supabase.rpc('forum_unlike', { p_post_id: postId })
  if (error) throw new Error(friendlyError(error.message))
}

export async function favoritePost(postId: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return
  const { error } = await supabase.rpc('forum_favorite', { p_post_id: postId })
  if (error) throw new Error(friendlyError(error.message))
}

export async function unfavoritePost(postId: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return
  const { error } = await supabase.rpc('forum_unfavorite', { p_post_id: postId })
  if (error) throw new Error(friendlyError(error.message))
}

/** 当前用户已点赞 / 已收藏的帖子 ID 集合 */
export async function myForumMarks(): Promise<{ liked: Set<string>; favored: Set<string> }> {
  const liked = new Set<string>()
  const favored = new Set<string>()
  const uid = await currentUserId()
  if (!uid || !isSupabaseConfigured || !supabase) return { liked, favored }
  const [likeRes, favRes] = await Promise.all([
    supabase.from('forum_likes').select('post_id').eq('user_id', uid),
    supabase.from('forum_favorites').select('post_id').eq('user_id', uid),
  ])
  for (const r of (likeRes.data as { post_id: string }[] | null) ?? []) liked.add(r.post_id)
  for (const r of (favRes.data as { post_id: string }[] | null) ?? []) favored.add(r.post_id)
  return { liked, favored }
}

/** 数据库错误消息转友好提示 */
function friendlyError(msg: string): string {
  const m = msg.toLowerCase()
  if (/cannot be null|violates not-null|invalid input value|new row violates/.test(m)) return '提交失败：请检查填写内容是否完整'
  if (/foreign key|not present in table|invalid input syntax/.test(m)) return '提交失败：数据关联校验未通过'
  if (/permission denied|violates row-level security/.test(m)) return '权限不足：请确认账号已通过审核'
  if (/duplicate key|already exists/.test(m)) return '重复操作，请刷新后重试'
  return msg
}
