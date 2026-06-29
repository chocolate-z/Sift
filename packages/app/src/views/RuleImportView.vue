<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
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
  DropdownMenuTrigger,
  TooltipContent,
  TooltipPortal,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger
} from 'reka-ui'
import { useTasksStore } from '@/stores/tasks'
import { SAMPLE_SOURCES as RAW_SOURCES } from '@/data/sampleSources'

const router = useRouter()
const tasks = useTasksStore()

// 卡片 1:七猫 API 源 —— 元信息 chip
const qimaoMeta = [
  { kind: 'clock', text: '超时 5000ms' },
  { kind: 'plain', text: '编码 UTF-8' },
  { kind: 'lock', text: '无需登录' }
]
// 卡片 1:三步链路(节点 + 变量传递)
const qimaoSteps = [
  { n: 1, label: '搜索', via: 'book_id' },
  { n: 2, label: '目录', via: 'book_id, item_id' },
  { n: 3, label: '正文', via: '' }
]
// 卡片 1:搜索接口字段映射(友好名 ← 原始 key)
const qimaoSearchMap = [
  { name: '书名', raw: 'title' },
  { name: '作者', raw: 'author' },
  { name: '封面', raw: 'image_link' },
  { name: '简介', raw: 'intro' },
  { name: '最新章节', raw: 'latest_chapter_title' }
]
const qimaoMenuMap = [
  { name: '章节名', raw: 'title' },
  { name: '章节 ID', raw: 'id' }
]

// 卡片 2:旧钢笔网页源 —— 元信息 chip
const jgbSteps = [
  { n: 1, label: '搜索', via: 'book_url' },
  { n: 2, label: '目录', via: 'chapter_url' },
  { n: 3, label: '正文', via: '' }
]
// 卡片 2:搜索页 CSS 字段规则(完整选择器在 title,展示截断尾段)
const jgbSearchRules = [
  {
    name: '书名',
    sel: '.novelname_author .novelname',
    full: '.currentnovelyfw .catalogyfw_info .novelname_author .novelname'
  },
  {
    name: '作者',
    sel: '.novelname_author .novelauthor a',
    full: '.currentnovelyfw .catalogyfw_info .novelname_author .novelauthor a'
  },
  { name: '封面', sel: '.catalogyfw_pic img @src', full: '.currentnovelyfw .catalogyfw_pic img @src' }
]
// 卡片 2:搜索页前置指令(编码/重定向标签,从 search_url 前缀 {{...}} 剥离)
const jgbDirectives = ['前置 {{302}}', '{{gb2312}}']
// 卡片 2:正文过滤(content_filter 已 Base64 解码为可读正则)
const jgbFilters = [
  String.raw`www.jiugangbi.com提供的.+页\)`,
  '--.+本章未完，请点击下一页继续阅读.',
  '【请收藏.+的小说】'
]

// URL 分段(含变量高亮)
const qimaoMenuPath = [{ t: '/api/book/chapter-list?book_id=' }, { t: 'book_id', hl: true }]
const qimaoBodyPath = [{ t: '/shuku/' }, { t: 'book_id', hl: true }, { t: '-' }, { t: 'item_id', hl: true }, { t: '/' }]
const jgbSearchPath = [
  { t: '/modules/article/search.php?searchkey=' },
  { t: '###keyword###', hl: true },
  { t: '&an=搜索' }
]

// 交互状态:过滤展开、未识别字段收起
const filterOpen = ref(true)
const unknownOpen = ref(false)

// 源卡删除(隐藏)
const qimaoVisible = ref(true)
const jgbVisible = ref(true)

// 查看原始 JSON 用的真实源:RAW_SOURCES 即 @/data/sampleSources 的 SAMPLE_SOURCES
const SRC_NAME: Record<'qimao' | 'jgb', string> = { qimao: '七猫中文网(免会员)', jgb: '旧钢笔文学' }
const jsonOpen = ref(false)
const jsonKey = ref<'qimao' | 'jgb'>('qimao')
const jsonText = computed(() => JSON.stringify(RAW_SOURCES[jsonKey.value], null, 2))
const copied = ref(false)
let copiedTimer: ReturnType<typeof setTimeout> | undefined
function viewJson(key: 'qimao' | 'jgb') {
  jsonKey.value = key
  copied.value = false
  jsonOpen.value = true
}
function copyJson() {
  navigator.clipboard?.writeText(jsonText.value)
  copied.value = true
  if (copiedTimer) clearTimeout(copiedTimer)
  copiedTimer = setTimeout(() => (copied.value = false), 1300)
}

