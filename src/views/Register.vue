<script setup lang="ts">
import { reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useAuthStore } from '@/stores/auth'
import { createTeam } from '@/api/registration'

const auth = useAuthStore()
const submitting = ref(false)
const done = ref(false)

const form = reactive({
  teamName: '',
  tag: '',
})

async function submit() {
  if (!auth.isLoggedIn) {
    ElMessage.warning('请先登录（演示模式可在登录页选择"以选手身份进入"）')
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
    const team = await createTeam(form.teamName, form.tag)
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
      <el-form label-width="90px">
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
        description="只需填写战队信息提交报名（队长自动入队）。队员由管理员在后台「战队报名审核」中从已通过个人注册的选手中为你的战队选择，队员不少于 5 人后战队即可通过审核。还没有个人注册？先去「个人注册」提交选手姓名、完美 ID 与赛季截图，审核通过后即可被选入战队。"
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
</style>
