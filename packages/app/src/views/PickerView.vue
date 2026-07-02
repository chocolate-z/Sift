<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { ChevronDown, Pencil, Search, TriangleAlert } from 'lucide-vue-next'
import { useRouter } from 'vue-router'
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuTrigger
} from 'reka-ui'
import { compileVisualRule, type VisualField } from '@sift/visual-picker'
import { useTasksStore } from '@/stores/tasks'
import { isTauri, runRule } from '@/services/engine'
import { highlightInPicker, onPickerCount, onPickerSelected, openPicker } from '@/services/picker'
import { saveDataset } from '@/services/storage'
import { useDatasetStore } from '@/stores/dataset'

const router = useRouter()
const tasks = useTasksStore()
const dataset = useDatasetStore()

const pickMode = ref(true)
const pickedTitle = ref('示例条目 2')
const page = ref(1)
const url = ref('https://example.com/list')
const listSelector = ref('')
const running = ref(false)
const runErr = ref<string | null>(null)
const runNotice = ref<string | null>(null)

const books = [
  { title: '示例条目 1', price: '¥39.00' },
  { title: '示例条目 2', price: '¥28.00' },
  { title: '示例条目 3', price: '¥45.00' },
  { title: '示例条目 4', price: '¥32.00' },
  { title: '示例条目 5', price: '¥35.00' }
]

let uid = 0
interface Field {
  id: number
  name: string
  selector: string
  type: string
  robust: number
  robustLabel: string
  attr: string
  dot: string
  lazy?: boolean
  /** 点选窗口回传的实时匹配数(undefined=未高亮,-1=无效,-2=空)。 */
  match?: number
}
const TYPE_OPTS = ['文本', '数字', '图片', '链接']
const ATTR_OPTS = ['文本', '@href', '@src', '@data-src']
const fields = ref<Field[]>([
  {
    id: ++uid,
    name: '标题',
    selector: '.title',
    type: '文本',
    robust: 3,
    robustLabel: '良好',
    attr: '文本',
    dot: 'var(--accent)'
  },
  {
    id: ++uid,
    name: '价格',
    selector: '.price',
    type: '数字',
    robust: 4,
    robustLabel: '优秀',
    attr: '文本',
    dot: '#2dd4bf'
  },
  {
    id: ++uid,
    name: '封面图',
    selector: 'img',
    type: '图片',
    robust: 2,
    robustLabel: '一般',
    attr: '@data-src',
    dot: 'var(--accent)',
    lazy: true
  }
])
function pickCard(title: string) {
  if (pickMode.value) pickedTitle.value = title
}
function addField() {
  fields.value.push({
    id: ++uid,
    name: '新字段',
    selector: '.product-card .field',
    type: '文本',
    robust: 3,
    robustLabel: '良好',
    attr: '文本',
    dot: 'var(--accent)'
  })
}
function removeField(id: number) {
  const i = fields.value.findIndex((f) => f.id === id)
  if (i >= 0) fields.value.splice(i, 1)
}
// 点选:铅笔图标 → 标记当前字段为「待填」,打开点选 WebView;在真实页面点元素即回填。
const activePickFieldId = ref<number | null>(null)
let unlistenPick: (() => void) | null = null
async function openPage() {
  runErr.value = null
  if (!url.value.trim()) {
    runErr.value = '请先填写目标网址'
    return
  }
  try {
    await openPicker(url.value.trim())
  } catch (e) {
    runErr.value = e instanceof Error ? e.message : String(e)
  }
}
async function startPick(id: number) {
  activePickFieldId.value = id
  await openPage()
}

let unlistenCount: (() => void) | null = null
let lastPreviewId: number | null = null
// 字段选择器在有「列表项」时是相对之的 → 高亮/计数时拼成整列选择器。
function fullSelector(f: Field): string {
  const ls = listSelector.value.trim()
  const s = f.selector.trim()
  return ls && s ? `${ls} ${s}` : s || ls
}
// 编辑/聚焦某字段选择器 → 请求点选窗口高亮所有匹配元素(回传匹配数走 onPickerCount)。
function previewField(f: Field) {
  lastPreviewId = f.id
  highlightInPicker(fullSelector(f))
}
// 编辑「列表项」选择器 → 高亮所有列表容器/项(不归属某字段,故不记 lastPreviewId)。
function onListSelectorInput() {
  lastPreviewId = null
  highlightInPicker(listSelector.value.trim())
}
function matchLabel(f: Field): string {
  if (f.match == null) return '未高亮'
  if (f.match === -1) return '选择器无效'
  if (f.match === -2) return '空'
  return `匹配 ${f.match} 项`
}

