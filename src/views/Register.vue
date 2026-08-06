<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useAuthStore } from '@/stores/auth'
import type { PlayerItem } from '@/api/types'
import { createTeam, listPlayers } from '@/api/registration'

const auth = useAuthStore()
const step = ref(0)
const submitting = ref(false)
const players = ref<PlayerItem[]>([])

const form = reactive({
  teamName: '',
  tag: '',
  memberIds: [] as string[],
})

const MIN_MEMBERS = 5 // 含队长

const totalCount = () => form.memberIds.length + 1 // +1 队长

onMounted(async () => {
  players.value = await listPlayers()
})

async function next() {
  if (!auth.isLoggedIn) {
    ElMessage.warning('请先登录（演示模式可在登录页选择"以选手身份进入"）')
    return
  }
  if (!form.teamName) {
    ElMessage.warning('请填写战队名称')
    return
  }
  step.value = 1
}

async function submit() {
  if (totalCount() < MIN_MEMBERS) {
    ElMessage.warning(`参赛队员（含队长）至少 ${MIN_MEMBERS} 名，还需选 ${MIN_MEMBERS - totalCount()} 名`)
    return
  }
  submitting.value = true
  try {
    const team = await createTeam(form.teamName, form.tag, form.memberIds)
    if (!team) {
      ElMessage.error('创建失败')
      return
    }
    ElMessage.success(`战队已提交（${team.name}），等待管理员审核`)
    step.value = 2
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="page-container">
    <el-steps :active="step" align-center class="steps">
      <el-step title="战队信息" />
      <el-step title="选择队员" />
      <el-step title="提交成功" />
    </el-steps>

    <!-- 第 1 步：战队信息 -->
    <el-card v-if="step === 0" class="register-card">
      <el-form label-width="90px">
        <el-form-item label="战队名称">
          <el-input v-model="form.teamName" placeholder="例如：Nova Velocity" />
        </el-form-item>
        <el-form-item label="队标缩写">
          <el-input v-model="form.tag" placeholder="例如：NV（2-4 位英文）" maxlength="4" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="next">下一步：选择队员</el-button>
        </el-form-item>
      </el-form>
      <el-alert
        type="info"
        :closable="false"
        title="报名流程"
        description="队长（当前登录选手）自动入队；下一步从已注册的个人选手中选择 4 名以上队友（共 ≥5 人）。还没有个人注册？先去「个人注册」填写昵称与完美 ID。"
      />
    </el-card>

    <!-- 第 2 步：从选手池选人 -->
    <el-card v-else-if="step === 1" class="register-card">
      <el-form label-width="90px">
        <el-form-item label="队长">
          <el-tag type="warning">
            {{ auth.profile?.nickname || auth.profile?.username }}（自动入队）
          </el-tag>
        </el-form-item>
        <el-form-item label="选择队员">
          <el-select
            v-model="form.memberIds"
            multiple
            filterable
            placeholder="搜索昵称添加队员（已入队选手不可选）"
            style="width: 100%"
          >
            <el-option
              v-for="p in players"
              :key="p.id"
              :label="p.nickname ?? p.id"
              :value="p.id"
              :disabled="p.in_team && !form.memberIds.includes(p.id)"
            >
              <span>{{ p.nickname }}</span>
              <span class="option-steam">{{ p.pw_username }}</span>
              <el-tag v-if="p.in_team" size="small" type="info" effect="plain">已入队</el-tag>
            </el-option>
          </el-select>
        </el-form-item>
        <el-form-item>
          <div class="count">
            已选：队长 1 + 队员 {{ form.memberIds.length }} = {{ totalCount() }}
            <span :class="{ ok: totalCount() >= MIN_MEMBERS }">
              （至少 {{ MIN_MEMBERS }} 人{{ totalCount() >= MIN_MEMBERS ? '，已满足' : '' }}）
            </span>
          </div>
        </el-form-item>
        <el-form-item>
          <el-button @click="step = 0">上一步</el-button>
          <el-button type="primary" :loading="submitting" @click="submit">提交报名</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 第 3 步：成功 -->
    <el-result
      v-else
      icon="success"
      title="报名已提交"
      sub-title="请等待管理员审核，审核通过后战队将出现在赛程与积分榜中。"
    >
      <template #extra>
        <el-button type="primary" @click="$router.push({ name: 'home' })">返回首页</el-button>
      </template>
    </el-result>
  </div>
</template>

<style scoped>
.steps {
  margin-bottom: 32px;
}

.register-card {
  max-width: 680px;
  margin: 0 auto;
}

.option-steam {
  margin: 0 8px;
  color: #909399;
  font-size: 12px;
}

.count {
  color: #606266;
  width: 100%;
}

.count .ok {
  color: #67c23a;
}
</style>
