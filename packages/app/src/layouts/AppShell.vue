<script setup lang="ts">
import { ref, type Component } from 'vue'
import {
  Bell,
  CalendarClock,
  CheckCircle2,
  CircleHelp,
  Download,
  KeyRound,
  ListChecks,
  MousePointerClick,
  ScrollText,
  Settings,
  SlidersHorizontal,
  Terminal
} from 'lucide-vue-next'
import { useRouter } from 'vue-router'
import { useAppStore } from '@/stores/app'

const router = useRouter()

// 桌面窗口控件:仅在 Tauri 运行时动态调用,浏览器预览中为无操作
const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
async function win(action: 'min' | 'max' | 'close') {
  if (!isTauri) return
  const { getCurrentWindow } = await import('@tauri-apps/api/window')
  const w = getCurrentWindow()
  if (action === 'min') await w.minimize()
  else if (action === 'max') await w.toggleMaximize()
  else await w.close()
}

interface NavItem {
  label: string
  to: string
  icon: Component
}
interface NavGroup {
  name: string
  items: NavItem[]
}

const groups: NavGroup[] = [
  {
    name: '采集',
    items: [
      { label: '点选采集', to: '/pick', icon: MousePointerClick },
      { label: '任务列表', to: '/tasks', icon: ListChecks }
    ]
  },
  {
    name: '抓取',
    items: [
      { label: '请求配置', to: '/request', icon: SlidersHorizontal },
      { label: '调试控制台', to: '/debug', icon: Terminal }
    ]
  },
  {
    name: '下载',
    items: [
      { label: '下载队列', to: '/downloads', icon: Download },
      { label: '已完成', to: '/completed', icon: CheckCircle2 }
    ]
  },
  {
    name: '自动化',
    items: [
      { label: '定时任务', to: '/schedule', icon: CalendarClock },
      { label: '通知规则', to: '/notify', icon: Bell }
    ]
  },
  {
    name: '系统',
    items: [
      { label: '凭据管理', to: '/credentials', icon: KeyRound },
      { label: '日志', to: '/logs', icon: ScrollText },
      { label: '设置', to: '/settings', icon: Settings },
      { label: '帮助', to: '/help', icon: CircleHelp }
    ]
  }
]

const app = useAppStore()
const clock = '16:57:11'

// 首启一次性免责声明(中立工具合规前置);接受后本地记录不再弹出。
const disclaimerAccepted = ref(localStorage.getItem('sift.disclaimer.accepted') === '1')
function acceptDisclaimer() {
  disclaimerAccepted.value = true
  localStorage.setItem('sift.disclaimer.accepted', '1')
}
</script>