// 归一化点选屏字段 → compileVisualRule 输入(去中文/@前缀)。
function normAttr(a: string): string | undefined {
  return !a || a === '文本' ? undefined : a.replace(/^@/, '')
}
function normType(t: string): VisualField['type'] {
  if (t === '图片') return 'image'
  if (t === '链接') return 'url'
  if (t === '数字') return 'number'
  return 'string'
}
// 预览数据:网址 + 列表项选择器 + 字段 → compileVisualRule → runRule → /data。
async function runPreview() {
  runErr.value = null
  runNotice.value = null
  const spec = {
    url: url.value.trim(),
    listSelector: listSelector.value.trim() || undefined,
    fields: fields.value
      .filter((f) => f.name.trim() && f.selector.trim())
      .map((f) => ({
        name: f.name.trim(),
        selector: f.selector.trim(),
        attr: normAttr(f.attr),
        type: normType(f.type)
      }))
  }
  if (!spec.url) {
    runErr.value = '请先填写目标网址'
    return
  }
  if (!spec.fields.length) {
    runErr.value = '请先添加至少一个带选择器的字段'
    return
  }
  const rule = compileVisualRule(spec)
  dataset.setLastRun(rule, {})
  if (!isTauri) {
    runNotice.value = '真实运行仅桌面端可用(浏览器预览无 Tauri 引擎)。请用 pnpm tauri:dev 运行。'
    return
  }
  running.value = true
  try {
    const out = await runRule(rule, {})
    const cols = rule.output.columns.map((c) => ({ name: c.name, field: c.name, type: c.type }))
    dataset.setResult(cols, out.records, rule.meta.name, out.warnings)
    if (out.records.length) {
      saveDataset(rule.meta.name, rule.meta.name, cols, out.records)
        .then((id) => dataset.setCurrentId(id))
        .catch(() => {})
    }
    router.push('/data')
  } catch (e) {
    const msg = e instanceof Error ? e.message : typeof e === 'string' ? e : JSON.stringify(e)
    runErr.value = `运行失败:${msg}`
  } finally {
    running.value = false
  }
}

// 加载 / 完成 / 保存为任务 —— 部分动作待引擎,现给瞬时反馈
const flash = ref<string | null>(null)
let flashTimer: ReturnType<typeof setTimeout> | undefined
function showFlash(key: string) {
  flash.value = key
  if (flashTimer) clearTimeout(flashTimer)
  flashTimer = setTimeout(() => (flash.value = null), 1300)
}
function saveAsTask() {
  tasks.addTask({
    name: '示例列表',
    type: 'pick',
    url: 'example.com/list',
    fields: String(fields.value.length),
    lastRun: '从未运行',
    result: '—',
    status: 'ready'
  })
  showFlash('save')
}
function addPageRule() {
  showFlash('page')
}
onMounted(async () => {
  unlistenPick = await onPickerSelected((r) => {
    // 每次点选都用最新检测到的容器刷新「列表项」——点另一个列表即切到新列表(同列表则同值)。
    if (r.container) listSelector.value = r.container
    const f = fields.value.find((x) => x.id === activePickFieldId.value)
    if (r.field) {
      // 点中项内具体元素 → 填该字段。
      if (f) {
        f.selector = r.field
        runNotice.value = null
        previewField(f)
      }
    } else {
      // 点中的是整个列表项本身(非项内字段)→ 只带入列表项,提示点选项内字段,并高亮整列。
      runNotice.value = '已带入「列表项」,请在弹窗里点选项内的具体字段(如标题、价格)'
      lastPreviewId = null
      highlightInPicker(listSelector.value)
    }
  })
  unlistenCount = await onPickerCount((n) => {
    const f = fields.value.find((x) => x.id === lastPreviewId)
    if (f) f.match = n
  })
})
onBeforeUnmount(() => {
  if (flashTimer) clearTimeout(flashTimer)
  unlistenPick?.()
  unlistenCount?.()
})
</script>

