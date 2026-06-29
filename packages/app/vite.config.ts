import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

// Front-end shell. Tauri-friendly defaults (fixed port, no screen-clear) are
// harmless for plain browser dev and ready for the desktop wrapper later.
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) }
  },
  clearScreen: false,
  server: {
    port: 8327,
    strictPort: true,
    // 别监视 Rust 编译产物:tauri dev 并行编译时 target/ 下的文件会被占用,
    // Vite 监视到正在写入的 .exe 会抛 EBUSY 崩溃。
    watch: { ignored: ['**/src-tauri/**'] }
  }
})
