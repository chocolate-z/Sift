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
  server: { port: 8327, strictPort: true }
})