<template>
  <section class="view pick">
    <header class="view-head">
      <div>
        <h1>点选采集</h1>
        <p class="sub">在左侧页面点击元素即可选取 · 像圈图一样选数据</p>
      </div>
    </header>

    <div class="preview-note">
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="#d8b27a" stroke-width="1.5">
        <circle cx="8" cy="8" r="6.2" />
        <path d="M8 7.4v3.4M8 5.2v.01" stroke-linecap="round" />
      </svg>
      <span>
        填目标网址,点字段旁
        <b>铅笔图标</b>
        弹出真实页面
        <b>点选取</b>
        (JS 站也可),或直接
        <b>输入/编辑选择器</b>
        ——编辑时会在页面里实时高亮匹配元素;点「预览数据」采集。左侧为示意缩略,真实页面在弹出窗口。
      </span>
    </div>

    <!-- url toolbar -->
    <div class="urlbar">
      <div class="url-input">
        <Search :size="15" class="ico" />
        <input class="url-field mono" v-model="url" spellcheck="false" placeholder="输入网址后点「打开」加载页面…" />
      </div>
      <span class="chip ok">
        <i class="dot ok" />
        已加载
      </span>
      <button type="button" class="btn ghost" @click="openPage">打开点选</button>
      <button type="button" class="btn" @click="showFlash('done')">{{ flash === 'done' ? '已完成 ✓' : '完成' }}</button>
      <label class="toggle-wrap">
        <span>点选模式</span>
        <span class="toggle" :class="{ on: pickMode }" @click="pickMode = !pickMode"><i /></span>
      </label>
    </div>

    <!-- legend bar -->
    <div class="subbar">
      <span class="legend">
        <i class="sq hover" />
        悬停
      </span>
      <span class="legend">
        <i class="sq col" />
        已选整列
      </span>
      <span class="spacer" />
      <span class="muted">{{ pickMode ? '实时预览 · 双向同步' : '点选模式已关闭' }}</span>
    </div>

    <div class="pick-body">
      <!-- preview: rendered target page -->
      <div class="preview">
        <div class="mini-head">
          <span class="mini-brand">示例站点 Example</span>
          <div class="mini-search">搜索…</div>
          <nav class="mini-nav">
            <a>分类</a>
            <a>排行</a>
            <a class="active">列表</a>
          </nav>
        </div>
        <div class="crumb">首页 / 列表 · 共 24 项</div>
        <div class="grid">
          <div
            v-for="b in books"
            :key="b.title"
            class="pcard"
            :class="{ picked: b.title === pickedTitle, pickable: pickMode }"
            @click="pickCard(b.title)">
            <div class="pimg" />
            <div class="ptitle-wrap">
              <span v-if="b.title === pickedTitle" class="tag">a.title · 同列 5</span>
              <div class="ptitle">{{ b.title }}</div>
            </div>
            <div class="pprice">{{ b.price }}</div>
          </div>
        </div>
        <div class="pager">
          <span v-for="n in 3" :key="n" class="pg" :class="{ active: page === n }" @click="page = n">{{ n }}</span>
          <span class="pg next" @click="page = Math.min(3, page + 1)">下一页 ›</span>
        </div>
      </div>

      <!-- selected fields panel -->
      <aside class="fields">
        <div class="fields-head">
          <span class="fh-title">
            已选字段
            <b>{{ fields.length }}</b>
          </span>
          <span class="fh-ok">✓ 每列匹配 5 项</span>
        </div>

        <div class="list-sel">
          <span class="ls-k">列表项</span>
          <input
            v-model="listSelector"
            class="ls-v mono"
            placeholder="重复项容器选择器,如 .product-card(留空 = 单页抽取)"
            spellcheck="false"
            @input="onListSelectorInput" />
        </div>

        <div class="fields-scroll">
          <div v-for="f in fields" :key="f.id" class="fcard">
            <div class="fc-top">
              <i class="fdot" :style="{ background: f.dot }" />
              <input class="fname" v-model="f.name" />
              <span class="fc-label">字段名</span>
            </div>
            <div class="fc-sel">
              <span class="sel-k">选择器</span>
              <input class="sel-v mono" v-model="f.selector" @focus="previewField(f)" @input="previewField(f)" />
              <Pencil
                :size="13"
                class="sel-edit"
                :class="{ picking: activePickFieldId === f.id }"
                title="在页面上点选此字段"
                @click="startPick(f.id)" />
            </div>
            <div class="fc-row">
              <DropdownMenuRoot>
                <DropdownMenuTrigger as-child>
                  <span class="dd">
                    {{ f.type }}
                    <ChevronDown :size="13" />
                  </span>
                </DropdownMenuTrigger>
                <DropdownMenuPortal>
                  <DropdownMenuContent class="pk-menu" align="start" :side-offset="6">
                    <DropdownMenuItem
                      v-for="t in TYPE_OPTS"
                      :key="t"
                      class="pk-menu-item"
                      :class="{ active: f.type === t }"
                      @select="f.type = t">
                      {{ t }}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenuPortal>
              </DropdownMenuRoot>
              <span class="chip ok sm" :class="{ bad: (f.match ?? 0) < 0 }">{{ matchLabel(f) }}</span>
            </div>
            <div v-if="f.lazy" class="fc-warn">
              <TriangleAlert :size="13" />
              检测到懒加载,已自动取 @data-src
            </div>
            <div class="fc-bottom">
              <span class="robust">
                稳健性
                <i v-for="n in 5" :key="n" class="rdot" :class="{ on: n <= f.robust }" />
                {{ f.robustLabel }}
              </span>
              <DropdownMenuRoot>
                <DropdownMenuTrigger as-child>
                  <span class="dd sm">
                    取属性 {{ f.attr }}
                    <ChevronDown :size="13" />
                  </span>
                </DropdownMenuTrigger>
                <DropdownMenuPortal>
                  <DropdownMenuContent class="pk-menu" align="end" :side-offset="6">
                    <DropdownMenuItem
                      v-for="a in ATTR_OPTS"
                      :key="a"
                      class="pk-menu-item"
                      :class="{ active: f.attr === a }"
                      @select="f.attr = a">
                      {{ a }}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenuPortal>
              </DropdownMenuRoot>
              <button type="button" class="del" @click="removeField(f.id)">删除</button>
            </div>
          </div>
        </div>

        <div class="fields-actions">
          <div class="add-row">
            <button type="button" class="add" @click="addField">+ 手动添加字段</button>
            <button type="button" class="add" @click="addPageRule">
              {{ flash === 'page' ? '✓ 已添加分页规则' : '+ 分页规则' }}
            </button>
          </div>
          <div v-if="runErr" class="run-msg err">✕ {{ runErr }}</div>
          <div v-else-if="runNotice" class="run-msg notice">{{ runNotice }}</div>
          <div class="fields-foot">
            <button type="button" class="btn primary wide" :disabled="running" @click="runPreview">
              {{ running ? '采集中…' : '预览数据' }}
            </button>
            <button type="button" class="btn ghost" @click="saveAsTask">
              {{ flash === 'save' ? '已保存 ✓' : '保存为任务' }}
            </button>
          </div>
        </div>
      </aside>
    </div>
  </section>