// 保存为任务 → 写入任务列表;其余动作部分待引擎,现给瞬时反馈
const flash = ref<string | null>(null)
let flashTimer: ReturnType<typeof setTimeout> | undefined
function showFlash(key: string) {
  flash.value = key
  if (flashTimer) clearTimeout(flashTimer)
  flashTimer = setTimeout(() => (flash.value = null), 1300)
}
function saveQimao() {
  tasks.addTask({
    name: '七猫中文网',
    type: 'api',
    url: 'www.qimao.com',
    fields: '5',
    lastRun: '从未运行',
    result: '—',
    status: 'ready'
  })
  showFlash('save-qimao')
}
function saveJgb() {
  tasks.addTask({
    name: '旧钢笔文学',
    type: 'web',
    url: 'www.jiugangbi.com',
    fields: '4',
    lastRun: '从未运行',
    result: '—',
    status: 'ready'
  })
  showFlash('save-jgb')
}
onBeforeUnmount(() => {
  if (flashTimer) clearTimeout(flashTimer)
  if (copiedTimer) clearTimeout(copiedTimer)
})
</script>

<template>
  <section class="view import">
    <!-- 头部:无硬分隔线,留白分隔 -->
    <header class="head">
      <div>
        <div class="head-title-row">
          <h1>规则导入</h1>
          <span class="parsed-badge">
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
            解析完成 · 已识别 2 个数据源
          </span>
        </div>
        <span class="head-sub">Sift 已自动识别规则类型、解码内容、还原采集链路</span>
      </div>
      <div class="head-actions">
        <button type="button" class="btn-soft" @click="router.push('/import/paste')">‹ 返回粘贴</button>
        <button type="button" class="btn-soft" @click="showFlash('reparse')">
          {{ flash === 'reparse' ? '✓ 已重新解析' : '重新解析' }}
        </button>
      </div>
    </header>

    <div class="body">
      <!-- ===== 卡片 1:七猫 API 源 ===== -->
      <article v-if="qimaoVisible" class="src-card">
        <div class="src-head">
          <span class="type-badge api">
            <span class="glyph mono">{ }</span>
            API 源
          </span>
          <div class="src-id">
            <span class="src-name">七猫中文网(免会员)</span>
            <span class="src-url mono">https://www.qimao.com/</span>
          </div>
          <span class="src-ok">
            <i class="ok-dot" />
            格式正确
          </span>
          <DropdownMenuRoot>
            <DropdownMenuTrigger as-child>
              <span class="src-more">⋯</span>
            </DropdownMenuTrigger>
            <DropdownMenuPortal>
              <DropdownMenuContent class="ri-menu" align="end" :side-offset="6">
                <DropdownMenuItem class="ri-menu-item" @select="viewJson('qimao')">查看原始 JSON</DropdownMenuItem>
                <DropdownMenuSeparator class="ri-menu-sep" />
                <DropdownMenuItem class="ri-menu-item danger" @select="qimaoVisible = false">删除源</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenuPortal>
          </DropdownMenuRoot>
        </div>

        <div class="meta-row">
          <span v-for="m in qimaoMeta" :key="m.text" class="meta-chip">
            <svg
              v-if="m.kind === 'clock'"
              width="11"
              height="11"
              viewBox="0 0 16 16"
              fill="none"
              stroke="#7a7a87"
              stroke-width="1.5"
              stroke-linecap="round">
              <circle cx="8" cy="8" r="5.5" />
              <path d="M8 5v3.2l2 1.3" />
            </svg>
            <svg
              v-else-if="m.kind === 'lock'"
              width="11"
              height="11"
              viewBox="0 0 16 16"
              fill="none"
              stroke="#7a7a87"
              stroke-width="1.5">
              <rect x="3.5" y="7" width="9" height="6" rx="1.2" />
              <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
            </svg>
            {{ m.text }}
          </span>
        </div>

        <!-- 三步链路 -->
        <div class="steps">
          <div class="steps-inner">
            <template v-for="(s, i) in qimaoSteps" :key="s.n">
              <div class="step-node">
                <div class="step-num">{{ s.n }}</div>
                <span class="step-label">{{ s.label }}</span>
              </div>
              <div v-if="i < qimaoSteps.length - 1" class="step-arrow">
                <div class="step-line" />
                <span class="step-var mono">{{ s.via }}</span>
                <div class="step-line" />
                <span class="step-tri">▶</span>
              </div>
            </template>
          </div>
        </div>

        <!-- 三步细节 -->
        <div class="sub-grid">
          <!-- 搜索接口 -->
          <div class="sub">
            <div class="sub-head">
              <span class="method get mono">GET</span>
              <span class="sub-title">搜索接口</span>
            </div>
            <div class="code-line mono">/qimaoapi/api/search/result</div>
            <div class="param-row">
              <span class="param-k mono">keyword</span>
              <span class="param-eq">=</span>
              <span class="param-v mono">用户输入</span>
            </div>
            <div class="result-row">
              <span class="result-label">结果路径</span>
              <span class="result-val mono" title="原始书源语法:key$$data.key$$search_list — Sift 已剖离 key$$">
                data.search_list
              </span>
            </div>
            <div class="map-label">字段映射 · 5</div>
            <div class="map-grid">
              <template v-for="r in qimaoSearchMap" :key="r.name">
                <span class="map-name">{{ r.name }}</span>
                <span class="map-arrow">←</span>
                <span class="map-raw mono">{{ r.raw }}</span>
              </template>
            </div>
          </div>

          <!-- 章节目录 -->
          <div class="sub">
            <div class="sub-head">
              <span class="method get mono">GET</span>
              <span class="sub-title">章节目录</span>
            </div>
            <div class="code-line mono">
              <span v-for="(seg, i) in qimaoMenuPath" :key="i" :class="{ 'var-hl': seg.hl }">{{ seg.t }}</span>
            </div>
            <div class="result-row">
              <span class="result-label">结果路径</span>
              <span class="result-val mono" title="原始书源语法:key$$data.key$$chapters — Sift 已剖离 key$$">
                data.chapters
              </span>
            </div>
            <div class="map-label">字段映射 · 2</div>
            <div class="map-grid">
              <template v-for="r in qimaoMenuMap" :key="r.name">
                <span class="map-name">{{ r.name }}</span>
                <span class="map-arrow">←</span>
                <span class="map-raw mono">{{ r.raw }}</span>
              </template>
            </div>
          </div>

          <!-- 正文页面 -->
          <div class="sub">
            <div class="sub-head">
              <span class="method page mono">PAGE</span>
              <span class="sub-title">正文页面</span>
            </div>
            <div class="code-line mono">
              <span v-for="(seg, i) in qimaoBodyPath" :key="i" :class="{ 'var-hl': seg.hl }">{{ seg.t }}</span>
            </div>
            <div class="result-row tight">
              <span class="result-label">正文选择器</span>
              <span class="sel-inline mono">body</span>
            </div>
            <div class="result-row tight">
              <span class="result-label">过滤规则</span>
              <span class="dim">无</span>
            </div>
          </div>
        </div>

        <div class="src-foot">
          <button type="button" class="btn-primary" @click="saveQimao">
            {{ flash === 'save-qimao' ? '已保存 ✓' : '保存为任务' }}
          </button>
          <button type="button" class="btn-soft tall" @click="router.push('/debug')">测试搜索</button>
          <span class="btn-link" @click="viewJson('qimao')">查看原始 JSON</span>
        </div>
      </article>

      <!-- ===== 卡片 2:旧钢笔网页源 ===== -->
      <article v-if="jgbVisible" class="src-card">
        <div class="src-head">
          <span class="type-badge web">
            <span class="glyph mono">&lt;/&gt;</span>
            网页源
          </span>
          <div class="src-id">
            <span class="src-name">旧钢笔文学</span>
            <span class="src-url mono">http://www.jiugangbi.com/</span>
          </div>
          <span class="src-ok">
            <i class="ok-dot" />
            格式正确
          </span>
          <DropdownMenuRoot>
            <DropdownMenuTrigger as-child>
              <span class="src-more">⋯</span>
            </DropdownMenuTrigger>
            <DropdownMenuPortal>
              <DropdownMenuContent class="ri-menu" align="end" :side-offset="6">
                <DropdownMenuItem class="ri-menu-item" @select="viewJson('jgb')">查看原始 JSON</DropdownMenuItem>
                <DropdownMenuSeparator class="ri-menu-sep" />
                <DropdownMenuItem class="ri-menu-item danger" @select="jgbVisible = false">删除源</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenuPortal>
          </DropdownMenuRoot>
        </div>

        <div class="meta-row">
          <span class="meta-chip">
            <svg
              width="11"
              height="11"
              viewBox="0 0 16 16"
              fill="none"
              stroke="#7a7a87"
              stroke-width="1.5"
              stroke-linecap="round">
              <circle cx="8" cy="8" r="5.5" />
              <path d="M8 5v3.2l2 1.3" />
            </svg>
            超时 6000ms
          </span>
          <span class="meta-chip warn">
            <svg
              width="11"
              height="11"
              viewBox="0 0 16 16"
              fill="none"
              stroke="#E0A85A"
              stroke-width="1.5"
              stroke-linecap="round">
              <path d="M8 1.5L14.5 13H1.5z" />
              <path d="M8 6v3M8 11v.01" />
            </svg>
            编码 GB2312
          </span>
          <span class="meta-chip">
            <svg
              width="11"
              height="11"
              viewBox="0 0 16 16"
              fill="none"
              stroke="#7a7a87"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round">
              <path d="M3 8a5 5 0 0 1 9-3l1.5 1.5M13 4v2.5h-2.5" />
            </svg>
            跟随重定向 302
          </span>
          <span class="meta-chip">
            <svg
              width="11"
              height="11"
              viewBox="0 0 16 16"
              fill="none"
              stroke="#34D399"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round">
              <path d="M3 8.5l3 3 7-7" />
            </svg>
            翻页 启用
          </span>
        </div>

        <!-- 三步链路 -->
        <div class="steps">
          <div class="steps-inner">
            <template v-for="(s, i) in jgbSteps" :key="s.n">
              <div class="step-node wide">
                <div class="step-num">{{ s.n }}</div>
                <span class="step-label">{{ s.label }}</span>
              </div>
              <div v-if="i < jgbSteps.length - 1" class="step-arrow">
                <div class="step-line" />
                <span class="step-var mono">{{ s.via }}</span>
                <div class="step-line" />
                <span class="step-tri">▶</span>
              </div>
            </template>
          </div>
        </div>

        <!-- 三步细节 -->
        <div class="sub-grid pb14">
          <!-- 搜索页 -->
          <div class="sub">
            <div class="sub-head compact">
              <span class="method html mono">HTML</span>
              <span class="sub-title">搜索页</span>
            </div>
            <div class="directives">
              <span v-for="d in jgbDirectives" :key="d" class="directive mono">{{ d }}</span>
            </div>
            <div class="code-line mono mb10">
              <span v-for="(seg, i) in jgbSearchPath" :key="i" :class="{ 'var-hl': seg.hl }">{{ seg.t }}</span>
            </div>
            <div class="map-label">字段规则 (CSS)</div>
            <div class="css-rules">
              <div v-for="r in jgbSearchRules" :key="r.name" class="css-rule">
                <span class="css-name">{{ r.name }}</span>
                <span class="css-sel mono" :title="r.full" dir="rtl">{{ r.sel }}</span>
              </div>
            </div>
          </div>

          <!-- 章节目录 -->
          <div class="sub">
            <div class="sub-head compact">
              <span class="method html mono">HTML</span>
              <span class="sub-title">章节目录</span>
            </div>
            <div class="map-label">目录选择器</div>
            <div class="sel-box mono g6" title=".indexyfw_listbox .listchapter ul li:gt(8) a">
              .listchapter ul li
              <span class="pseudo">
                :gt(8)
                <TooltipProvider :delay-duration="150">
                  <TooltipRoot>
                    <TooltipTrigger as-child>
                      <span class="pseudo-help">?</span>
                    </TooltipTrigger>
                    <TooltipPortal>
                      <TooltipContent class="ri-tip" :side-offset="6">
                        取第 9 项及之后(跳过开头的最新章节区块)
                      </TooltipContent>
                    </TooltipPortal>
                  </TooltipRoot>
                </TooltipProvider>
              </span>
              a
            </div>
            <div class="sel-note">
              <svg
                width="12"
                height="12"
                viewBox="0 0 16 16"
                fill="none"
                stroke="#E0A85A"
                stroke-width="1.5"
                stroke-linecap="round"
                class="note-ico">
                <circle cx="8" cy="8" r="6" />
                <path d="M8 7.4v3.2M8 5.2v.01" />
              </svg>
              <span>
                <em>:gt(8)</em>
                跳过开头的最新章节区块,取第 9 项及之后
              </span>
            </div>
          </div>

          <!-- 正文页 -->
          <div class="sub">
            <div class="sub-head compact">
              <span class="method html mono">HTML</span>
              <span class="sub-title">正文页</span>
            </div>
            <div class="map-label">正文选择器</div>
            <div class="sel-box mono" title=".chapter_content > a:eq(1)">
              .chapter_content &gt; a
              <span class="pseudo">
                :eq(1)
                <TooltipProvider :delay-duration="150">
                  <TooltipRoot>
                    <TooltipTrigger as-child>
                      <span class="pseudo-help">?</span>
                    </TooltipTrigger>
                    <TooltipPortal>
                      <TooltipContent class="ri-tip" :side-offset="6">取匹配到的第 2 个 &lt;a&gt;</TooltipContent>
                    </TooltipPortal>
                  </TooltipRoot>
                </TooltipProvider>
              </span>
            </div>
            <div class="sel-note sm">
              <span>
                <em>:eq(1)</em>
                取匹配到的第 2 个 &lt;a&gt;
              </span>
            </div>
            <div class="kv-row first">
              <span class="kv-k">翻页</span>
              <span class="kv-v ok">
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="#34D399"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round">
                  <path d="M3 8.5l3 3 7-7" />
                </svg>
                启用
              </span>
            </div>
            <div class="kv-row">
              <span class="kv-k">下一页选择器</span>
              <span class="kv-v mono ellip" title=".sytlet_footer_buttom ul li.buttom_next a" dir="rtl">
                .sytlet_footer_buttom ul li.buttom_next a
              </span>
            </div>
            <div class="kv-row">
              <span class="kv-k">匹配文本</span>
              <span class="kv-v">"下一页"</span>
            </div>
          </div>
        </div>

        <!-- 正文过滤区(网页源特有,Base64 已解码) -->
        <div class="filter-box">
          <div class="filter-head" @click="filterOpen = !filterOpen">
            <svg
              width="14"
              height="14"
              viewBox="0 0 16 16"
              fill="none"
              stroke="#9d83ff"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round">
              <path d="M2.5 3.5h11l-4.2 5v4.2l-2.6 1.3V8.5z" />
            </svg>
            <span class="filter-title">正文过滤</span>
            <span class="filter-count mono">3 条</span>
            <span class="filter-decoded">
              <svg
                width="11"
                height="11"
                viewBox="0 0 16 16"
                fill="none"
                stroke="#34D399"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round">
                <path d="M3 8.5l3 3 7-7" />
              </svg>
              Base64 已解码为文本
            </span>
            <span class="filter-chevron" :class="{ open: filterOpen }">▾</span>
          </div>
          <div v-if="filterOpen" class="filter-list">
            <div v-for="(f, i) in jgbFilters" :key="i" class="filter-item">
              <span class="filter-idx mono">{{ String(i + 1).padStart(2, '0') }}</span>
              <span class="filter-text mono">{{ f }}</span>
              <span class="filter-tag">正则 · 已解码</span>
            </div>
          </div>
        </div>

        <!-- 未识别字段容错区 -->
        <div class="unknown" @click="unknownOpen = !unknownOpen">
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="none"
            stroke="#E0A85A"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round">
            <path d="M8 1.5L14.5 13H1.5z" />
            <path d="M8 6.5v3M8 11.4v.01" />
          </svg>
          <span class="unknown-label">2 个未识别字段</span>
          <span class="unknown-note">已容错保留,不影响采集</span>
          <span class="unknown-toggle">
            {{ unknownOpen ? '收起' : '展开' }}
            <svg
              width="11"
              height="11"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linecap="round"
              stroke-linejoin="round"
              :class="{ flip: unknownOpen }">
              <path d="M4 6l4 4 4-4" />
            </svg>
          </span>
        </div>
        <div v-if="unknownOpen" class="unknown-list">
          <div class="unknown-item">
            <span class="uk-key mono">url_type</span>
            <span class="uk-arrow">←</span>
            <span class="uk-val mono">"2"</span>
            <span class="uk-tag">原样保留</span>
          </div>
          <div class="unknown-item">
            <span class="uk-key mono">cover_attr</span>
            <span class="uk-arrow">←</span>
            <span class="uk-val mono">"src"</span>
            <span class="uk-tag">原样保留</span>
          </div>
        </div>

        <div class="src-foot">
          <button type="button" class="btn-primary" @click="saveJgb">
            {{ flash === 'save-jgb' ? '已保存 ✓' : '保存为任务' }}
          </button>
          <button type="button" class="btn-soft tall" @click="router.push('/debug')">测试搜索</button>
          <span class="btn-link" @click="viewJson('jgb')">查看原始 JSON</span>
        </div>
      </article>
    </div>

    <!-- 原始规则 JSON 弹层 -->
    <DialogRoot v-model:open="jsonOpen">
      <DialogPortal>
        <DialogOverlay class="ri-overlay" />
        <DialogContent class="ri-dialog" @open-auto-focus.prevent>
          <DialogTitle class="ri-dialog-title">原始规则 JSON · {{ SRC_NAME[jsonKey] }}</DialogTitle>
          <DialogDescription class="ri-dialog-desc">Sift 解析前的原始书源规则(技术验证用的真实源)。</DialogDescription>
          <pre class="ri-json mono">{{ jsonText }}</pre>
          <div class="ri-dialog-foot">
            <DialogClose class="ri-btn-ghost">关闭</DialogClose>
            <button type="button" class="ri-btn-primary" @click="copyJson">
              {{ copied ? '已复制 ✓' : '复制 JSON' }}
            </button>
          </div>
        </DialogContent>
      </DialogPortal>
    </DialogRoot>
  </section>