<template>
  <div class="app">
    <!-- title bar -->
    <div class="titlebar" data-tauri-drag-region>
      <div class="brand">
        <span class="logo" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
            <g fill="none">
              <path
                fill="#b0b0af"
                d="M8.185 14.95c-.105-.105-6.498-1.512-6.498-1.512s-.372.597-.265.95c.06.197 1.455 1.82 2.89 3.312c1.133 1.18 2.42 2.38 2.608 3.065c.287 1.055.317 2.747.317 2.747L3.07 26.059s.51 2.595 3.815 2.492c3.087-.095 3.248-3.365 4.228-3.383c.165-.002.392-.06.8.378c1.01 1.085 2.9 3.18 3.532 3.815c.845.845 1.445 1.69 1.762 1.655c.318-.035 2.996-2.43 3.77-3.17c.776-.74 1.48-1.62 1.48-2.36s-1.092-1.302-1.092-1.302l-6.025.704z" />
              <path
                fill="url(#siftLogoLeaf)"
                d="M22.03 6.247c.19-.695-.027-2.402 1.3-3.532c1.328-1.13 3.393-.99 4.635.197s1.442 3.42-.027 4.89c-1.47 1.47-2.148.65-2.968 1.443s-.677 1.443-.17 1.923c.51.48 5.57 5.767 5.427 6.105c-.142.337-3.59 4.24-4.154 4.522c-.566.282-1.556.255-1.753-.678c-.198-.932.142-2.797-1.273-3.28c-1.412-.48-2.035-.084-3.42 1.386s-2.007 3.08-.877 3.9s2.545.48 3.11 1.442s-.282 1.837-1.78 3.223c-1.497 1.384-2.657 2.514-2.855 2.375c-.198-.143-4.495-4.693-4.918-5.173c-.425-.48-1.245-.905-2.034-.17c-.793.735-.933 3.137-4.268 3.137S2.27 24.34 3.457 22.844c1.188-1.498 3.815-1.64 3.873-2.658c.025-.467-1.418-1.727-2.713-3.08c-1.522-1.593-2.937-3.28-2.997-3.478c-.113-.367 3.165-3.59 3.787-4.042c.623-.453 1.328-.17 1.668.197c.34.368.425 1.498.707 2.148c.283.65 1.61 3.478 4.806.255c3.165-3.195.17-4.58-.848-4.863c-1.018-.282-1.75-.375-2.035-1.412c-.225-.82 1.018-1.78 2.318-3.025S14.085.99 14.425.99s4.89 4.89 5.485 5.455s.96.707 1.385.592c.422-.11.65-.477.735-.79" />
              <defs>
                <radialGradient
                  id="siftLogoLeaf"
                  cx="0"
                  cy="0"
                  r="1"
                  gradientTransform="translate(15.543 -7.075)scale(29.8062)"
                  gradientUnits="userSpaceOnUse">
                  <stop offset=".508" stop-color="#b7d118" />
                  <stop offset=".572" stop-color="#b2d019" />
                  <stop offset=".643" stop-color="#a5cd1d" />
                  <stop offset=".717" stop-color="#8fc922" />
                  <stop offset=".793" stop-color="#70c22a" />
                  <stop offset=".871" stop-color="#48ba34" />
                  <stop offset=".949" stop-color="#18b040" />
                  <stop offset=".981" stop-color="#02ab46" />
                </radialGradient>
              </defs>
            </g>
          </svg>
        </span>
        <span class="name">Sift</span>
        <span class="pro">
          <svg width="9" height="9" viewBox="0 0 16 16" fill="#fff">
            <path d="M8 1l2 4.6 5 .5-3.8 3.3 1.2 4.9L8 11.7 3.6 14.3l1.2-4.9L1 6.1l5-.5z" />
          </svg>
          PRO
        </span>
      </div>
      <div class="drag" data-tauri-drag-region />
      <div class="win">
        <button type="button" aria-label="最小化" @click="win('min')">
          <svg width="13" height="13" viewBox="0 0 16 16" stroke="currentColor" stroke-width="1.3">
            <path d="M3 8h10" />
          </svg>
        </button>
        <button type="button" aria-label="最大化" @click="win('max')">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3">
            <rect x="3" y="3" width="10" height="10" rx="1.5" />
          </svg>
        </button>
        <button type="button" class="close" aria-label="关闭" @click="win('close')">
          <svg width="12" height="12" viewBox="0 0 16 16" stroke="currentColor" stroke-width="1.3">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
      </div>
    </div>

    <div class="body">
      <!-- sidebar -->
      <aside class="sidebar">
        <nav class="nav">
          <div v-for="g in groups" :key="g.name" class="group">
            <div class="group-label">{{ g.name }}</div>
            <router-link v-for="item in g.items" :key="item.to" :to="item.to" class="item">
              <component :is="item.icon" :size="16" class="ico" />
              <span>{{ item.label }}</span>
            </router-link>
          </div>
        </nav>
        <div class="rules-wrap">
          <div class="rules-card" @click="router.push('/pick')">
            <span class="rc-ico">
              <svg
                width="14"
                height="14"
                viewBox="0 0 16 16"
                fill="none"
                stroke="#9d83ff"
                stroke-width="1.4"
                stroke-linecap="round"
                stroke-linejoin="round">
                <path d="M4 2.5h5l3 3V13.5H4z" />
                <path d="M9 2.5v3h3" />
              </svg>
            </span>
            <div class="rc-text">
              <div class="rc-title">已加载 {{ app.rulesLoaded }} 个规则</div>
              <div class="rc-sub">点击管理</div>
            </div>
            <svg
              class="rc-arrow"
              width="14"
              height="14"
              viewBox="0 0 16 16"
              fill="none"
              stroke="#6a6a76"
              stroke-width="1.4"
              stroke-linecap="round"
              stroke-linejoin="round">
              <path d="M6 3l5 5-5 5" />
            </svg>
          </div>
        </div>
      </aside>

      <!-- main -->
      <main class="main">
        <div class="glow" aria-hidden="true" />
        <router-view />
      </main>
    </div>

    <!-- status bar -->
    <footer class="statusbar">
      <div class="sb-left">
        <span class="stat">
          <i class="dot ok" />
          引擎 {{ app.engineStatus === 'ready' ? '就绪' : '运行中' }}
        </span>
        <span class="stat">
          <i class="dot warn pulse" />
          网络 限速中
        </span>
        <span class="stat">
          <i class="dot idle" />
          下载队列 空闲
        </span>
      </div>
      <div class="sb-center">
        <div class="ticker">
          <span class="t-time mono">{{ clock }}</span>
          <span class="t-msg">引擎就绪 · 已加载 {{ app.rulesLoaded }} 个规则</span>
        </div>
      </div>
      <div class="sb-right">
        <span class="sb-note">本地优先 · 凭据本地加密</span>
        <span class="sb-time mono">{{ clock }}</span>
      </div>
    </footer>

    <!-- 首启免责声明 -->
    <div v-if="!disclaimerAccepted" class="disclaimer-mask">
      <div class="disclaimer-box">
        <h2>使用前须知</h2>
        <p>
          Sift 是中立的数据采集工具,不预置任何目标站点。请遵守目标网站的服务条款与 robots
          协议及相关法律法规,仅采集你有权访问的数据,并对使用后果自行负责。内置限速请保持开启,以减轻对目标站点的压力。
        </p>
        <p class="dc-sub">凭据(Cookie / Token)仅本地加密存储于系统钥匙串,请仅保存你本人有权使用的账户。</p>
        <button type="button" class="dc-accept" @click="acceptDisclaimer">我已阅读并同意</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  height: 100%;
}