</template>

<style scoped>
.pick {
  display: flex;
  flex-direction: column;
  height: 100%;
}

/* url toolbar */
.view-head {
  padding: 14px 24px 6px;
  border-bottom: 0;
}
.preview-note {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 2px 24px 0;
  padding: 8px 12px;
  border-radius: 9px;
  background: rgba(224, 168, 90, 0.08);
  border: 1px solid rgba(224, 168, 90, 0.28);
  font-size: 12px;
  color: #d8b27a;
  line-height: 1.5;
}
.preview-note svg {
  flex: none;
}
.preview-note b {
  color: #e8c58a;
  font-weight: 700;
}
.pn-link {
  background: none;
  border: none;
  color: var(--accent-text);
  font-size: 12px;
  cursor: pointer;
  padding: 0;
}
.pn-link:hover {
  text-decoration: underline;
}
.list-sel {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 10px;
}
.ls-k {
  flex: none;
  font-size: 11px;
  color: #7a7a87;
}
.ls-v {
  flex: 1;
  min-width: 0;
  height: 30px;
  padding: 0 10px;
  background: #0b0b11;
  border: 1px solid #24242e;
  border-radius: 8px;
  color: #cdccd8;
  font-size: 12px;
  outline: none;
}
.ls-v:focus {
  border-color: var(--accent);
}
.run-msg {
  margin: 0 0 9px;
  font-size: 11.5px;
  line-height: 1.5;
}
.run-msg.err {
  color: #f1837d;
}
.run-msg.notice {
  color: #d8b27a;
}
.urlbar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 24px;
}
.url-input {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 34px;
  padding: 0 12px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 9px;
  color: var(--text-secondary);
}
.url-input .mono {
  font-size: 12.5px;
  color: var(--text);
}
.url-field {
  flex: 1;
  min-width: 0;
  background: none;
  border: none;
  outline: none;
  color: var(--text);
  font-size: 12.5px;
}
.url-field::placeholder {
  color: var(--text-dim);
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 9px;
  border-radius: 7px;
  font-size: 12px;
  color: var(--text-secondary);
  background: var(--bg-card);
  border: 1px solid var(--border);
}
.chip.ok {
  color: var(--success);
}
.chip.sm {
  padding: 2px 7px;
  font-size: 11px;
}
.chip.bad {
  color: #f1837d;
}
.btn {
  height: 32px;
  padding: 0 14px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--bg-card);
  color: var(--text);
  font-size: 13px;
  cursor: pointer;
}
.btn.ghost {
  background: none;
}
.btn:hover {
  border-color: var(--text-dim);
}
.btn.primary {
  border: 0;
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
  color: #fff;
  font-weight: 600;
}
.btn.wide {
  flex: 1;
  height: 38px;
}
.muted {
  color: var(--text-dim);
  font-size: 12.5px;
}
.toggle-wrap {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  font-size: 13px;
  color: var(--text);
  cursor: pointer;
}
.toggle {
  width: 38px;
  height: 21px;
  border-radius: 11px;
  background: var(--border);
  position: relative;
}
.toggle.on {
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
}
.toggle i {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 17px;
  height: 17px;
  border-radius: 50%;
  background: #fff;
  transition: left 0.15s;
}
.toggle.on i {
  left: 19px;
}