</template>

<style scoped>
.import {
  display: flex;
  flex-direction: column;
  height: 100%;
  /* 覆盖全局 body 的 1.5,本视图使用更紧凑的行高 */
  line-height: normal;
}

/* 头部:无硬分隔线 */
.head {
  flex: none;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  padding: 22px 28px 16px;
}
.head-title-row {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 3px;
}
.head h1 {
  font-size: 24px;
  font-weight: 700;
  letter-spacing: -0.02em;
}
.parsed-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #5dd9b8;
}
.head-sub {
  font-size: 13px;
  color: var(--text-secondary);
}
.head-actions {
  display: flex;
  gap: 9px;
}
.btn-soft {
  height: 34px;
  padding: 0 14px;
  border-radius: 8px;
  background: var(--bg-elevated);
  border: 1px solid #2e2e38;
  color: #cdccd8;
  font-size: 12.5px;
  cursor: pointer;
}
.btn-soft:hover {
  border-color: #3a3a46;
}
.btn-soft.tall {
  height: 36px;
}

/* 滚动主体 */
.body {
  flex: 1;
  overflow-y: auto;
  padding: 20px 28px 28px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

/* 源卡片 */
.src-card {
  background: #14141b;
  border: 1px solid var(--border);
  border-radius: 13px;
  overflow: hidden;
  flex: none;
}
.src-head {
  padding: 15px 18px;
  border-bottom: 1px solid #20202a;
  display: flex;
  align-items: center;
  gap: 13px;
}
.type-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border-radius: 7px;
  padding: 4px 9px;
  font-size: 11.5px;
  font-weight: 600;
  flex: none;
}
.type-badge.api {
  background: rgba(45, 212, 191, 0.12);
  border: 1px solid rgba(45, 212, 191, 0.4);
  color: var(--success);
}
.type-badge.web {
  background: rgba(224, 168, 90, 0.12);
  border: 1px solid rgba(224, 168, 90, 0.4);
  color: var(--warning);
}
.type-badge .glyph {
  font-weight: 700;
}
.src-id {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}
.src-name {
  font-size: 15px;
  font-weight: 700;
  color: var(--text);
}
.src-url {
  font-size: 11px;
  color: #8a86a6;
}
.src-ok {
  display: flex;
  align-items: center;
  gap: 5px;
  flex: none;
  font-size: 12px;
  color: #5dd9b8;
}
.ok-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #34d399;
}
.src-more {
  color: var(--text-dim);
  font-size: 18px;
  padding: 0 4px;
  cursor: default;
}
.src-more:hover {
  color: #cdccd8;
}

