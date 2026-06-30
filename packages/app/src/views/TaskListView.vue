<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from 'reka-ui'
import { useTasksStore, type Task, type TaskType } from '@/stores/tasks'

const router = useRouter()
const store = useTasksStore()

const searchText = ref('')
const filterType = ref<'all' | 'pick' | 'rule'>('all')
const sortBy = ref<'recent' | 'name' | 'result'>('recent')
const sortLabel = computed(() => ({ recent: '最近运行', name: '名称', result: '结果数' })[sortBy.value])

function resultNum(t: Task): number {
  const m = t.result.match(/\d+/)
  return m ? Number(m[0]) : 0
}
const filteredTasks = computed(() => {
  let list = store.tasks
  if (filterType.value === 'pick') list = list.filter((t) => t.type === 'pick')
  else if (filterType.value === 'rule') list = list.filter((t) => t.type === 'api' || t.type === 'web')
  const q = searchText.value.trim().toLowerCase()
  if (q) list = list.filter((t) => t.name.toLowerCase().includes(q) || t.url.toLowerCase().includes(q))
  if (sortBy.value === 'name') return [...list].sort((a, b) => a.name.localeCompare(b.name, 'zh'))
  if (sortBy.value === 'result') return [...list].sort((a, b) => resultNum(b) - resultNum(a))
  return list
})

const statusLabel = { ready: '就绪', running: '运行中', failed: '失败' }
const typeMeta = {
  pick: { label: '点选', glyph: '' },
  api: { label: 'API 源', glyph: '{}' },
  web: { label: '网页源', glyph: '</>' }
}

// 新建 / 编辑对话框
const dialogOpen = ref(false)
const editingId = ref<number | null>(null)
const form = reactive<{ name: string; type: TaskType; url: string; fields: string }>({
  name: '',
  type: 'pick',
  url: '',
  fields: '3'
})
function openCreate() {
  editingId.value = null
  form.name = ''
  form.type = 'pick'
  form.url = ''
  form.fields = '3'
  dialogOpen.value = true
}
function openEdit(t: Task) {
  editingId.value = t.id
  form.name = t.name
  form.type = t.type
  form.url = t.url
  form.fields = t.fields
  dialogOpen.value = true
}
function submitTask() {
  if (!form.name.trim()) return
  if (editingId.value === null) {
    store.addTask({
      name: form.name.trim(),
      type: form.type,
      url: form.url.trim(),
      fields: form.fields || '0',
      lastRun: '从未运行',
      result: '—',
      status: 'ready'
    })
  } else {
    store.updateTask(editingId.value, {
      name: form.name.trim(),
      type: form.type,
      url: form.url.trim(),
      fields: form.fields || '0'
    })
  }
  dialogOpen.value = false
}
</script>

