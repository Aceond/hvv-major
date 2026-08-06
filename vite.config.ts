import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

// GitHub Pages 子路径部署：仓库名为 hvv-major 时 base 为 '/hvv-major/'
// 若使用自定义域名或部署到根路径，改为 '/'
export default defineConfig({
  plugins: [vue()],
  base: '/hvv-major/',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    open: true,
  },
})