/* 元信息 chip */
.meta-row {
  padding: 13px 18px 4px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.meta-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 13px;
  padding: 3px 11px;
  font-size: 11px;
  color: #9a9aa6;
}
.meta-chip.warn {
  background: rgba(224, 168, 90, 0.1);
  border-color: rgba(224, 168, 90, 0.32);
  color: var(--warning);
}

/* 三步链路 */
.steps {
  padding: 16px 18px 4px;
}
.steps-inner {
  display: flex;
  align-items: center;
}
.step-node {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  width: 60px;
  flex: none;
}
.step-node.wide {
  width: 64px;
}
.step-num {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 14px;
  color: #fff;
  box-shadow: 0 3px 10px rgba(124, 92, 252, 0.35);
}
.step-label {
  font-size: 11.5px;
  color: #cdccd8;
  font-weight: 600;
}
.step-arrow {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 4px;
  margin-bottom: 22px;
}
.step-line {
  flex: 1;
  height: 1px;
  background: #33333f;
}
.step-var {
  font-size: 10px;
  color: var(--accent-text);
  background: rgba(124, 92, 252, 0.12);
  border: 1px solid #3a3066;
  border-radius: 4px;
  padding: 1px 7px;
  white-space: nowrap;
}
.step-tri {
  color: var(--accent);
  font-size: 11px;
}