/* legend bar */
.subbar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 4px 24px 0;
  font-size: 12px;
  color: var(--text-secondary);
}
.subbar .spacer {
  flex: 1;
}
.legend {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.sq {
  width: 10px;
  height: 10px;
  border-radius: 3px;
  border: 1.5px solid var(--accent);
}
.sq.col {
  border-color: var(--success);
}

/* body split */
.pick-body {
  flex: 1;
  display: flex;
  gap: 16px;
  padding: 12px 24px 20px;
  min-height: 0;
}

/* preview panel */
.preview {
  flex: 1;
  min-width: 0;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 18px 20px;
  overflow-y: auto;
}
.mini-head {
  display: flex;
  align-items: center;
  gap: 16px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--border-subtle);
}
.mini-brand {
  font-weight: 700;
  color: var(--accent-text);
  font-size: 14px;
}
.mini-search {
  width: 220px;
  height: 30px;
  display: flex;
  align-items: center;
  padding: 0 12px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text-dim);
  font-size: 12px;
}
.mini-nav {
  display: flex;
  gap: 16px;
  margin-left: auto;
  font-size: 13px;
  color: var(--text-secondary);
}
.mini-nav .active {
  color: var(--text);
  font-weight: 600;
}
.crumb {
  padding: 14px 0;
  color: var(--text-secondary);
  font-size: 12.5px;
}
.grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 12px;
}
.pcard {
  border: 1px solid transparent;
  border-radius: 8px;
}
.pcard.pickable {
  cursor: pointer;
}
.pcard.pickable:hover .ptitle {
  border-color: var(--accent);
}
.pcard.picked {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}
.pimg {
  height: 116px;
  border-radius: 6px;
  background: repeating-linear-gradient(45deg, #e6e6ec, #e6e6ec 5px, #dcdce4 5px, #dcdce4 10px);
}
.ptitle-wrap {
  position: relative;
  margin-top: 10px;
}
.tag {
  position: absolute;
  top: -16px;
  left: 0;
  padding: 1px 6px;
  background: var(--accent);
  color: #fff;
  border-radius: 5px;
  font-size: 10.5px;
  white-space: nowrap;
}
.ptitle {
  padding: 3px 6px;
  border: 1.5px solid var(--success);
  border-radius: 5px;
  font-size: 13px;
  color: var(--text);
}
.pcard.picked .ptitle {
  border-color: var(--accent);
}
.pprice {
  margin-top: 6px;
  padding-left: 6px;
  color: var(--text-secondary);
  font-size: 13px;
}
.pager {
  display: flex;
  gap: 6px;
  margin-top: 18px;
}
.pg {
  min-width: 26px;
  height: 26px;
  display: grid;
  place-items: center;
  padding: 0 6px;
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-secondary);
  font-size: 12.5px;
  cursor: pointer;
}
.pg.active {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}
.pg.next {
  color: var(--text-dim);
}

