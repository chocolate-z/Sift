<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuTrigger
} from 'reka-ui'
import { useDatasetStore } from '@/stores/dataset'
import { downloadText, toCsv, toJson, toTxt } from '@/utils/export'

const router = useRouter()
const ds = useDatasetStore()

const formats = ['CSV', 'JSON', 'Excel', 'TXT', 'EPUB']
const exportFormat = ref('CSV')

// 1:1 演示种子(未跑引擎时显示,保持原视觉)。
const seedRows = [
  { title: '剑来', price: '¥39.00', img: '/img/12345.jpg' },
  { title: '大奉打更人', price: '¥28.00', img: '/img/12346.jpg' },
  { title: '诡秘之主', price: '¥45.00', img: '/img/12347.jpg' },
  { title: '凡人修仙传', price: '¥32.00', img: '/img/12348.jpg' },
  { title: '三体', price: '¥35.00', img: '/img/12349.jpg' }
]

// 跑过引擎(ds.active)走真实数据动态表;否则种子表。
const showReal = computed(() => ds.active && ds.rows.length > 0)
const activeCount = computed(() => (ds.active ? ds.rows.length : seedRows.length))
const fieldsLabel = computed(() => (ds.active ? ds.columns.map((c) => c.name).join(' · ') : '标题 · 价格 · 封面'))
const fromLabel = computed(() => (ds.active ? '来自规则' : '来自点选'))
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
function downloadSelected() {
  if (selectedCount.value === 0) return
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
onBeforeUnmount(() => {
  if (exportTimer) clearTimeout(exportTimer)
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
          {{ fromLabel }}
        </span>
        <span class="title-sub">书城商品列表 · 点选与规则两条采集线汇聚于此</span>
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
          <button type="button" class="btn-dl" :disabled="selectedCount === 0" @click="downloadSelected">
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

      <!-- 1:1 演示种子(未跑引擎) -->
      <template v-else-if="!ds.active">
        <div class="table">
          <div class="t-head">
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
            <div class="th">封面</div>
            <div class="th">标题</div>
            <div class="th">价格</div>
            <div class="th">封面链接</div>
          </div>
          <div v-for="(r, i) in seedRows" :key="r.title" class="t-row" :class="{ last: i === seedRows.length - 1 }">
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
            <div class="td">
              <div class="cover" />
            </div>
            <div class="td title">{{ r.title }}</div>
            <div class="td price mono">{{ r.price }}</div>
            <div class="td link mono">{{ r.img }}</div>
          </div>
        </div>
        <div class="vnote">
          <span class="vdot" />
          虚拟滚动 · 当前页可抓取 5 条,目标站点共 128 本
          <span class="vdot" />
        </div>
      </template>

      <!-- 跑过但无结果 -->
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
        <div class="empty-title">本次未抓到数据</div>
        <div class="empty-desc">规则已执行,但没有匹配到任何结果。可回到规则导入检查选择器或换个关键词。</div>
        <button type="button" class="btn-primary" @click="router.push('/import/paste')">回到规则</button>
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
</style>