<template>
  <section class="view tasks">
    <header class="head">
      <h1>任务列表</h1>
      <p class="sub">管理所有采集任务 · 来自点选采集与规则导入</p>
      <div class="toolbar">
        <div class="search">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#6a6a76" stroke-width="1.4">
            <circle cx="7" cy="7" r="4.5" />
            <path d="M10.5 10.5L14 14" />
          </svg>
          <input class="mono" placeholder="搜索任务名 / 站点…" v-model="searchText" />
        </div>
        <div class="filter">
          <span :class="{ on: filterType === 'all' }" @click="filterType = 'all'">全部</span>
          <span :class="{ on: filterType === 'pick' }" @click="filterType = 'pick'">点选</span>
          <span :class="{ on: filterType === 'rule' }" @click="filterType = 'rule'">规则</span>
        </div>
        <DropdownMenuRoot>
          <DropdownMenuTrigger as-child>
            <div class="sort">
              {{ sortLabel }}
              <svg
                width="11"
                height="11"
                viewBox="0 0 16 16"
                fill="none"
                stroke="#6a6a76"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round">
                <path d="M4 6l4 4 4-4" />
              </svg>
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuPortal>
            <DropdownMenuContent class="tl-menu" align="start" :side-offset="6">
              <DropdownMenuItem
                class="tl-menu-item"
                :class="{ active: sortBy === 'recent' }"
                @select="sortBy = 'recent'">
                最近运行
              </DropdownMenuItem>
              <DropdownMenuItem class="tl-menu-item" :class="{ active: sortBy === 'name' }" @select="sortBy = 'name'">
                名称
              </DropdownMenuItem>
              <DropdownMenuItem
                class="tl-menu-item"
                :class="{ active: sortBy === 'result' }"
                @select="sortBy = 'result'">
                结果数
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenuPortal>
        </DropdownMenuRoot>
        <div class="tb-right">
          <button type="button" class="btn-new" @click="openCreate">+ 新建任务</button>
        </div>
      </div>
    </header>

    <div class="body">
      <div v-if="filteredTasks.length" class="list">
        <div v-for="t in filteredTasks" :key="t.id" class="task-row" @click="router.push('/data')">
          <div class="tr-main">
            <div class="tr-title">
              <span class="tr-name">{{ t.name }}</span>
              <span class="type-badge" :class="t.type">
                <svg v-if="t.type === 'pick'" width="9" height="9" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M3 2l9 3.6-3.7 1.2L7 11.8 3 2z" />
                </svg>
                <span v-else class="glyph mono">{{ typeMeta[t.type].glyph }}</span>
                {{ typeMeta[t.type].label }}
              </span>
            </div>
            <span class="tr-url mono">{{ t.url }}</span>
          </div>

          <div class="tr-metrics">
            <div class="metric">
              <div class="m-val">{{ t.fields }}</div>
              <div class="m-label">字段</div>
            </div>
            <div class="metric">
              <div class="m-val">{{ t.lastRun }}</div>
              <div class="m-label">最近运行</div>
            </div>
            <div class="metric">
              <div class="m-val" :class="{ fail: t.resultFail }">{{ t.result }}</div>
              <div class="m-label">上次结果</div>
            </div>
          </div>

          <span class="status" :class="t.status">
            <span v-if="t.status === 'running'" class="run-dot" />
            {{ statusLabel[t.status] }}
          </span>

          <div class="tr-actions" @click.stop>
            <button v-if="t.status === 'ready'" type="button" class="act-run" @click="store.toggleRun(t.id)">
              运行
            </button>
            <button v-else-if="t.status === 'running'" type="button" class="act-soft" @click="store.toggleRun(t.id)">
              暂停
            </button>
            <button v-else type="button" class="act-debug" @click="router.push('/debug')">调试</button>
            <span class="act-edit" @click="openEdit(t)">编辑</span>
            <DropdownMenuRoot>
              <DropdownMenuTrigger as-child>
                <span class="act-more">⋯</span>
              </DropdownMenuTrigger>
              <DropdownMenuPortal>
                <DropdownMenuContent class="tl-menu" align="end" :side-offset="6">
                  <DropdownMenuItem class="tl-menu-item" @select="router.push('/data')">查看数据</DropdownMenuItem>
                  <DropdownMenuItem class="tl-menu-item" @select="store.duplicateTask(t.id)">复制任务</DropdownMenuItem>
                  <DropdownMenuSeparator class="tl-menu-sep" />
                  <DropdownMenuItem class="tl-menu-item danger" @select="store.removeTask(t.id)">删除</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenuPortal>
            </DropdownMenuRoot>
          </div>
        </div>
      </div>

      <div v-else class="empty">
        <div class="empty-ico">
          <svg
            width="28"
            height="28"
            viewBox="0 0 16 16"
            fill="none"
            stroke="#5a4a86"
            stroke-width="1.3"
            stroke-linecap="round"
            stroke-linejoin="round">
            <path d="M3 4h10M3 8h10M3 12h7" />
          </svg>
        </div>
        <div class="empty-title">{{ searchText.trim() || filterType !== 'all' ? '没有匹配的任务' : '还没有任务' }}</div>
        <div class="empty-desc">从点选采集像圈图一样选取字段,或粘贴第三方规则导入 —— 都会出现在这里。</div>
        <div class="empty-actions">
          <button type="button" class="btn-new tall" @click="router.push('/pick')">去点选采集</button>
          <button type="button" class="btn-ghost" @click="router.push('/import')">导入规则</button>
        </div>
      </div>
    </div>

    <!-- 新建 / 编辑任务对话框 -->
    <DialogRoot v-model:open="dialogOpen">
      <DialogPortal>
        <DialogOverlay class="tl-overlay" />
        <DialogContent class="tl-dialog" @open-auto-focus.prevent>
          <DialogTitle class="tl-dialog-title">{{ editingId === null ? '新建任务' : '编辑任务' }}</DialogTitle>
          <DialogDescription class="tl-dialog-desc">
            配置采集任务的基础信息,请求头与限速可稍后在请求配置中补充。
          </DialogDescription>
          <div class="tl-field">
            <label>任务名称</label>
            <input v-model="form.name" placeholder="例如 商品列表" />
          </div>
          <div class="tl-field">
            <label>类型</label>
            <div class="tl-seg">
              <span :class="{ on: form.type === 'pick' }" @click="form.type = 'pick'">点选</span>
              <span :class="{ on: form.type === 'api' }" @click="form.type = 'api'">API 源</span>
              <span :class="{ on: form.type === 'web' }" @click="form.type = 'web'">网页源</span>
            </div>
          </div>
          <div class="tl-field">
            <label>站点 URL</label>
            <input class="mono" v-model="form.url" placeholder="www.example.com" />
          </div>
          <div class="tl-field">
            <label>字段数</label>
            <input class="mono" v-model="form.fields" placeholder="3" />
          </div>
          <div class="tl-dialog-foot">
            <DialogClose class="tl-btn-ghost">取消</DialogClose>
            <button type="button" class="tl-btn-primary" :disabled="!form.name.trim()" @click="submitTask">
              {{ editingId === null ? '创建' : '保存' }}
            </button>
          </div>
        </DialogContent>
      </DialogPortal>
    </DialogRoot>
  </section>
