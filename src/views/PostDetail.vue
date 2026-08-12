<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useAuthStore } from '@/stores/auth'
import { formatDateTime } from '@/utils/format'
import {
  createForumComment,
  deleteCommentAdmin,
  deletePostAdmin,
  favoritePost,
  getForumPost,
  likePost,
  listForumComments,
  myForumMarks,
  unfavoritePost,
  unlikePost,
  updatePostAdmin,
  type ForumComment,
  type ForumPost,
} from '@/api/forum'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const post = ref<ForumPost | null>(null)
const comments = ref<ForumComment[]>([])
const liked = ref(false)
const favored = ref(false)
const loading = ref(false)
const submitting = ref(false)
const commentText = ref('')

const postId = computed(() => String(route.params.id ?? ''))

function authorName(a?: { username: string | null; nickname: string | null } | null): string {
  return a?.nickname || a?.username || '匿名'
}

async function load() {
  loading.value = true
  try {
    post.value = await getForumPost(postId.value)
    if (!post.value) {
      ElMessage.error('帖子不存在或已被删除')
      router.replace({ name: 'forum' })
      return
    }
    comments.value = await listForumComments(postId.value)
    const marks = await myForumMarks()
    liked.value = marks.liked.has(postId.value)
    favored.value = marks.favored.has(postId.value)
  } finally {
    loading.value = false
  }
}

function back() {
  router.push({ name: 'forum' })
}

// ---------------- 点赞 / 收藏 ----------------
async function toggleLike() {
  if (!auth.isLoggedIn) {
    ElMessage.warning('请先登录后点赞')
    return
  }
  if (!post.value) return
  try {
    if (liked.value) {
      await unlikePost(post.value.id)
      post.value.like_count = Math.max(0, (post.value.like_count ?? 0) - 1)
      liked.value = false
    } else {
      await likePost(post.value.id)
      post.value.like_count = (post.value.like_count ?? 0) + 1
      liked.value = true
    }
  } catch (e: any) {
    ElMessage.error(e.message || '操作失败')
  }
}

async function toggleFavorite() {
  if (!auth.isLoggedIn) {
    ElMessage.warning('请先登录后收藏')
    return
  }
  if (!post.value) return
  try {
    if (favored.value) {
      await unfavoritePost(post.value.id)
      favored.value = false
    } else {
      await favoritePost(post.value.id)
      favored.value = true
    }
  } catch (e: any) {
    ElMessage.error(e.message || '操作失败')
  }
}

// ---------------- 回帖 ----------------
async function submitComment() {
  if (!auth.isLoggedIn) {
    ElMessage.warning('请先登录后回帖')
    return
  }
  if (auth.reviewBlocked) {
    ElMessage.warning('账号审核通过后才能回帖')
    return
  }
  if (!commentText.value.trim()) {
    ElMessage.warning('请输入回帖内容')
    return
  }
  submitting.value = true
  try {
    await createForumComment(postId.value, commentText.value)
    ElMessage.success('回帖成功')
    commentText.value = ''
    await load()
  } catch (e: any) {
    ElMessage.error(e.message || '回帖失败')
  } finally {
    submitting.value = false
  }
}

// ---------------- 管理员操作 ----------------
async function togglePin() {
  if (!post.value) return
  try {
    await updatePostAdmin(post.value.id, { pinned: !post.value.pinned })
    post.value.pinned = !post.value.pinned
    ElMessage.success(post.value.pinned ? '已置顶' : '已取消置顶')
  } catch (e: any) {
    ElMessage.error(e.message || '操作失败')
  }
}

async function toggleFeatured() {
  if (!post.value) return
  try {
    await updatePostAdmin(post.value.id, { featured: !post.value.featured })
    post.value.featured = !post.value.featured
    ElMessage.success(post.value.featured ? '已加精' : '已取消加精')
  } catch (e: any) {
    ElMessage.error(e.message || '操作失败')
  }
}

