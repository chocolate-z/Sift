import { createRouter, createWebHashHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'

// Hash history keeps routing working inside the Tauri custom-protocol shell.
const ph = () => import('@/views/PlaceholderView.vue')

const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/pick' },
  { path: '/pick', name: 'pick', component: () => import('@/views/PickerView.vue'), meta: { title: '点选采集' } },
  {
    path: '/import',
    name: 'import',
    component: () => import('@/views/RuleImportView.vue'),
    meta: { title: '规则导入' }
  },
  {
    path: '/tasks',
    name: 'tasks',
    component: () => import('@/views/TaskListView.vue'),
    meta: { title: '任务列表' }
  },
  {
    path: '/request',
    name: 'request',
    component: () => import('@/views/RequestConfigView.vue'),
    meta: { title: '请求配置' }
  },
  {
    path: '/debug',
    name: 'debug',
    component: () => import('@/views/DebugView.vue'),
    meta: { title: '调试控制台' }
  },
  {
    path: '/downloads',
    name: 'downloads',
    component: () => import('@/views/DownloadQueueView.vue'),
    meta: { title: '下载队列' }
  },
  {
    path: '/completed',
    name: 'completed',
    component: () => import('@/views/CompletedView.vue'),
    meta: { title: '已完成' }
  },
  // 数据预览不在左导航(从任务/已完成进入),单独挂一个非导航路由
  {
    path: '/data',
    name: 'data',
    component: () => import('@/views/DataPreviewView.vue'),
    meta: { title: '数据预览' }
  },
  { path: '/schedule', name: 'schedule', component: ph, meta: { title: '定时任务' } },
  { path: '/notify', name: 'notify', component: ph, meta: { title: '通知规则' } },
  {
    path: '/credentials',
    name: 'credentials',
    component: () => import('@/views/CredentialsView.vue'),
    meta: { title: '凭据管理' }
  },
  {
    path: '/logs',
    name: 'logs',
    component: () => import('@/views/LogsView.vue'),
    meta: { title: '日志' }
  },
  {
    path: '/settings',
    name: 'settings',
    component: () => import('@/views/SettingsView.vue'),
    meta: { title: '设置' }
  },
  {
    path: '/help',
    name: 'help',
    component: () => import('@/views/HelpView.vue'),
    meta: { title: '帮助' }
  }
]

export const router = createRouter({
  history: createWebHashHistory(),
  routes
})
