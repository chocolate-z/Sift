<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuTrigger
} from 'reka-ui'
import { useDatasetStore } from '@/stores/dataset'
import { useCompletedStore } from '@/stores/completed'
import { useDownloadsStore } from '@/stores/downloads'
import { downloadText, toMergedText, toCsv, toJson, toTxt } from '@/utils/export'
import { deleteDataset, listDatasets, loadDataset, storageAvailable, type SavedDatasetMeta } from '@/services/storage'
import { saveTextFile } from '@/services/download'
import { relTime } from '@/utils/time'

const router = useRouter()
const ds = useDatasetStore()
const completed = useCompletedStore()
const downloads = useDownloadsStore()

// 含「内容」列的数据集才给「导出文本 TXT」(把抓到的文本合并为一个文档)。
const hasText = computed(() => ds.active && ds.columns.some((c) => c.name === '内容'))

const formats = ['CSV', 'JSON', 'Excel', 'TXT', 'EPUB']
const exportFormat = ref('CSV')

// 跑过引擎且有行 → 真实数据动态表;否则空态。
const showReal = computed(() => ds.active && ds.rows.length > 0)
const activeCount = computed(() => ds.rows.length)
const fieldsLabel = computed(() => ds.columns.map((c) => c.name).join(' · '))
const firstField = computed(() => ds.columns[0]?.field)
const gridTemplate = computed(
  () => '44px ' + ds.columns.map((c) => (c.type === 'image' ? '130px' : 'minmax(0,1fr)')).join(' ')
)

const selected = ref<boolean[]>([])
watch(
  activeCount,
  (n) => {
    selected.value = Array.from({ length: n }, (_, i) => selected.value[i] ?? true)
  },
  { immediate: true }
)

const allChecked = computed(() => selected.value.length > 0 && selected.value.every(Boolean))
const indeterminate = computed(() => selected.value.some(Boolean) && !allChecked.value)
const selectedCount = computed(() => selected.value.filter(Boolean).length)
function toggleAll() {
  const v = !allChecked.value
  selected.value = selected.value.map(() => v)
}
function toggleRow(i: number) {
  selected.value[i] = !selected.value[i]
}
function cellText(v: string | null | undefined) {
  return v == null || v === '' ? '—' : v
}
function cellClass(field: string, type?: string) {
  if (type === 'image') return 'link mono'
  return field === firstField.value ? 'title' : ''
}
// 可下载列(图片/链接类型),其值为文件 URL。
const fileColumns = computed(() => ds.columns.filter((c) => c.type === 'image' || c.type === 'url'))
// 批量下载:收集选中行 图片/链接 列里的绝对 URL → 交下载队列(并发+实时进度)→ 跳下载队列屏。
function downloadSelected() {
  if (selectedCount.value === 0) return
  const urls: string[] = []
  ds.rows.forEach((r, i) => {
    if (!selected.value[i]) return
    for (const c of fileColumns.value) {
      const v = r[c.field]
      if (v && /^https?:\/\//i.test(v)) urls.push(v)
    }
  })
  const unique = [...new Set(urls)]
  if (!unique.length) return flashExport('选中行没有可下载的文件链接(图片/链接列)')
  if (!storageAvailable) return flashExport('文件下载仅桌面端可用')
  const source = ds.sourceName || '采集结果'
  const subdir = source.replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 60)
  // 不 await:下载在下载队列屏实时显示进度(队列 store 持有生命周期)。
  downloads.startBatch(unique, subdir, source)
  router.push('/downloads')
}

