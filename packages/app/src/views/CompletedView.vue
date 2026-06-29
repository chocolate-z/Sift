<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuTrigger
} from 'reka-ui'
import { useCompletedStore, type DoneRecord } from '@/stores/completed'

const store = useCompletedStore()

const searchText = ref('')
const typeFilter = ref<'all' | '文本' | '图片' | '数据'>('all')
const typeLabel = computed(() => (typeFilter.value === 'all' ? '全部类型' : typeFilter.value))

const filtered = computed(() => {
  let list = store.records
  if (typeFilter.value !== 'all') list = list.filter((r) => r.fileType === typeFilter.value)
  const q = searchText.value.trim().toLowerCase()
  if (q) list = list.filter((r) => `${r.name}${r.source}${r.path}`.toLowerCase().includes(q))
  return list
})

// 文件操作(打开/定位/重导出/批量导出)属真实文件系统动作,留待 Tauri 集成;现给瞬时确认反馈
const flash = ref<{ id: number; act: string } | null>(null)
const exportFlash = ref(false)
let flashTimer: ReturnType<typeof setTimeout> | undefined
let exportTimer: ReturnType<typeof setTimeout> | undefined
function doFlash(id: number, act: string) {
  flash.value = { id, act }
  if (flashTimer) clearTimeout(flashTimer)
  flashTimer = setTimeout(() => (flash.value = null), 1200)
}
function isFlash(id: number, act: string) {
  return flash.value?.id === id && flash.value?.act === act
}
function actLabel(r: DoneRecord, act: string, base: string, done: string) {
  return isFlash(r.id, act) ? done : base
}
function batchExport() {
  exportFlash.value = true
  if (exportTimer) clearTimeout(exportTimer)
  exportTimer = setTimeout(() => (exportFlash.value = false), 1200)
}
onBeforeUnmount(() => {
  if (flashTimer) clearTimeout(flashTimer)
  if (exportTimer) clearTimeout(exportTimer)
})
</script>