/* 首启免责声明 */
.disclaimer-mask {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(6, 6, 11, 0.72);
}
.disclaimer-box {
  width: 460px;
  max-width: calc(100vw - 40px);
  background: #15151d;
  border: 1px solid #2a2a34;
  border-radius: 14px;
  padding: 24px;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.55);
  line-height: 1.6;
}
.disclaimer-box h2 {
  margin: 0 0 12px;
  font-size: 17px;
  font-weight: 700;
}
.disclaimer-box p {
  margin: 0 0 10px;
  font-size: 13px;
  color: var(--text-secondary);
}
.disclaimer-box .dc-sub {
  font-size: 12px;
  color: var(--text-dim);
}
.dc-accept {
  margin-top: 8px;
  height: 38px;
  padding: 0 20px;
  border-radius: 9px;
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
  border: none;
  color: #fff;
  font-size: 13.5px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(124, 92, 252, 0.3);
}

/* title bar */
.titlebar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 38px;
  background: var(--bg-sidebar);
  border-bottom: 1px solid var(--border-subtle);
  padding: 0 0 0 16px;
}
.brand {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 196px;
}
.logo {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  flex: none;
}
.brand .name {
  font-weight: 700;
  font-size: 15px;
  letter-spacing: -0.01em;
}
.brand .pro {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 7px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: #fff;
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
  border: 1px solid rgba(150, 120, 255, 0.5);
  border-radius: 5px;
  box-shadow: 0 1px 6px rgba(124, 92, 252, 0.4);
}
.drag {
  flex: 1;
}
.win {
  display: flex;
}
.win button {
  display: grid;
  place-items: center;
  width: 46px;
  height: 38px;
  background: none;
  border: 0;
  color: var(--text-secondary);
  cursor: pointer;
}
.win button:hover {
  background: var(--bg-card);
  color: var(--text);
}
.win button.close:hover {
  background: var(--danger);
  color: #fff;
}

/* body */
.body {
  flex: 1;
  display: flex;
  min-height: 0;
}

/* sidebar */
.sidebar {
  display: flex;
  flex-direction: column;
  width: 212px;
  flex: none;
  background: var(--bg-sidebar);
  border-right: 1px solid var(--border-subtle);
}
.nav {
  flex: 1;
  overflow-y: auto;
  padding: 6px 10px 4px;
}
.group-label {
  padding: 14px 8px 5px;
  color: #56565f;
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.04em;
}
.item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 8px;
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 600;
}
.item .ico {
  flex: none;
}
.item:hover {
  background: #15151d;
}
.item.router-link-active {
  color: #fff;
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
  box-shadow: 0 3px 12px rgba(124, 92, 252, 0.32);
}
.rules-wrap {
  flex: none;
  padding: 10px;
  border-top: 1px solid var(--border-subtle);
}
.rules-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 10px;
  background: #13131a;
  border: 1px solid #24242e;
  border-radius: 10px;
  cursor: pointer;
}
.rules-card:hover {
  border-color: #33333f;
}
.rc-ico {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  flex: none;
  border-radius: 7px;
  background: #1d1830;
  border: 1px solid #2e2747;
}
.rc-text {
  flex: 1;
  min-width: 0;
}
.rc-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text);
}
.rc-sub {
  font-size: 11px;
  color: #7a7a87;
}
.rc-arrow {
  flex: none;
}

/* main */
.main {
  flex: 1;
  min-width: 0;
  position: relative;
  display: flex;
  flex-direction: column;
  background: var(--bg);
}
.glow {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: radial-gradient(820px 520px at 100% -8%, rgba(124, 92, 252, 0.1), transparent 58%);
}
/* keep the routed view above the glow and let it own the scroll */
.main > :not(.glow) {
  position: relative;
  flex: 1;
  min-height: 0;
}

/* status bar */
.statusbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  height: 30px;
  flex: none;
  padding: 0 14px;
  background: var(--bg-sidebar);
  border-top: 1px solid var(--border-subtle);
  font-size: 11.5px;
  color: var(--text-secondary);
}
.sb-left {
  display: flex;
  align-items: center;
  gap: 16px;
  flex: none;
}
.stat {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #56565f;
}
.dot.ok {
  background: #34d399;
}
.dot.warn {
  background: var(--warning);
}
.dot.pulse {
  animation: siftPulse 1.8s ease-in-out infinite;
}
.sb-center {
  flex: 1;
  min-width: 0;
  display: flex;
  justify-content: center;
}
.ticker {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
  max-width: 600px;
}
.t-time {
  font-size: 10px;
  color: #5a5a66;
  flex: none;
}
.t-msg {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #5dd9b8;
}
.sb-right {
  display: flex;
  align-items: center;
  gap: 14px;
  flex: none;
}
.sb-note {
  color: #5a5a66;
}
.sb-time {
  color: var(--text-secondary);
}
</style>
