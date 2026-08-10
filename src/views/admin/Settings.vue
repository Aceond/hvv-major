<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { getSiteConfig, updateSiteConfig, DEFAULT_SITE_CONFIG } from '@/api/config'

const form = reactive({ ...DEFAULT_SITE_CONFIG })
const saving = ref(false)

onMounted(async () => {
  Object.assign(form, await getSiteConfig())
})

async function save() {
  saving.value = true
  try {
    await updateSiteConfig({ ...form })
    ElMessage.success('已保存，首页将展示更新后的内容')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div>
    <h2>站点设置</h2>
    <el-alert
      type="info"
      :closable="false"
      title="首页内容配置"
      description="修改后首页 Hero 标题、副标题、标语与赛事公告会同步更新。演示模式下保存在本地浏览器，接入 Supabase 后写入 site_config 表。"
      class="tip"
    />

    <el-form :model="form" label-width="110px" class="form">
      <el-form-item label="Hero 标题">
        <el-input v-model="form.brand_title" placeholder="如：HVV MAJOR 11" />
        <span class="hint">首个单词正常色显示，其余部分自动高亮</span>
      </el-form-item>
      <el-form-item label="标题上方小字">
        <el-input v-model="form.brand_overline" placeholder="如：HVV MAJOR 2026 · COUNTER-STRIKE 2" />
      </el-form-item>
      <el-form-item label="标题下方标语">
        <el-input v-model="form.brand_slogan" placeholder="宣传标语" />
      </el-form-item>
      <el-form-item label="赛事公告">
        <el-input v-model="form.notice" type="textarea" :rows="3" placeholder="赛事公告内容" />
      </el-form-item>
      <el-form-item label="账号注册审核">
        <el-switch
          v-model="form.require_account_review"
          active-text="开启审核"
          inactive-text="关闭审核"
        />
        <span class="hint">
          开启时新注册账号默认待审核，管理员在后台「账号管理」通过后才能使用全部功能；关闭时注册即可直接使用全部功能（对已注册账号也即时生效）。
        </span>
      </el-form-item>
      <el-form-item>
        <el-button type="primary" :loading="saving" @click="save">保存修改</el-button>
      </el-form-item>
    </el-form>
  </div>
</template>

<style scoped>
.tip {
  margin-bottom: 20px;
}

.form {
  max-width: 640px;
}

.hint {
  display: block;
  font-size: 12px;
  line-height: 1.6;
  color: var(--cs2-text-muted);
}
</style>