/* 三步细节网格 */
.sub-grid {
  padding: 8px 18px 4px;
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 12px;
}
.sub-grid.pb14 {
  padding-bottom: 14px;
}
.sub {
  background: var(--bg);
  border: 1px solid #24242e;
  border-radius: 10px;
  padding: 13px;
}
.sub-head {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 10px;
}
.sub-head.compact {
  margin-bottom: 9px;
}
.method {
  font-size: 10px;
  font-weight: 700;
  border-radius: 4px;
  padding: 1px 6px;
}
.method.get {
  color: #5dd9b8;
  background: rgba(45, 212, 191, 0.12);
  border: 1px solid rgba(45, 212, 191, 0.35);
}
.method.page,
.method.html {
  color: #9a9aa6;
  background: var(--bg-card);
  border: 1px solid #2a2a34;
}
.sub-title {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text);
}
.code-line {
  font-size: 11px;
  color: #a9a4c9;
  background: var(--bg-card);
  border: 1px solid #24242e;
  border-radius: 6px;
  padding: 7px 8px;
  line-height: 1.5;
  word-break: break-all;
  margin-bottom: 9px;
}
.code-line.mb10 {
  margin-bottom: 10px;
}
.var-hl {
  background: rgba(124, 92, 252, 0.16);
  color: var(--accent-text);
  border-radius: 3px;
  padding: 0 3px;
}
/* 网页源搜索页:前置指令(编码/重定向)橙色虚线 chip */
.directives {
  display: flex;
  gap: 5px;
  margin-bottom: 7px;
  flex-wrap: wrap;
}
.directive {
  font-size: 9.5px;
  color: var(--warning);
  background: rgba(224, 168, 90, 0.1);
  border: 1px dashed rgba(224, 168, 90, 0.45);
  border-radius: 4px;
  padding: 1px 6px;
}
.param-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  margin-bottom: 9px;
}
.param-k {
  color: #8a86a6;
}
.param-eq {
  color: #56565f;
}
.param-v {
  background: rgba(124, 92, 252, 0.16);
  color: var(--accent-text);
  border: 1px solid #4a3a86;
  border-radius: 4px;
  padding: 1px 6px;
}
.result-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  margin-bottom: 11px;
}
.result-row.tight {
  margin-bottom: 9px;
}
.result-row:last-child {
  margin-bottom: 0;
}
.result-label {
  color: #7a7a87;
}
.result-val {
  color: #5dd9b8;
  background: var(--bg-card);
  border: 1px solid #24242e;
  border-radius: 4px;
  padding: 1px 6px;
  cursor: default;
}
.sel-inline {
  color: #a9a4c9;
  background: var(--bg-card);
  border: 1px solid #24242e;
  border-radius: 4px;
  padding: 1px 6px;
}
.dim {
  color: var(--text-dim);
}
.map-label {
  font-size: 10px;
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 6px;
}
.map-grid {
  display: grid;
  grid-template-columns: auto 14px 1fr;
  gap: 6px 8px;
  align-items: center;
  font-size: 11.5px;
}
.map-name {
  color: #cdccd8;
}
.map-arrow {
  color: #56565f;
  text-align: center;
}
.map-raw {
  color: #8a86a6;
  text-align: right;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 网页源 CSS 字段规则 */
.css-rules {
  display: flex;
  flex-direction: column;
  gap: 7px;
  font-size: 11.5px;
}
.css-rule {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.css-name {
  color: #cdccd8;
  flex: none;
}
.css-sel {
  color: #8a86a6;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}
.sel-box {
  display: flex;
  align-items: center;
  gap: 5px;
  flex-wrap: wrap;
  font-size: 11px;
  color: #a9a4c9;
  background: var(--bg-card);
  border: 1px solid #24242e;
  border-radius: 6px;
  padding: 7px 8px;
  line-height: 1.6;
  margin-bottom: 9px;
}
.sel-box.g6 {
  gap: 6px;
}
.pseudo {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  background: rgba(224, 168, 90, 0.12);
  color: var(--warning);
  border: 1px solid rgba(224, 168, 90, 0.35);
  border-radius: 3px;
  padding: 0 4px;
}
.pseudo-help {
  display: inline-flex;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 1px solid var(--warning);
  align-items: center;
  justify-content: center;
  font-size: 8px;
  cursor: default;
}
.sel-note {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: #7a7a87;
  line-height: 1.4;
}
.sel-note.sm {
  font-size: 10.5px;
  margin-bottom: 9px;
}
.note-ico {
  flex: none;
  margin-top: 1px;
}
.sel-note em {
  color: #d8b27a;
  font-style: normal;
}
.kv-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 7px;
  font-size: 11px;
}
.kv-row.first {
  margin-top: 0;
}
.kv-k {
  color: #7a7a87;
}
.kv-v {
  color: #cdccd8;
}
.kv-v.ok {
  display: flex;
  align-items: center;
  gap: 4px;
  color: #5dd9b8;
}
.kv-v.ellip {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 150px;
}

/* 正文过滤区 */
.filter-box {
  margin: 0 18px 14px;
  background: var(--bg);
  border: 1px solid #24242e;
  border-radius: 10px;
  padding: 13px 14px;
}
.filter-head {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}
.filter-head:hover {
  opacity: 0.85;
}
.filter-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
}
.filter-count {
  font-size: 10.5px;
  color: #9d83ff;
  background: rgba(124, 92, 252, 0.12);
  border: 1px solid #3a3066;
  border-radius: 5px;
  padding: 1px 7px;
}
.filter-decoded {
  margin-left: auto;
  font-size: 10.5px;
  color: #5dd9b8;
  display: flex;
  align-items: center;
  gap: 5px;
}
.filter-chevron {
  font-size: 13px;
  color: var(--text-secondary);
  width: 14px;
  text-align: center;
  transition: transform 0.15s;
}
.filter-chevron.open {
  transform: rotate(180deg);
}
.filter-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 11px;
}
.filter-item {
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--bg-card);
  border: 1px solid #24242e;
  border-radius: 8px;
  padding: 8px 11px;
}
.filter-idx {
  font-size: 10px;
  color: var(--text-dim);
  flex: none;
}
.filter-text {
  flex: 1;
  font-size: 11.5px;
  color: #cdccd8;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.filter-tag {
  flex: none;
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 9.5px;
  color: #9d83ff;
  background: rgba(124, 92, 252, 0.1);
  border: 1px solid #2e2747;
  border-radius: 4px;
  padding: 2px 7px;
}