/* fields panel */
.fields {
  width: 358px;
  flex: none;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.fields-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.fields-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-top: 12px;
}
.fields-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}
.fh-title {
  font-size: 14px;
  font-weight: 600;
}
.fh-title b {
  color: var(--accent-text);
}
.fh-ok {
  font-size: 12px;
  color: var(--success);
}
.fcard {
  padding: 12px 13px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}
.fc-top {
  display: flex;
  align-items: center;
  gap: 8px;
}
.fdot {
  width: 9px;
  height: 9px;
  border-radius: 3px;
  flex: none;
}
.fname {
  flex: 1;
  min-width: 0;
  padding: 5px 9px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 7px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  outline: none;
}
.fname:focus {
  border-color: var(--accent);
}
.fc-label {
  color: var(--text-dim);
  font-size: 11.5px;
  flex: none;
}
.fc-sel {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 9px;
  padding: 6px 10px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 7px;
}
.sel-k {
  color: var(--text-dim);
  font-size: 11.5px;
  flex: none;
}
.sel-v {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  color: var(--accent-text);
  background: none;
  border: none;
  outline: none;
}
.sel-edit {
  color: var(--text-dim);
  cursor: pointer;
  flex: none;
}
.sel-edit:hover {
  color: var(--accent-text);
}
.sel-edit.picking {
  color: var(--accent);
}
.fc-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 9px;
}
.dd {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 9px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 7px;
  font-size: 12px;
  color: var(--text);
  cursor: pointer;
}
.dd:hover {
  border-color: var(--text-dim);
}
.dd.sm {
  font-size: 11.5px;
  padding: 3px 8px;
}
.fc-warn {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 9px;
  padding: 6px 9px;
  background: rgba(224, 168, 90, 0.1);
  border: 1px solid rgba(224, 168, 90, 0.3);
  border-radius: 7px;
  color: var(--warning);
  font-size: 11.5px;
}
.fc-bottom {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 11px;
}
.robust {
  flex: 1;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 11.5px;
  color: var(--text-secondary);
}
.rdot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--border);
}
.rdot.on {
  background: var(--accent);
}
.del {
  background: none;
  border: 0;
  color: var(--text-dim);
  font-size: 11.5px;
  cursor: pointer;
}
.del:hover {
  color: var(--danger);
}
.add-row {
  display: flex;
  gap: 10px;
}
.add {
  flex: 1;
  padding: 8px;
  background: none;
  border: 1px dashed var(--border);
  border-radius: 8px;
  color: var(--text-secondary);
  font-size: 12.5px;
  cursor: pointer;
}
.add:hover {
  border-color: var(--accent);
  color: var(--text);
}
.fields-foot {
  display: flex;
  gap: 10px;
}
</style>

<style>
/* Reka 下拉 portal 到 body 外,scoped 够不着 → 全局样式(pk- 前缀避免外泄) */
.pk-menu {
  min-width: 120px;
  background: #16161e;
  border: 1px solid #2a2a34;
  border-radius: 10px;
  padding: 5px;
  z-index: 1001;
  box-shadow: 0 14px 36px rgba(0, 0, 0, 0.5);
}
.pk-menu:focus {
  outline: none;
}
.pk-menu-item {
  display: flex;
  align-items: center;
  padding: 7px 10px;
  font-size: 12.5px;
  color: #cdccd8;
  border-radius: 7px;
  cursor: pointer;
  outline: none;
}
.pk-menu-item[data-highlighted] {
  background: rgba(124, 92, 252, 0.16);
  color: #fff;
}
.pk-menu-item.active {
  color: var(--accent-text);
}
</style>