async function removePost() {
  if (!post.value) return
  try {
    await ElMessageBox.confirm(`确认删除帖子「${post.value.title}」吗？删除后不可恢复。`, '删除帖子', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }
  try {
    await deletePostAdmin(post.value.id)
    ElMessage.success('已删除')
    router.replace({ name: 'forum' })
  } catch (e: any) {
    ElMessage.error(e.message || '删除失败')
  }
}

async function removeComment(c: ForumComment) {
  try {
    await ElMessageBox.confirm('确认删除该回帖吗？', '删除回帖', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }
  try {
    await deleteCommentAdmin(c.id)
    ElMessage.success('已删除回帖')
    await load()
  } catch (e: any) {
    ElMessage.error(e.message || '删除失败')
  }
}

onMounted(load)
</script>

<template>
  <div class="page-container detail-page" v-loading="loading">
    <template v-if="post">
      <div class="detail-head">
        <el-button link class="back-btn" @click="back">← 返回论坛</el-button>
        <div class="head-tags">
          <el-tag v-if="post.pinned" size="small" type="danger" effect="dark">置顶</el-tag>
          <el-tag v-if="post.featured" size="small" type="warning" effect="dark">加精</el-tag>
          <el-tag v-if="post.section_name" size="small" effect="plain">{{ post.section_name }}</el-tag>
        </div>
        <h2 class="post-title">{{ post.title }}</h2>
        <div class="post-meta">
          <span class="author">{{ authorName(post.author) }}</span>
          <span class="time">{{ formatDateTime(post.created_at) }}</span>
        </div>
      </div>

      <div class="post-content">{{ post.content }}</div>

      <!-- 操作栏 -->
      <div class="action-bar">
        <el-button :type="liked ? 'primary' : 'default'" plain round @click="toggleLike">
          {{ liked ? '已点赞' : '点赞' }} {{ post.like_count }}
        </el-button>
        <el-button :type="favored ? 'warning' : 'default'" plain round @click="toggleFavorite">
          {{ favored ? '已收藏' : '收藏' }}
        </el-button>
        <div v-if="auth.isAdmin" class="admin-ops">
          <el-button size="small" text :type="post.pinned ? 'danger' : ''" @click="togglePin">
            {{ post.pinned ? '取消置顶' : '置顶' }}
          </el-button>
          <el-button size="small" text :type="post.featured ? 'warning' : ''" @click="toggleFeatured">
            {{ post.featured ? '取消加精' : '加精' }}
          </el-button>
          <el-button size="small" text type="danger" @click="removePost">删除帖子</el-button>
        </div>
      </div>

      <!-- 回帖 -->
      <div class="comments">
        <h3 class="comments-title">全部回帖（{{ comments.length }}）</h3>
        <el-empty v-if="comments.length === 0" description="暂无回帖，来抢沙发" :image-size="60" />
        <div v-for="c in comments" :key="c.id" class="comment-item">
          <div class="comment-body">
            <div class="comment-meta">
              <span class="comment-author">{{ authorName(c.author) }}</span>
              <span class="comment-time">{{ formatDateTime(c.created_at) }}</span>
            </div>
            <div class="comment-content">{{ c.content }}</div>
          </div>
          <el-button
            v-if="auth.isAdmin"
            link
            type="danger"
            size="small"
            class="comment-del"
            @click="removeComment(c)"
          >
            删除
          </el-button>
        </div>
      </div>

      <!-- 回帖输入 -->
      <div class="reply-box">
        <el-alert
          v-if="!auth.isLoggedIn"
          type="warning"
          :closable="false"
          title="登录后即可回帖"
          class="reply-hint"
        />
        <el-alert
          v-else-if="auth.reviewBlocked"
          type="warning"
          :closable="false"
          title="账号审核通过后才能回帖"
          class="reply-hint"
        />
        <template v-else>
          <el-input
            v-model="commentText"
            type="textarea"
            :rows="3"
            maxlength="1000"
            show-word-limit
            placeholder="写下你的回复…"
          />
          <div class="reply-actions">
            <el-button type="primary" :loading="submitting" @click="submitComment">发表回帖</el-button>
          </div>
        </template>
      </div>
    </template>
  </div>
</template>

<style scoped>
.detail-page {
  max-width: 820px;
  margin: 0 auto;
}

.back-btn {
  color: var(--cs2-text-muted);
  margin-bottom: 8px;
}

.head-tags {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
}

.post-title {
  margin: 0 0 10px;
  font-size: 22px;
  font-weight: 800;
  line-height: 1.4;
  word-break: break-word;
}

.post-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 13px;
  color: var(--cs2-text-muted);
  margin-bottom: 16px;
}

.author {
  color: var(--cs2-accent);
  font-weight: 600;
}

.post-content {
  padding: 18px 20px;
  background: var(--cs2-panel);
  border: 1px solid var(--cs2-border);
  border-radius: 10px;
  line-height: 1.8;
  color: var(--cs2-text);
  white-space: pre-wrap;
  word-break: break-word;
  margin-bottom: 14px;
}

.action-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 24px;
}

.admin-ops {
  margin-left: auto;
  display: inline-flex;
  gap: 2px;
}

.comments-title {
  font-size: 15px;
  font-weight: 700;
  margin: 0 0 12px;
}

.comment-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 14px;
  margin-bottom: 8px;
  background: var(--cs2-panel);
  border: 1px solid var(--cs2-border);
  border-radius: 8px;
}

.comment-body {
  flex: 1;
  min-width: 0;
}

.comment-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
}

.comment-author {
  font-size: 13px;
  font-weight: 700;
  color: var(--cs2-accent);
}

.comment-time {
  font-size: 12px;
  color: var(--cs2-text-muted);
}

.comment-content {
  font-size: 14px;
  line-height: 1.7;
  color: var(--cs2-text-regular, #c6ccd8);
  white-space: pre-wrap;
  word-break: break-word;
}

.comment-del {
  flex-shrink: 0;
}

.reply-box {
  margin-top: 20px;
  padding: 16px;
  background: var(--cs2-panel);
  border: 1px solid var(--cs2-border);
  border-radius: 10px;
}

.reply-hint {
  margin-bottom: 0;
}

.reply-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 10px;
}
</style>