/* 未识别字段容错区 */
.unknown {
  margin: 0 18px 16px;
  display: flex;
  align-items: center;
  gap: 9px;
  background: var(--bg-card);
  border: 1px dashed #2e2e38;
  border-radius: 9px;
  padding: 9px 13px;
  cursor: pointer;
}
.unknown:hover {
  border-color: #3a3a46;
}
.unknown-label {
  font-size: 12px;
  color: #d8b27a;
}
.unknown-note {
  font-size: 11px;
  color: #7a7a87;
}
.unknown-toggle {
  margin-left: auto;
  font-size: 11px;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  gap: 5px;
}
.unknown-toggle .flip {
  transform: rotate(180deg);
}
.unknown-list {
  margin: -8px 18px 16px;
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding: 11px 13px;
  background: var(--bg);
  border: 1px solid #24242e;
  border-radius: 9px;
}
.unknown-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11.5px;
}
.uk-key {
  color: #cdccd8;
}
.uk-arrow {
  color: #56565f;
}
.uk-val {
  color: #8a86a6;
}
.uk-tag {
  margin-left: auto;
  font-size: 9.5px;
  color: #d8b27a;
  background: rgba(224, 168, 90, 0.1);
  border: 1px solid rgba(224, 168, 90, 0.3);
  border-radius: 4px;
  padding: 2px 7px;
}