</template>

<style scoped>
.tasks {
  display: flex;
  flex-direction: column;
  height: 100%;
  line-height: normal;
}
.head {
  flex: none;
  padding: 22px 28px 16px;
}
.head h1 {
  margin: 0 0 3px;
  font-size: 24px;
  font-weight: 700;
  letter-spacing: -0.02em;
}
.head .sub {
  font-size: 13px;
  color: var(--text-secondary);
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 14px;
}
.search {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 260px;
  height: 36px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 9px;
  padding: 0 11px;
}
.search input {
  flex: 1;
  min-width: 0;
  background: none;
  border: none;
  outline: none;
  color: #cdccd8;
  font-size: 12px;
}
.filter {
  display: flex;
  height: 36px;
  padding: 3px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 9px;
}
.filter span {
  display: flex;
  align-items: center;
  padding: 0 13px;
  font-size: 12px;
  color: var(--text-secondary);
  border-radius: 6px;
  cursor: pointer;
}
.filter span.on {
  color: #fff;
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
}
.filter span:not(.on):hover {
  color: #cdccd8;
}
.sort {
  display: flex;
  align-items: center;
  gap: 7px;
  height: 36px;
  padding: 0 12px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 9px;
  font-size: 12px;
  color: #9a9aa6;
  cursor: pointer;
}
.sort:hover {
  border-color: #33333f;
}
.tb-right {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 8px;
}
.btn-new {
  height: 36px;
  padding: 0 16px;
  border-radius: 9px;
  border: none;
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(124, 92, 252, 0.3);
}

.body {
  flex: 1;
  overflow-y: auto;
  padding: 18px 28px 28px;
}
.list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.task-row {
  display: flex;
  align-items: center;
  gap: 18px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 11px;
  padding: 14px 16px;
  cursor: pointer;
}
.task-row:hover {
  border-color: #33333f;
  background: #191921;
}
.tr-main {
  flex: 1;
  min-width: 0;
}
.tr-title {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-bottom: 5px;
}
.tr-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
}
.type-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  font-weight: 600;
  border-radius: 5px;
  padding: 1px 7px;
}
.type-badge .glyph {
  font-weight: 700;
}
.type-badge.pick {
  color: #9d83ff;
  background: rgba(124, 92, 252, 0.12);
  border: 1px solid #3a3066;
}
.type-badge.api {
  color: var(--success);
  background: rgba(45, 212, 191, 0.1);
  border: 1px solid rgba(45, 212, 191, 0.35);
}
.type-badge.web {
  color: var(--warning);
  background: rgba(224, 168, 90, 0.1);
  border: 1px solid rgba(224, 168, 90, 0.35);
}
.tr-url {
  font-size: 11px;
  color: #8a86a6;
}
.tr-metrics {
  flex: none;
  display: flex;
  gap: 22px;
  font-size: 11.5px;
  color: var(--text-secondary);
}
.metric {
  text-align: right;
}
.m-val {
  color: #cdccd8;
  font-weight: 600;
}
.m-val.fail {
  color: #c98a86;
}
.m-label {
  font-size: 10px;
}
.status {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  width: 64px;
  text-align: center;
  font-size: 11px;
  border-radius: 6px;
  padding: 3px 0;
}
.status.ready {
  color: #9a9aa6;
  background: var(--bg);
  border: 1px solid #2a2a34;
}
.status.running {
  color: #6fa8f5;
  background: rgba(91, 141, 239, 0.12);
  border: 1px solid rgba(91, 141, 239, 0.35);
}
.status.failed {
  color: #f1837d;
  background: rgba(224, 68, 62, 0.1);
  border: 1px solid rgba(224, 68, 62, 0.35);
}
.run-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #5b8def;
  animation: siftPulse 1.4s ease-in-out infinite;
}
.tr-actions {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
}
.act-run,
.act-soft,
.act-debug {
  height: 30px;
  padding: 0 13px;
  border-radius: 7px;
  font-size: 12px;
  cursor: pointer;
}
.act-run {
  border: none;
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
  color: #fff;
  font-weight: 600;
}
.act-soft {
  background: var(--bg-elevated);
  border: 1px solid #2e2e38;
  color: #cdccd8;
}
.act-soft:hover {
  border-color: #3a3a46;
}
.act-debug {
  background: var(--bg-elevated);
  border: 1px solid #4a2a2a;
  color: #f1a8a4;
}
.act-debug:hover {
  border-color: var(--danger);
}
.act-edit {
  font-size: 12px;
  color: var(--text-secondary);
  cursor: pointer;
}
.act-edit:hover {
  color: #cdccd8;
}
.act-more {
  color: var(--text-dim);
  font-size: 16px;
  padding: 0 2px;
  cursor: pointer;
}
.act-more:hover {
  color: #cdccd8;
}

