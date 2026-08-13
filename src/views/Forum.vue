<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useAuthStore } from '@/stores/auth'
import { formatDateTime } from '@/utils/format'
import {
  createForumPost,
  deletePostAdmin,
  listFavoritedPosts,
  listForumPosts,
  listForumSections,
  myForumMarks,
  updatePostAdmin,
  type ForumPost,
  type ForumSection,
} from '@/api/forum'

const router = useRouter()
const auth = useAuthStore()

const sections = ref<ForumSection[]>([])
const posts = ref<ForumPost[]>([])
const loading = ref(false)
const currentSection = ref('')
const keyword = ref('')
const viewMode = ref<'list' | 'favorites'>('list')

// 我是否已点赞 / 收藏（用于列表展示，不涉及操作则仅作备用）
const likedSet = ref<Set<string>>(new Set())
const favoredSet = ref<Set<string>>(new Set())

/** 是否有发帖权限（登录且审核通过） */
const canPost = computed(
  () => auth.isLoggedIn && !auth.isGuest && !auth.reviewBlocked,
)

const canPostHint = computed(() => {
  if (!auth.isLoggedIn) return '登录后即可发帖'
  if (auth.reviewBlocked) return '账号审核通过后才能发帖'
  return ''
})

/** 帖子作者显示名（昵称优先，其次用户名） */
function authorName(p: ForumPost): string {
  return p.author?.nickname || p.author?.username || '匿名'
}

async function load() {
  loading.value = true
  try {
    sections.value = await listForumSections()
    // 「全部」用空字符串表示，是合法选择；仅当选中了不存在的版块时才回退到第一个版块
    if (
      currentSection.value !== '' &&
      !sections.value.some((s) => s.id === currentSection.value)
    ) {
      currentSection.value = sections.value[0]?.id ?? ''
    }
    if (viewMode.value === 'favorites') {
      posts.value = await listFavoritedPosts()
    } else {
      posts.value = await listForumPosts({
        sectionId: currentSection.value || undefined,
        keyword: keyword.value || undefined,
      })
    }
    const marks = await myForumMarks()
    likedSet.value = marks.liked
    favoredSet.value = marks.favored
  } finally {
    loading.value = false
  }
}

async function onSectionChange() {
  viewMode.value = 'list'
  await load()
}

async function onSearch() {
  await load()
}

function toggleFavorites() {
  if (viewMode.value === 'favorites') {
    viewMode.value = 'list'
  } else {
    if (!auth.isLoggedIn) {
      ElMessage.warning('请先登录后查看收藏')
      return
    }
    viewMode.value = 'favorites'
  }
  load()
}

function openPost(p: ForumPost) {
  router.push({ name: 'post-detail', params: { id: p.id } })
}

// ---------------- 发帖 ----------------
const postDialog = ref(false)
const submitting = ref(false)
const postForm = reactive({ sectionId: '', title: '', content: '' })

function openPostDialog() {
  if (!auth.isLoggedIn) {
    ElMessage.warning('请先登录后再发帖')
    return
  }
  if (auth.reviewBlocked) {
    ElMessage.warning('账号审核通过后才能发帖')
    return
  }
  postForm.sectionId = currentSection.value || sections.value[0]?.id || ''
  postForm.title = ''
  postForm.content = ''
  postDialog.value = true
}

async function submitPost() {
  if (!postForm.title.trim() || !postForm.content.trim()) {
    ElMessage.warning('请填写标题和内容')
    return
  }
  submitting.value = true
  try {
    await createForumPost({
      section_id: postForm.sectionId,
      title: postForm.title,
      content: postForm.content,
    })
    ElMessage.success('发帖成功')
    postDialog.value = false
    currentSection.value = postForm.sectionId
    await load()
  } catch (e: any) {
    ElMessage.error(e.message || '发帖失败')
  } finally {
    submitting.value = false
  }
}

// ---------------- 管理员操作 ----------------
async function togglePin(p: ForumPost) {
  try {
    await updatePostAdmin(p.id, { pinned: !p.pinned })
    ElMessage.success(p.pinned ? '已取消置顶' : '已置顶')
    await load()
  } catch (e: any) {
    ElMessage.error(e.message || '操作失败')
  }
}

async function toggleFeatured(p: ForumPost) {
  try {
    await updatePostAdmin(p.id, { featured: !p.featured })
    ElMessage.success(p.featured ? '已取消加精' : '已加精')
    await load()
  } catch (e: any) {
    ElMessage.error(e.message || '操作失败')
  }
}