/* 卡片底部动作 */
.src-foot {
  padding: 13px 18px;
  border-top: 1px solid #20202a;
  display: flex;
  align-items: center;
  gap: 10px;
}
.btn-primary {
  height: 36px;
  padding: 0 16px;
  border-radius: 8px;
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
  border: none;
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(124, 92, 252, 0.3);
}
.btn-link {
  margin-left: auto;
  font-size: 12px;
  color: #8a86a6;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 3px;
}
.btn-link:hover {
  color: var(--accent-text);
}
</style>

<style>
/* Reka Tooltip portal 到 body 外,scoped 够不着 → 全局样式(ri- 前缀避免外泄) */
.ri-tip {
  max-width: 240px;
  background: #1b1b24;
  border: 1px solid #3a3a46;
  border-radius: 8px;
  padding: 7px 10px;
  font-size: 11.5px;
  color: #cdccd8;
  line-height: 1.5;
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.5);
  z-index: 1001;
}

/* ⋯ 更多操作菜单 */
.ri-menu {
  min-width: 150px;
  background: #16161e;
  border: 1px solid #2a2a34;
  border-radius: 10px;
  padding: 5px;
  z-index: 1001;
  box-shadow: 0 14px 36px rgba(0, 0, 0, 0.5);
}
.ri-menu:focus {
  outline: none;
}
.ri-menu-item {
  display: flex;
  align-items: center;
  padding: 7px 10px;
  font-size: 12.5px;
  color: #cdccd8;
  border-radius: 7px;
  cursor: pointer;
  outline: none;
}
.ri-menu-item[data-highlighted] {
  background: rgba(124, 92, 252, 0.16);
  color: #fff;
}
.ri-menu-item.danger {
  color: #e0908b;
}
.ri-menu-item.danger[data-highlighted] {
  background: rgba(224, 68, 62, 0.16);
  color: #f1837d;
}
.ri-menu-sep {
  height: 1px;
  margin: 4px;
  background: #24242e;
}

