<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useAuthStore } from '@/stores/auth'
import type { EventItem } from '@/api/types'
import { listSignupEvents } from '@/api/event'
import { createTeam } from '@/api/registration'

const auth = useAuthStore()
const submitting = ref(false)
const done = ref(false)
const events = ref<EventItem[]>([])
const eventsLoaded = ref(false)

const form = reactive({
  eventId: '',
  teamName: '',
  tag: '',
})

async function submit() {
  if (!auth.isLoggedIn) {
    ElMessage.warning('请先登录（演示模式可在登录页选择"以选手身份进入"）')
    return
  }
  if (!form.eventId) {
    ElMessage.warning('请选择报名的赛事')
    return
  }
  if (!form.teamName) {
    ElMessage.warning('请填写战队名称')
    return
  }
  if (form.tag && !/^[a-zA-Z0-9]{2,6}$/.test(form.tag)) {
    ElMessage.warning('战队 ID 需为 2-6 位字母或数字')
    return
  }
  submitting.value = true
  try {
    const team = await createTeam(form.teamName, form.tag, form.eventId)
    if (!team) {
      ElMessage.error('创建失败')
      return
    }
    ElMessage.success(`战队已提交（${team.name}）`)
    done.value = true
  } finally {
    submitting.value = false
  }
}

onMounted(async () => {
  events.value = await listSignupEvents()
  eventsLoaded.value = true
  form.eventId = events.value[0]?.id ?? ''
})
</script>

<template>
  <div class="page-container">
    <h2 class="title">战队报名</h2>

    <!-- 提交成功 -->
    <el-result
      v-if="done"
      icon="success"
      title="报名已提交"
      sub-title="管理员将在后台为你的战队选择队员并审核，审核通过后战队将出现在赛程与积分榜中。"
    >
      <template #extra>
        <el-button type="primary" @click="$router.push({ name: 'home' })">返回首页</el-button>
      </template>
    </el-result>

    <!-- 注册表单 -->
    <el-card v-else class="register-card">
      <el-alert
        v-if="eventsLoaded && events.length === 0"
        type="warning"
        :closable="false"
        title="暂无可报名赛事"
        description="当前没有处于「报名中」状态的赛事，请联系管理员发布赛事后再来报名。"
        class="tip"
      />

      <el-form label-width="90px">
        <el-form-item label="报名赛事">
          <el-select
            v-model="form.eventId"
            placeholder="选择本次报名的赛事"
            style="width: 100%"
            :disabled="events.length === 0"
          >
            <el-option
              v-for="e in events"
              :key="e.id"
              :label="`${e.name}${e.edition ? `（第 ${e.edition} 届）` : ''}`"
              :value="e.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="战队名称">
          <el-input v-model="form.teamName" placeholder="例如：Nova Velocity" />
        </el-form-item>
        <el-form-item label="战队 ID">
          <el-input v-model="form.tag" placeholder="例如：NV11（2-6 位字母数字）" maxlength="6" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="submitting" @click="submit">提交报名</el-button>
        </el-form-item>
      </el-form>

      <el-alert
        type="info"
        :closable="false"
        title="报名流程"
        description="先选择本次要参加的赛事，再填写战队信息提交报名（队长自动入队）。队员由管理员在后台「战队报名审核」中从已通过个人注册的选手中为你的战队选择，队员不少于 5 人后战队即可通过审核。"
      />
    </el-card>
  </div>
</template>

<style scoped>
.title {
  margin: 0 0 16px;
}

.register-card {
  max-width: 620px;
}

.tip {
  margin-bottom: 16px;
}
</style>