.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 80px 20px;
}
.empty-ico {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  border-radius: 16px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  margin-bottom: 18px;
}
.empty-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 6px;
}
.empty-desc {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.6;
  max-width: 340px;
  margin-bottom: 20px;
}
.empty-actions {
  display: flex;
  gap: 10px;
}
.btn-new.tall {
  height: 38px;
  padding: 0 18px;
}
.btn-ghost {
  height: 38px;
  padding: 0 18px;
  border-radius: 9px;
  background: var(--bg-elevated);
  border: 1px solid #2e2e38;
  color: #cdccd8;
  font-size: 13px;
  cursor: pointer;
}
.btn-ghost:hover {
  border-color: #3a3a46;
}
</style>

<style>
/* Reka 弹层 portal 到 body 外,scoped 够不着 → 全局样式(tl- 前缀避免外泄) */
.tl-overlay {
  position: fixed;
  inset: 0;
  background: rgba(6, 6, 11, 0.62);
  z-index: 1000;
}
.tl-dialog {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 440px;
  max-width: calc(100vw - 40px);
  display: flex;
  flex-direction: column;
  gap: 14px;
  background: #15151d;
  border: 1px solid #2a2a34;
  border-radius: 14px;
  padding: 22px;
  z-index: 1001;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.55);
  color: var(--text);
  line-height: normal;
}
.tl-dialog:focus {
  outline: none;
}
.tl-dialog-title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: -0.01em;
}
.tl-dialog-desc {
  margin: -6px 0 2px;
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.5;
}
.tl-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.tl-field label {
  font-size: 11.5px;
  color: #8a8a99;
}
.tl-field input {
  background: var(--bg);
  border: 1px solid #2a2a34;
  border-radius: 8px;
  padding: 8px 11px;
  color: #cdccd8;
  font-size: 12.5px;
  outline: none;
}
.tl-field input:focus {
  border-color: var(--accent);
}
.tl-field input::placeholder {
  color: #56565f;
}
.tl-seg {
  display: flex;
  width: fit-content;
  background: var(--bg);
  border: 1px solid #2a2a34;
  border-radius: 8px;
  padding: 3px;
}
.tl-seg span {
  font-size: 12px;
  color: var(--text-secondary);
  padding: 5px 14px;
  border-radius: 6px;
  cursor: pointer;
}
.tl-seg span.on {
  color: #fff;
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
}
.tl-dialog-foot {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 4px;
}
.tl-btn-ghost {
  height: 36px;
  padding: 0 16px;
  border-radius: 9px;
  background: var(--bg-elevated);
  border: 1px solid #2e2e38;
  color: #cdccd8;
  font-size: 13px;
  cursor: pointer;
}
.tl-btn-ghost:hover {
  border-color: #3a3a46;
}
.tl-btn-primary {
  height: 36px;
  padding: 0 20px;
  border-radius: 9px;
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
  border: none;
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(124, 92, 252, 0.3);
}
.tl-btn-primary:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  box-shadow: none;
}
.tl-menu {
  min-width: 168px;
  background: #16161e;
  border: 1px solid #2a2a34;
  border-radius: 10px;
  padding: 5px;
  z-index: 1001;
  box-shadow: 0 14px 36px rgba(0, 0, 0, 0.5);
}
.tl-menu:focus {
  outline: none;
}
.tl-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  font-size: 12.5px;
  color: #cdccd8;
  border-radius: 7px;
  cursor: pointer;
  outline: none;
}
.tl-menu-item[data-highlighted] {
  background: rgba(124, 92, 252, 0.16);
  color: #fff;
}
.tl-menu-item.active {
  color: var(--accent-text);
}
.tl-menu-item.danger {
  color: #e0908b;
}
.tl-menu-item.danger[data-highlighted] {
  background: rgba(224, 68, 62, 0.16);
  color: #f1837d;
}
.tl-menu-sep {
  height: 1px;
  margin: 4px;
  background: #24242e;
}
</style>