/* 原始 JSON 弹层 */
.ri-overlay {
  position: fixed;
  inset: 0;
  background: rgba(6, 6, 11, 0.62);
  z-index: 1000;
}
.ri-dialog {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 560px;
  max-width: calc(100vw - 40px);
  display: flex;
  flex-direction: column;
  gap: 12px;
  background: #15151d;
  border: 1px solid #2a2a34;
  border-radius: 14px;
  padding: 20px;
  z-index: 1001;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.55);
  color: var(--text);
  line-height: normal;
}
.ri-dialog:focus {
  outline: none;
}
.ri-dialog-title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
}
.ri-dialog-desc {
  margin: -4px 0 0;
  font-size: 12px;
  color: var(--text-secondary);
}
.ri-json {
  margin: 0;
  max-height: 50vh;
  overflow: auto;
  background: #0b0b11;
  border: 1px solid #24242e;
  border-radius: 9px;
  padding: 13px 15px;
  font-size: 11.5px;
  line-height: 1.65;
  color: #a9a4c9;
  white-space: pre;
  user-select: text;
}
.ri-dialog-foot {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
.ri-btn-ghost {
  height: 34px;
  padding: 0 15px;
  border-radius: 8px;
  background: var(--bg-elevated);
  border: 1px solid #2e2e38;
  color: #cdccd8;
  font-size: 12.5px;
  cursor: pointer;
}
.ri-btn-ghost:hover {
  border-color: #3a3a46;
}
.ri-btn-primary {
  height: 34px;
  padding: 0 18px;
  border-radius: 8px;
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
  border: none;
  color: #fff;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
}
</style>