<template>
  <section class="view done">
    <header class="head">
      <h1>已完成</h1>
      <p class="sub">已完成的下载与采集结果 · 可再次打开、导出或定位文件</p>
      <div class="toolbar">
        <div class="search">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#6a6a76" stroke-width="1.4">
            <circle cx="7" cy="7" r="4.5" />
            <path d="M10.5 10.5L14 14" />
          </svg>
          <input class="mono" placeholder="搜索文件名 / 来源…" v-model="searchText" />
        </div>
        <DropdownMenuRoot>
          <DropdownMenuTrigger as-child>
            <div class="dropdown">
              {{ typeLabel }}
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
            <DropdownMenuContent class="cp-menu" align="start" :side-offset="6">
              <DropdownMenuItem
                class="cp-menu-item"
                :class="{ active: typeFilter === 'all' }"
                @select="typeFilter = 'all'">
                全部类型
              </DropdownMenuItem>
              <DropdownMenuItem
                class="cp-menu-item"
                :class="{ active: typeFilter === '文本' }"
                @select="typeFilter = '文本'">
                文本
              </DropdownMenuItem>
              <DropdownMenuItem
                class="cp-menu-item"
                :class="{ active: typeFilter === '图片' }"
                @select="typeFilter = '图片'">
                图片
              </DropdownMenuItem>
              <DropdownMenuItem
                class="cp-menu-item"
                :class="{ active: typeFilter === '数据' }"
                @select="typeFilter = '数据'">
                数据
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenuPortal>
        </DropdownMenuRoot>
        <div class="tb-right">
          <button type="button" class="btn-soft" @click="batchExport">
            {{ exportFlash ? '已导出 ✓' : '批量导出' }}
          </button>
          <button type="button" class="btn-danger" @click="store.clear()">批量删除</button>
        </div>
      </div>
    </header>

    <div class="body">
      <!-- 有记录 -->
      <div v-if="filtered.length" class="list">
        <div v-for="r in filtered" :key="r.id" class="done-row">
          <span class="file-ico" :class="r.icon">
            <svg
              v-if="r.icon === 'txt'"
              width="17"
              height="17"
              viewBox="0 0 16 16"
              fill="none"
              stroke="#9d83ff"
              stroke-width="1.4"
              stroke-linecap="round"
              stroke-linejoin="round">
              <path d="M4 2.5h5l3 3V13.5H4z" />
              <path d="M9 2.5v3h3M6 9h4M6 11h3" />
            </svg>
            <svg
              v-else-if="r.icon === 'img'"
              width="17"
              height="17"
              viewBox="0 0 16 16"
              fill="none"
              stroke="#5dd9b8"
              stroke-width="1.4"
              stroke-linecap="round"
              stroke-linejoin="round">
              <rect x="2.5" y="3.5" width="11" height="9" rx="1.5" />
              <path d="M2.5 10l3-2.5 2.5 2 2.5-3 3 3.5" />
              <circle cx="6" cy="6.2" r="1" />
            </svg>
            <svg
              v-else
              width="17"
              height="17"
              viewBox="0 0 16 16"
              fill="none"
              stroke="#E0A85A"
              stroke-width="1.4"
              stroke-linecap="round"
              stroke-linejoin="round">
              <rect x="2.5" y="3" width="11" height="10" rx="1.5" />
              <path d="M2.5 6.5h11M6 6.5v6.5M10 6.5v6.5" />
            </svg>
          </span>

          <div class="dr-main">
            <div class="dr-title">
              <span class="dr-name">{{ r.name }}</span>
              <span class="file-chip">{{ r.fileType }}</span>
            </div>
            <span class="dr-path mono">{{ r.path }}</span>
          </div>

          <div class="dr-metrics">
            <div class="metric">
              <div class="m-val">{{ r.size }}</div>
              <div class="m-label">{{ r.count }}</div>
            </div>
            <div class="metric">
              <div class="m-val">{{ r.time }}</div>
              <div class="m-label">{{ r.source }}</div>
            </div>
          </div>

          <div class="dr-actions">
            <span class="act open" @click="doFlash(r.id, 'open')">{{ actLabel(r, 'open', '打开', '已打开 ✓') }}</span>
            <span class="act" @click="doFlash(r.id, 'locate')">{{ actLabel(r, 'locate', '定位', '已定位 ✓') }}</span>
            <span class="act" @click="doFlash(r.id, 'export')">{{ actLabel(r, 'export', '重导出', '已导出 ✓') }}</span>
            <span class="act del" @click="store.remove(r.id)">删除</span>
          </div>
        </div>
      </div>

      <!-- 空态 -->
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
            <path d="M3 8.5l3 3 7-7" />
          </svg>
        </div>
        <div class="empty-title">
          {{ searchText.trim() || typeFilter !== 'all' ? '没有匹配的记录' : '还没有完成记录' }}
        </div>
        <div class="empty-desc">完成的下载与导出会归档在这里,可随时重新打开、导出或定位文件。</div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.done {
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

/* 工具栏 */
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
.dropdown {
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
.dropdown:hover {
  border-color: #33333f;
}
.tb-right {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 9px;
}
.btn-soft {
  height: 36px;
  padding: 0 14px;
  border-radius: 9px;
  background: var(--bg-elevated);
  border: 1px solid #2e2e38;
  color: #cdccd8;
  font-size: 12.5px;
  cursor: pointer;
}
.btn-soft:hover {
  border-color: #3a3a46;
}
.btn-danger {
  height: 36px;
  padding: 0 14px;
  border-radius: 9px;
  background: var(--bg-elevated);
  border: 1px solid #4a2a2a;
  color: #f1a8a4;
  font-size: 12.5px;
  cursor: pointer;
}
.btn-danger:hover {
  border-color: var(--danger);
}

/* 列表 */
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
.done-row {
  display: flex;
  align-items: center;
  gap: 16px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 11px;
  padding: 13px 16px;
}
.done-row:hover {
  border-color: #33333f;
  background: #191921;
}
.file-ico {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  flex: none;
  border-radius: 9px;
}
.file-ico.txt {
  background: #1d1830;
  border: 1px solid #2e2747;
}
.file-ico.img {
  background: #13251f;
  border: 1px solid #1f3d33;
}
.file-ico.data {
  background: #22201a;
  border: 1px solid #3a3526;
}
.dr-main {
  flex: 1;
  min-width: 0;
}
.dr-title {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-bottom: 4px;
}
.dr-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
}
.file-chip {
  font-size: 10px;
  color: #9a9aa6;
  background: var(--bg);
  border: 1px solid #2a2a34;
  border-radius: 5px;
  padding: 1px 7px;
}
.dr-path {
  font-size: 11px;
  color: #8a86a6;
}
.dr-metrics {
  flex: none;
  display: flex;
  gap: 22px;
  font-size: 11.5px;
  color: var(--text-secondary);
  text-align: right;
}
.m-val {
  color: #cdccd8;
  font-weight: 600;
}
.m-label {
  font-size: 10px;
}
.dr-actions {
  flex: none;
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 12px;
}
.act {
  color: #8a8a99;
  cursor: pointer;
}
.act:hover {
  color: #cdccd8;
}
.act.open {
  color: var(--accent-text);
}
.act.open:hover {
  color: #cdb8ff;
}
.act.del {
  color: #9a6a72;
}
.act.del:hover {
  color: var(--danger);
}

/* 空态 */
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
}
</style>

<style>
/* Reka 下拉 portal 到 body 外,scoped 够不着 → 全局样式(cp- 前缀避免外泄) */
.cp-menu {
  min-width: 132px;
  background: #16161e;
  border: 1px solid #2a2a34;
  border-radius: 10px;
  padding: 5px;
  z-index: 1001;
  box-shadow: 0 14px 36px rgba(0, 0, 0, 0.5);
}
.cp-menu:focus {
  outline: none;
}
.cp-menu-item {
  display: flex;
  align-items: center;
  padding: 7px 10px;
  font-size: 12.5px;
  color: #cdccd8;
  border-radius: 7px;
  cursor: pointer;
  outline: none;
}
.cp-menu-item[data-highlighted] {
  background: rgba(124, 92, 252, 0.16);
  color: #fff;
}
.cp-menu-item.active {
  color: var(--accent-text);
}
</style>