// 导出当前数据集。CSV/JSON/TXT 真导出;Excel/EPUB 待实现。仅真实数据(跑过引擎)可导。
const exportMsg = ref<string | null>(null)
let exportTimer: ReturnType<typeof setTimeout> | undefined
function flashExport(m: string) {
  exportMsg.value = m
  if (exportTimer) clearTimeout(exportTimer)
  exportTimer = setTimeout(() => (exportMsg.value = null), 2500)
}
function doExport(format: string) {
  exportFormat.value = format
  if (!showReal.value) return
  const safe = (ds.sourceName || 'sift-export').replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 40)
  try {
    // CSV 前置 BOM(U+FEFF),Excel 才能正确识别 UTF-8 中文。
    if (format === 'CSV')
      downloadText(`${safe}.csv`, String.fromCharCode(0xfeff) + toCsv(ds.columns, ds.rows), 'text/csv;charset=utf-8')
    else if (format === 'JSON')
      downloadText(`${safe}.json`, toJson(ds.columns, ds.rows), 'application/json;charset=utf-8')
    else if (format === 'TXT') downloadText(`${safe}.txt`, toTxt(ds.columns, ds.rows), 'text/plain;charset=utf-8')
    else return flashExport(`${format} 导出待实现,可先用 CSV / JSON / TXT`)
    flashExport(`已导出 ${format} · ${ds.rows.length} 条`)
  } catch (e) {
    flashExport(`导出失败:${e instanceof Error ? e.message : String(e)}`)
  }
}
// 导出文本:把含「内容」列的数据集排版为单个 TXT,经 Tauri 写盘到下载目录,并记入「已完成」。
const saving = ref(false)
async function exportText() {
  if (!hasText.value || !ds.rows.length || saving.value) return
  const safe = (String(ds.rows[0]?.['标题'] ?? '') || ds.sourceName || '采集结果')
    .replace(/[\\/:*?"<>|\s]+/g, '_')
    .slice(0, 60)
  const content = toMergedText(ds.columns, ds.rows)
  const bytes = new Blob([content]).size
  const size = bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`
  saving.value = true
  try {
    const path = await saveTextFile(`${safe}.txt`, content)
    if (cancelled) return
    completed.add({
      name: `${safe}.txt`,
      fileType: '文本',
      icon: 'txt',
      path,
      size,
      count: `${ds.rows.length} 条`,
      time: '刚刚',
      source: `来源 ${ds.sourceName || '采集结果'}`
    })
    flashExport(`已保存 ${ds.rows.length} 条 · ${size} → ${path}`)
  } catch (e) {
    flashExport(`保存失败:${e instanceof Error ? e.message : String(e)}`)
  } finally {
    saving.value = false
  }
}

let cancelled = false
onBeforeUnmount(() => {
  cancelled = true
  if (exportTimer) clearTimeout(exportTimer)
})

// 历史数据集(本地库已存的多次采集),头部「历史」下拉列出 → 切换 / 删除。
const histOpen = ref(false)
const history = ref<SavedDatasetMeta[]>([])

async function refreshHistory() {
  if (!storageAvailable) return
  try {
    history.value = await listDatasets()
  } catch {
    history.value = []
  }
}
// 打开下拉时刷新一遍,反映最新落库结果。
watch(histOpen, (open) => {
  if (open) refreshHistory()
})

async function loadInto(m: SavedDatasetMeta): Promise<boolean> {
  const blob = await loadDataset(m.id)
  if (cancelled || !blob) return false
  ds.setResult(blob.columns, blob.rows, m.source || m.name, [])
  ds.setCurrentId(m.id)
  return true
}

async function switchTo(m: SavedDatasetMeta) {
  histOpen.value = false
  if (m.id === ds.currentId) return
  try {
    await loadInto(m)
  } catch {
    // 忽略:读取失败维持当前展示。
  }
}

async function removeDataset(m: SavedDatasetMeta) {
  try {
    await deleteDataset(m.id)
  } catch {
    return
  }
  await refreshHistory()
  // 删的是正在展示的这条 → 回退到最近一个,没有则清空回种子。
  if (m.id === ds.currentId) {
    const top = history.value[0]
    if (top) {
      try {
        await loadInto(top)
      } catch {
        ds.clear()
      }
    } else {
      ds.clear()
    }
  }
}

// 本会话未跑引擎时,从本地库恢复最近一次采集结果(跨重启留存)。
// 每个 await 后复查 active/cancelled:防止恢复读取期间发生了新一轮采集时,
// 这个在途的旧恢复结果回来后覆盖掉刚抓到的新数据。
onMounted(async () => {
  if (!storageAvailable) return
  try {
    const metas = await listDatasets()
    if (cancelled) return
    history.value = metas
    if (ds.active) return
    const top = metas[0]
    if (!top) return
    const blob = await loadDataset(top.id)
    if (cancelled || ds.active) return
    if (blob) {
      ds.setResult(blob.columns, blob.rows, top.source || top.name, [])
      ds.setCurrentId(top.id)
    }
  } catch {
    // 忽略:无库 / 读取失败时维持种子演示。
  }
})
</script>

<template>
  <section class="view data">
    <header class="head">
      <div class="title-row">
        <h1>数据预览</h1>
        <span class="from-badge">
          <svg width="9" height="9" viewBox="0 0 16 16" fill="currentColor">
            <path d="M3 2l9 3.6-3.7 1.2L7 11.8 3 2z" />
          </svg>
          来自规则
        </span>
        <span class="title-sub">采集结果 · 点选与规则两条采集线汇聚于此</span>
      </div>

      <div class="status-row">
        <span class="grabbed">
          <svg
            width="13"
            height="13"
            viewBox="0 0 16 16"
            fill="none"
            stroke="#34D399"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round">
            <path d="M3 8.5l3 3 7-7" />
          </svg>
          抓取完成 · 已抓
          <span class="mono">{{ activeCount }}</span>
          条
        </span>
        <span class="fields">
          字段
          <span class="mono fv">{{ fieldsLabel }}</span>
        </span>
        <div class="sr-right">
          <DropdownMenuRoot v-if="storageAvailable" v-model:open="histOpen">
            <DropdownMenuTrigger as-child>
              <div class="hist-dd">
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="#9a9aa6"
                  stroke-width="1.5"
                  stroke-linecap="round"
                  stroke-linejoin="round">
                  <path d="M8 4.2V8l2.4 1.4" />
                  <path d="M2.6 8a5.4 5.4 0 1 0 1.3-3.5M2.6 4.5V7h2.5" />
                </svg>
                <span class="ed-label">历史</span>
                <span v-if="history.length" class="hist-count">{{ history.length }}</span>
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuPortal>
              <DropdownMenuContent class="dp-hist" align="end" :side-offset="6" @open-auto-focus.prevent>
                <div v-if="!history.length" class="dh-empty">暂无历史数据集</div>
                <div v-for="m in history" :key="m.id" class="dh-row" :class="{ current: m.id === ds.currentId }">
                  <button type="button" class="dh-main" @click="switchTo(m)">
                    <span class="dh-name">{{ m.name }}</span>
                    <span class="dh-meta">{{ m.rowCount }} 条 · {{ relTime(m.createdAt) }}</span>
                  </button>
                  <button type="button" class="dh-del" title="删除" @click="removeDataset(m)">
                    <svg
                      width="13"
                      height="13"
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="1.5"
                      stroke-linecap="round"
                      stroke-linejoin="round">
                      <path d="M3 4.5h10M6.5 4.5V3h3v1.5M5 4.5l.5 8h5l.5-8" />
                    </svg>
                  </button>
                </div>
              </DropdownMenuContent>
            </DropdownMenuPortal>
          </DropdownMenuRoot>
          <DropdownMenuRoot>
            <DropdownMenuTrigger as-child>
              <div class="export-dd">
                <span class="ed-label">导出</span>
                {{ exportFormat }}
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
              <DropdownMenuContent class="dp-menu" align="end" :side-offset="6">
                <DropdownMenuItem
                  v-for="f in formats"
                  :key="f"
                  class="dp-menu-item"
                  :class="{ active: exportFormat === f }"
                  @select="doExport(f)">
                  {{ f }}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenuPortal>
          </DropdownMenuRoot>
          <button v-if="hasText" type="button" class="btn-dl" :disabled="saving" @click="exportText">
            <svg
              width="13"
              height="13"
              viewBox="0 0 16 16"
              fill="none"
              stroke="#fff"
              stroke-width="1.6"
              stroke-linecap="round"
              stroke-linejoin="round">
              <path d="M8 3v7M5 7.5l3 2.7 3-2.7M3.5 13h9" />
            </svg>
            {{ saving ? '保存中…' : '导出文本 TXT' }}
          </button>
          <button v-else type="button" class="btn-dl" :disabled="selectedCount === 0" @click="downloadSelected">
            <svg
              width="13"
              height="13"
              viewBox="0 0 16 16"
              fill="none"
              stroke="#fff"
              stroke-width="1.6"
              stroke-linecap="round"
              stroke-linejoin="round">
              <path d="M8 3v7M5 7.5l3 2.7 3-2.7M3.5 13h9" />
            </svg>
            批量下载
          </button>
        </div>
      </div>

      <div class="formats">
        <span
          v-for="f in formats"
          :key="f"
          class="fmt-pill"
          :class="{ active: exportFormat === f }"
          @click="doExport(f)">
          {{ f }}
        </span>
        <span v-if="exportMsg" class="export-msg">{{ exportMsg }}</span>
      </div>
    </header>

    <div class="body">
      <!-- 真实数据(跑过引擎)· 列由规则 output 驱动 -->
      <template v-if="showReal">
        <div class="table">
          <div class="t-head" :style="{ gridTemplateColumns: gridTemplate }">
            <div class="th-check">
              <span class="checkbox" :class="{ on: allChecked || indeterminate }" @click="toggleAll">
                <svg
                  v-if="allChecked"
                  width="9"
                  height="9"
                  viewBox="0 0 16 16"
                  stroke="#fff"
                  stroke-width="2.6"
                  fill="none"
                  stroke-linecap="round"
                  stroke-linejoin="round">
                  <path d="M3 8.5l3 3 7-7" />
                </svg>
                <span v-else-if="indeterminate" class="cb-dash" />
              </span>
            </div>
            <div v-for="c in ds.columns" :key="c.field" class="th">{{ c.name }}</div>
          </div>
          <div
            v-for="(r, i) in ds.rows"
            :key="i"
            class="t-row"
            :class="{ last: i === ds.rows.length - 1 }"
            :style="{ gridTemplateColumns: gridTemplate }">
            <div class="td-check">
              <span class="checkbox" :class="{ on: selected[i] }" @click="toggleRow(i)">
                <svg
                  v-if="selected[i]"
                  width="9"
                  height="9"
                  viewBox="0 0 16 16"
                  stroke="#fff"
                  stroke-width="2.6"
                  fill="none"
                  stroke-linecap="round"
                  stroke-linejoin="round">
                  <path d="M3 8.5l3 3 7-7" />
                </svg>
              </span>
            </div>
            <div v-for="c in ds.columns" :key="c.field" class="td" :class="cellClass(c.field, c.type)">
              {{ cellText(r[c.field]) }}
            </div>
          </div>
        </div>
        <div class="vnote">
          <span class="vdot" />
          共 {{ ds.rows.length }} 条 · 来自 {{ ds.sourceName }}
          <span class="vdot" />
        </div>
      </template>

      <!-- 空态:未采集 / 本次无结果 -->
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
            <rect x="2.5" y="3" width="11" height="10" rx="1.5" />
            <path d="M2.5 6.5h11M6 6.5v6.5" />
          </svg>
        </div>
        <div class="empty-title">{{ ds.active ? '本次未抓到数据' : '还没有采集数据' }}</div>
        <div class="empty-desc">
          {{
            ds.active
              ? '规则已执行,但没有匹配到任何结果。可回到采集规则检查选择器或换个关键词。'
              : '导入采集规则并运行,或用点选采集,结果会显示在这里。'
          }}
        </div>
        <button type="button" class="btn-primary" @click="router.push('/import')">去采集</button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.data {
  display: flex;
  flex-direction: column;
  height: 100%;
  line-height: normal;
}
.head {
  flex: none;
  padding: 22px 28px 14px;
}
.title-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 4px;
}
.title-row h1 {
  margin: 0;
  font-size: 24px;
  font-weight: 700;
  letter-spacing: -0.02em;
}
.from-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  font-weight: 600;
  color: #9d83ff;
  background: rgba(124, 92, 252, 0.12);
  border: 1px solid #3a3066;
  border-radius: 5px;
  padding: 2px 8px;
}
.title-sub {
  font-size: 13px;
  color: var(--text-secondary);
}

/* 状态行 */
.status-row {
  display: flex;
  align-items: center;
  gap: 18px;
  margin-top: 10px;
}
.grabbed {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #5dd9b8;
}
.fields {
  font-size: 12px;
  color: var(--text-secondary);
}
.fields .fv {
  color: #cdccd8;
}
.sr-right {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 9px;
}
.export-dd {
  display: flex;
  align-items: center;
  gap: 7px;
  height: 36px;
  padding: 0 12px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 9px;
  font-size: 12px;
  color: #cdccd8;
  cursor: pointer;
}
.export-dd:hover {
  border-color: #33333f;
}
.ed-label {
  color: #7a7a87;
}
.hist-dd {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 36px;
  padding: 0 12px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 9px;
  font-size: 12px;
  color: #cdccd8;
  cursor: pointer;
}
.hist-dd:hover {
  border-color: #33333f;
}
.hist-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 8px;
  background: rgba(124, 92, 252, 0.18);
  color: var(--accent-text);
  font-size: 10px;
  font-weight: 600;
}
.btn-dl {
  display: flex;
  align-items: center;
  gap: 7px;
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
.btn-dl:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  box-shadow: none;
}

/* 格式 pill */
.formats {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-top: 11px;
}
.export-msg {
  margin-left: 4px;
  font-size: 11px;
  color: var(--success, #2dd4bf);
}
.fmt-pill {
  font-size: 11px;
  color: #9a9aa6;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 3px 9px;
  cursor: pointer;
}
.fmt-pill:hover {
  border-color: #33333f;
}
.fmt-pill.active {
  color: var(--accent-text);
  background: rgba(124, 92, 252, 0.12);
  border-color: #3a3066;
}

/* 表格 */
.body {
  flex: 1;
  overflow-y: auto;
  padding: 18px 28px 28px;
}
.table {
  border: 1px solid var(--border);
  border-radius: 11px;
  overflow: hidden;
}
.t-head,
.t-row {
  display: grid;
  grid-template-columns: 44px 80px 1fr 130px 130px;
  align-items: center;
}
.t-head {
  background: #13131a;
  border-bottom: 1px solid var(--border);
  font-size: 11px;
  color: #7a7a87;
  font-weight: 600;
}
.th-check {
  padding: 11px 0;
  display: flex;
  justify-content: center;
}
.th {
  padding: 11px 8px;
}
.t-row {
  background: var(--bg-card);
  border-bottom: 1px solid #1c1c24;
}
.t-row.last {
  border-bottom: 0;
}
.t-row:hover {
  background: #191921;
}
.td-check {
  display: flex;
  justify-content: center;
}
.checkbox {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  border-radius: 4px;
  border: 1.5px solid #3a3a46;
  cursor: pointer;
}
.checkbox.on {
  border: none;
  background: var(--accent);
}
.cb-dash {
  width: 8px;
  height: 2px;
  border-radius: 1px;
  background: #fff;
}
.td {
  padding: 8px;
}
.cover {
  width: 42px;
  height: 56px;
  border-radius: 4px;
  background: repeating-linear-gradient(45deg, #23232c, #23232c 5px, #2a2a34 5px, #2a2a34 10px);
}
.td.title {
  font-size: 13px;
  color: var(--text);
  font-weight: 500;
}
.td.price {
  font-size: 12.5px;
  color: var(--success);
  font-weight: 600;
}
.td.link {
  font-size: 10.5px;
  color: #8a86a6;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.vnote {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  margin-top: 14px;
  font-size: 11px;
  color: #56565f;
}
.vdot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #33333f;
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
  margin-bottom: 20px;
}
.btn-primary {
  height: 38px;
  padding: 0 18px;
  border-radius: 9px;
  border: none;
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(124, 92, 252, 0.3);
}
</style>

<style>
/* Reka 下拉 portal 到 body 外,scoped 够不着 → 全局样式(dp- 前缀避免外泄) */
.dp-menu {
  min-width: 132px;
  background: #16161e;
  border: 1px solid #2a2a34;
  border-radius: 10px;
  padding: 5px;
  z-index: 1001;
  box-shadow: 0 14px 36px rgba(0, 0, 0, 0.5);
}
.dp-menu:focus {
  outline: none;
}
.dp-menu-item {
  display: flex;
  align-items: center;
  padding: 7px 10px;
  font-size: 12.5px;
  color: #cdccd8;
  border-radius: 7px;
  cursor: pointer;
  outline: none;
}
.dp-menu-item[data-highlighted] {
  background: rgba(124, 92, 252, 0.16);
  color: #fff;
}
.dp-menu-item.active {
  color: var(--accent-text);
}

/* 历史数据集下拉(同样 portal 到 body 外,dh- 前缀) */
.dp-hist {
  min-width: 248px;
  max-width: 320px;
  max-height: 360px;
  overflow-y: auto;
  background: #16161e;
  border: 1px solid #2a2a34;
  border-radius: 10px;
  padding: 5px;
  z-index: 1001;
  box-shadow: 0 14px 36px rgba(0, 0, 0, 0.5);
}
.dp-hist:focus {
  outline: none;
}
.dh-empty {
  padding: 14px 12px;
  font-size: 12px;
  color: #7a7a87;
  text-align: center;
}
.dh-row {
  display: flex;
  align-items: center;
  gap: 4px;
  border-radius: 7px;
}
.dh-row:hover {
  background: rgba(124, 92, 252, 0.1);
}
.dh-row.current {
  background: rgba(124, 92, 252, 0.16);
}
.dh-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 7px 9px;
  background: none;
  border: none;
  text-align: left;
  cursor: pointer;
}
.dh-name {
  font-size: 12.5px;
  color: #e6e5ee;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dh-row.current .dh-name {
  color: var(--accent-text);
}
.dh-meta {
  font-size: 10.5px;
  color: #7a7a87;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dh-del {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  margin-right: 4px;
  border-radius: 6px;
  background: none;
  border: none;
  color: #6a6a76;
  cursor: pointer;
}
.dh-del:hover {
  background: rgba(224, 68, 62, 0.14);
  color: #e0443e;
}
</style>