async function removePost(p: ForumPost) {
  try {
    await ElMessageBox.confirm(`确认删除帖子「${p.title}」吗？删除后不可恢复。`, '删除帖子', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }
  try {
    await deletePostAdmin(p.id)
    ElMessage.success('已删除')
    await load()
  } catch (e: any) {
    ElMessage.error(e.message || '删除失败')
  }
}

onMounted(load)
</script>

<template>
  <div class="page-container forum-page">
    <h2 class="title">论坛</h2>
    <p class="subtitle">
      交流赛事、战队与日常。发帖回帖仅限审核通过的账号，游客可浏览。
    </p>

    <!-- 工具条 -->
    <div class="toolbar">
      <el-radio-group v-model="currentSection" @change="onSectionChange">
        <el-radio-button value="">全部</el-radio-button>
        <el-radio-button v-for="s in sections" :key="s.id" :value="s.id">
          {{ s.name }}
        </el-radio-button>
      </el-radio-group>
      <div class="toolbar-right">
        <el-button
          :type="viewMode === 'favorites' ? 'primary' : ''"
          plain
          @click="toggleFavorites"
        >
          {{ viewMode === 'favorites' ? '返回列表' : '我的收藏' }}
        </el-button>
        <el-input
          v-model="keyword"
          placeholder="搜索帖子标题 / 内容"
          clearable
          class="search-input"
          :disabled="viewMode === 'favorites'"
          @keyup.enter="onSearch"
          @clear="onSearch"
        />
        <el-button type="primary" plain @click="openPostDialog">发帖</el-button>
      </div>
    </div>

    <el-alert
      v-if="!canPost && canPostHint"
      :title="canPostHint"
      type="warning"
      :closable="false"
      class="post-hint"
    />

    <div v-loading="loading" class="post-list">
      <el-empty
        v-if="!loading && posts.length === 0"
        :description="viewMode === 'favorites' ? '还没有收藏的帖子' : '该版块暂无帖子，来发第一帖吧'"
      />
      <div v-for="p in posts" :key="p.id" class="post-item" @click="openPost(p)">
        <div class="post-main">
          <div class="post-tags">
            <el-tag v-if="p.pinned" size="small" type="danger" effect="dark">置顶</el-tag>
            <el-tag v-if="p.featured" size="small" type="warning" effect="dark">加精</el-tag>
            <el-tag v-if="currentSection === ''" size="small" effect="plain" class="section-tag">
              {{ p.section_name || '未分类' }}
            </el-tag>
          </div>
          <div class="post-title">{{ p.title }}</div>
          <div class="post-meta">
            <span class="post-author">{{ authorName(p) }}</span>
            <span class="post-time">{{ formatDateTime(p.created_at) }}</span>
            <span v-if="auth.isAdmin" class="admin-ops" @click.stop>
              <el-button size="small" text :type="p.pinned ? 'danger' : ''" @click="togglePin(p)">
                {{ p.pinned ? '取消置顶' : '置顶' }}
              </el-button>
              <el-button size="small" text :type="p.featured ? 'warning' : ''" @click="toggleFeatured(p)">
                {{ p.featured ? '取消加精' : '加精' }}
              </el-button>
              <el-button size="small" text type="danger" @click="removePost(p)">删除</el-button>
            </span>
          </div>
        </div>
        <div class="post-stats">
          <span class="stat">
            <span class="stat-num">{{ p.comment_count }}</span>
            <span class="stat-label">回帖</span>
          </span>
          <span class="stat">
            <span class="stat-num">{{ p.like_count }}</span>
            <span class="stat-label">点赞</span>
          </span>
        </div>
      </div>
    </div>

    <!-- 发帖弹窗 -->
    <el-dialog v-model="postDialog" title="发布新帖" width="560px">
      <el-form label-width="0">
        <el-form-item>
          <el-select v-model="postForm.sectionId" placeholder="选择版块" style="width: 100%">
            <el-option v-for="s in sections" :key="s.id" :label="s.name" :value="s.id" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-input v-model="postForm.title" maxlength="60" show-word-limit placeholder="帖子标题" />
        </el-form-item>
        <el-form-item>
          <el-input
            v-model="postForm.content"
            type="textarea"
            :rows="6"
            maxlength="5000"
            show-word-limit
            placeholder="正文内容（纯文字）"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="postDialog = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitPost">发布</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.title {
  margin: 0 0 4px;
}

.subtitle {
  margin: 0 0 16px;
  color: var(--cs2-text-muted);
  font-size: 13px;
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.search-input {
  width: 240px;
}

.post-hint {
  margin-bottom: 12px;
}

.post-list {
  min-height: 120px;
}

.post-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 16px;
  margin-bottom: 10px;
  background: var(--cs2-panel);
  border: 1px solid var(--cs2-border);
  border-radius: 10px;
  cursor: pointer;
  transition: border-color 0.2s ease, background 0.2s ease;
}

.post-item:hover {
  border-color: var(--cs2-accent);
  background: var(--cs2-panel-2);
}

.post-main {
  flex: 1;
  min-width: 0;
}

.post-tags {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}

.section-tag {
  color: var(--cs2-text-muted);
}

.post-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--cs2-text);
  margin-bottom: 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.post-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  font-size: 12px;
  color: var(--cs2-text-muted);
}

.post-author {
  color: var(--cs2-accent);
  font-weight: 600;
}

.admin-ops {
  display: inline-flex;
  gap: 2px;
}

.post-stats {
  display: flex;
  gap: 20px;
  flex-shrink: 0;
}

.stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.stat-num {
  font-size: 16px;
  font-weight: 800;
  color: var(--cs2-text);
}

.stat-label {
  font-size: 11px;
  color: var(--cs2-text-muted);
}

/* ---------- 移动端适配 ---------- */
@media (max-width: 768px) {
  .toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .toolbar-right {
    width: 100%;
  }

  .search-input {
    flex: 1;
    width: auto;
    min-width: 0;
  }

  .post-item {
    align-items: flex-start;
    flex-direction: column;
    gap: 10px;
  }

  .post-stats {
    width: 100%;
    justify-content: flex-end;
  }
}
</style>
