import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import 'element-plus/dist/index.css'
import 'element-plus/theme-chalk/dark/css-vars.css'

import App from './App.vue'
import router from './router'
import { useAuthStore } from '@/stores/auth'
import './style.css'

// CS2 主题：全局启用暗色模式
document.documentElement.classList.add('dark')

const app = createApp(App)

app.use(createPinia())
app.use(router)
app.use(ElementPlus, { locale: zhCn })

app.mount('#app')

// 挂机/切后台回来时主动刷新会话，避免 token 过期后首次点击才触发刷新、请求挂起导致界面无响应
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return
  const auth = useAuthStore()
  if (auth.isLoggedIn) auth.refresh()
})

// 点击劫持防御兜底：如被嵌入非法 iframe，强制跳出（对老浏览器作补充；现代浏览器由 CSP frame-ancestors 'self' 拦截）
if (window.self !== window.top) {
  try {
    const parentHost = new URL(document.referrer).host
    if (parentHost !== window.location.host) {
      window.top!.location.replace(window.location.href)
    }
  } catch {
    // cross-origin 无法读 referrer 时，一律判定为非法嵌入
    window.top!.location.replace(window.location.href)
  }
}
