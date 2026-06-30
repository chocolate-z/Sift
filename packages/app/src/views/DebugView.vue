<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuTrigger
} from 'reka-ui'

const router = useRouter()

type Tab = 'req' | 'resp' | 'parse'
const alt = ref(false) // false=调试态 · true=初始态(空态)
const tab = ref<Tab>('resp')
const keyword = ref('')

// 调试源选择(切换标签;各源的调试场景待 M1 引擎)
interface DebugSource {
  name: string
  type: 'web' | 'api'
  glyph: string
  label: string
}
const DEFAULT_SOURCE: DebugSource = { name: '示例网页源', type: 'web', glyph: '</>', label: '网页源' }
const sources: DebugSource[] = [DEFAULT_SOURCE, { name: '示例 API 源', type: 'api', glyph: '{}', label: 'API 源' }]
const current = ref<DebugSource>(DEFAULT_SOURCE)
function selectSource(s: DebugSource) {
  current.value = s
}

// 开始 / 重新调试:运行采集链路 → 进入调试态(真实逐步执行待 M1 引擎)
function runDebug() {
  alt.value = false
}

// 备选选择器重试为引擎动作,留待 M1;现给瞬时反馈
const retryFlash = ref(false)
let retryTimer: ReturnType<typeof setTimeout> | undefined
function retryAlt() {
  retryFlash.value = true
  if (retryTimer) clearTimeout(retryTimer)
  retryTimer = setTimeout(() => (retryFlash.value = false), 1200)
}
onBeforeUnmount(() => {
  if (retryTimer) clearTimeout(retryTimer)
})

// 左侧采集链路(调试态)
const timeline = [
  { n: 1, label: '搜索', status: 'ok', meta: 'GET /search · 312ms · 命中 1 条', line: 'ok' },
  { n: 2, label: '子列表', status: 'ok', meta: '解析 86 项 · 1.2s', line: 'grad' },
  { n: 3, label: '子页', status: 'fail', meta: 'GET .../67890.html · 内容为空', line: 'none' }
]
// 左侧采集链路(初始态)
const idleSteps = [
  { n: 1, label: '搜索' },
  { n: 2, label: '子列表' },
  { n: 3, label: '子页' }
]

// 请求标签:请求头
const reqHeaders = [
  { k: 'User-Agent:', v: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ...' },
  { k: 'Referer:', v: 'https://example.com/item/12345/' },
  { k: 'Cookie:', v: 'PHPSESSID=••••••••••••••••', enc: true },
  { k: 'Accept:', v: 'text/html,application/xhtml+xml' }
]
const reqDirectives = ['前置 {{302}}', '解码 {{gb2312}}']

// 响应标签:响应体代码,分段着色
const respLines = [17, 18, 19, 20, 21, 22]
const respCode = [
  [{ t: '<div class="' }, { t: 'main', cls: 'tag' }, { t: '">' }],
  [{ t: '  <div class="' }, { t: 'tips', cls: 'tag' }, { t: '">' }],
  [{ t: '    系统检测到访问异常,请稍后重试', cls: 'warn' }],
  [{ t: '  </div>' }],
  [{ t: '  <!-- 预期的 .content 选择器缺失 -->', cls: 'miss' }],
  [{ t: '</div>' }]
]

// 解析结果标签:本步解析输出 + 上游传入
const parseRows = [
  { field: '内容 (.content)', value: '(空 · 0 字)', status: 'fail' },
  { field: '过滤命中', value: '0 / 3 条', status: 'dash' },
  { field: '字数统计', value: '0', status: 'dash' }
]
const upstream = [
  { t: 'id = 12345', kind: 'var' },
  { t: 'sub_id = 67890', kind: 'var' },
  { t: '子项 = 示例条目', kind: 'ok' }
]
</script>

<template>
  <section class="view debug">
    <!-- 头部 + 控制栏 -->
    <header class="head">
      <div class="head-row">
        <h1>调试控制台</h1>
        <span v-if="!alt" class="status fail">
          <i class="sdot" />
          调试中断 · 第 3 步失败
        </span>
        <span v-else class="status idle">
          <i class="sdot" />
          就绪 · 待开始调试
        </span>
      </div>

      <div class="ctrl">
        <DropdownMenuRoot>
          <DropdownMenuTrigger as-child>
            <div class="src-sel">
              <span class="type-badge" :class="current.type">
                <span class="glyph mono">{{ current.glyph }}</span>
                {{ current.label }}
              </span>
              <span class="src-name">{{ current.name }}</span>
              <svg
                width="12"
                height="12"
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
            <DropdownMenuContent class="db-menu" align="start" :side-offset="6">
              <DropdownMenuItem
                v-for="s in sources"
                :key="s.name"
                class="db-menu-item"
                :class="{ active: current.name === s.name }"
                @select="selectSource(s)">
                <span class="db-badge" :class="s.type">
                  <span class="mono">{{ s.glyph }}</span>
                  {{ s.label }}
                </span>
                {{ s.name }}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenuPortal>
        </DropdownMenuRoot>
        <div class="kw">
          <span class="kw-label">关键词</span>
          <input class="mono" v-model="keyword" />
        </div>
        <button type="button" class="run" @click="runDebug">
          <svg width="13" height="13" viewBox="0 0 16 16" fill="#fff"><path d="M4 3l9 5-9 5z" /></svg>
          开始调试
        </button>
        <button type="button" class="refresh" aria-label="重新调试" @click="runDebug">
          <svg
            width="15"
            height="15"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round">
            <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2.5V5H11" />
          </svg>
        </button>
        <div class="seg">
          <span :class="{ on: !alt }" @click="alt = false">调试态</span>
          <span :class="{ on: alt }" @click="alt = true">初始态</span>
        </div>
      </div>
    </header>

    <!-- ===== 调试态 ===== -->
    <div v-if="!alt" class="split">
      <!-- 左:采集链路 -->
      <div class="steps-panel">
        <div class="panel-label">采集链路</div>
        <div class="timeline">
          <div v-for="s in timeline" :key="s.n" class="tl-step">
            <div class="tl-rail">
              <div class="tl-dot" :class="s.status">
                <svg
                  v-if="s.status === 'ok'"
                  width="12"
                  height="12"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="#34D399"
                  stroke-width="2.4"
                  stroke-linecap="round"
                  stroke-linejoin="round">
                  <path d="M3 8.5l3 3 7-7" />
                </svg>
                <svg
                  v-else
                  width="11"
                  height="11"
                  viewBox="0 0 16 16"
                  stroke="#E0443E"
                  stroke-width="2.2"
                  stroke-linecap="round">
                  <path d="M4 4l8 8M12 4l-8 8" />
                </svg>
              </div>
              <div v-if="s.line !== 'none'" class="tl-line" :class="s.line" />
            </div>
            <div v-if="s.status === 'ok'" class="tl-body">
              <div class="tl-head">
                <span class="tl-name">{{ s.label }}</span>
                <span class="tl-stat">成功</span>
              </div>
              <div class="tl-meta mono">{{ s.meta }}</div>
            </div>
            <div v-else class="tl-body card-fail">
              <div class="tl-head">
                <span class="tl-name fail">{{ s.label }}</span>
                <span class="tl-badge">失败</span>
              </div>
              <div class="tl-meta mono fail">{{ s.meta }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- 右:步骤详情 -->
      <div class="detail">
        <div class="detail-head">
          <div class="dh-row">
            <span class="dh-title">③ 子页</span>
            <span class="dh-badge">
              <svg
                width="10"
                height="10"
                viewBox="0 0 16 16"
                stroke="#E0443E"
                stroke-width="2.4"
                stroke-linecap="round">
                <path d="M4 4l8 8M12 4l-8 8" />
              </svg>
              HTTP 200 但解析失败
            </span>
          </div>
          <div class="err-banner">
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              stroke="#E0443E"
              stroke-width="1.6"
              stroke-linecap="round"
              stroke-linejoin="round"
              class="eb-ico">
              <circle cx="8" cy="8" r="6.2" />
              <path d="M8 5v3.5M8 10.8v.01" />
            </svg>
            <div class="eb-text">
              <div class="eb-title">
                内容选择器
                <span class="mono">.content &gt; a:eq(1)</span>
                返回 0 字
              </div>
              <div class="eb-desc">
                页面已返回但
                <span class="mono amber">:eq(1)</span>
                未取到第 2 个 &lt;a&gt; —— 内容按
                <span class="mono amber">GB2312</span>
                解码后结构与预期不符,或触发了反爬提示页。建议改用
                <span class="mono accent">.content &gt; a:last</span>
                备选选择器重试。
              </div>
            </div>
          </div>
          <div class="tabs">
            <div class="tab" :class="{ on: tab === 'req' }" @click="tab = 'req'">请求</div>
            <div class="tab" :class="{ on: tab === 'resp' }" @click="tab = 'resp'">
              响应
              <span class="t-code mono">200</span>
            </div>
            <div class="tab" :class="{ on: tab === 'parse' }" @click="tab = 'parse'">
              解析结果
              <span class="t-reddot" />
            </div>
          </div>
        </div>

        <div class="tab-body">
          <!-- 请求 -->
          <div v-if="tab === 'req'" class="pane">
            <div class="req-line">
              <span class="method get mono">GET</span>
              <span class="req-url mono">http://www.jiugangbi.com/book/12345/67890.html</span>
            </div>
            <div>
              <div class="blk-label">请求头</div>
              <div class="hdr-blk mono">
                <div v-for="h in reqHeaders" :key="h.k">
                  <span class="hk">{{ h.k }}</span>
                  <span class="hv" :class="{ dim: h.enc }">{{ h.v }}</span>
                  <span v-if="h.enc" class="enc">(已加密)</span>
                </div>
              </div>
            </div>
            <div class="directives">
              <span v-for="d in reqDirectives" :key="d" class="directive mono">{{ d }}</span>
            </div>
          </div>

          <!-- 响应 -->
          <div v-else-if="tab === 'resp'" class="pane">
            <div class="resp-meta">
              <span class="rm-code mono">200 OK</span>
              <span class="rm-item">
                耗时
                <span class="mono">5840ms</span>
              </span>
              <span class="rm-item">
                大小
                <span class="mono">42.6 KB</span>
              </span>
              <span class="rm-item">
                编码
                <span class="mono amber">GB2312 → UTF-8</span>
              </span>
            </div>
            <div class="resp-warn">
              <svg
                width="13"
                height="13"
                viewBox="0 0 16 16"
                fill="none"
                stroke="#E0443E"
                stroke-width="1.6"
                stroke-linecap="round">
                <circle cx="8" cy="8" r="6" />
                <path d="M8 5v3.5M8 10.7v.01" />
              </svg>
              响应体中未找到
              <span class="mono">.chapter_content &gt; a:eq(1)</span>
              节点 · 检测到疑似反爬提示
            </div>
            <div class="code-blk">
              <div class="cb-row">
                <div class="gutter mono">
                  <div v-for="n in respLines" :key="n">{{ n }}</div>
                </div>
                <div class="cb-code mono">
                  <div v-for="(line, i) in respCode" :key="i" class="cb-line">
                    <span v-for="(seg, j) in line" :key="j" :class="seg.cls">{{ seg.t }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- 解析结果 -->
          <div v-else class="pane">
            <div class="blk-label">本步解析输出</div>
            <div class="parse-table">
              <div class="pt-head">
                <span>字段</span>
                <span>值</span>
                <span class="pt-r">状态</span>
              </div>
              <div v-for="r in parseRows" :key="r.field" class="pt-row">
                <span class="pt-field">{{ r.field }}</span>
                <span class="pt-val mono">{{ r.value }}</span>
                <span v-if="r.status === 'fail'" class="pt-stat fail">
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 16 16"
                    stroke="#E0443E"
                    stroke-width="2.4"
                    stroke-linecap="round">
                    <path d="M4 4l8 8M12 4l-8 8" />
                  </svg>
                  失败
                </span>
                <span v-else class="pt-stat dash">—</span>
              </div>
            </div>
            <div class="blk-label mt">上游传入(来自 ② 目录)</div>
            <div class="upstream">
              <span v-for="c in upstream" :key="c.t" class="up-chip mono" :class="c.kind">{{ c.t }}</span>
            </div>
            <div class="parse-actions">
              <button type="button" class="btn-primary sm" @click="retryAlt">
                {{ retryFlash ? '重试中…' : '用备选选择器重试' }}
              </button>
              <button type="button" class="btn-soft" @click="router.push('/import')">编辑采集规则</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ===== 初始态(空态) ===== -->
    <div v-else class="split">
      <div class="steps-panel pad-idle">
        <div class="panel-label idle-label">采集链路</div>
        <div class="idle-steps">
          <div v-for="s in idleSteps" :key="s.n" class="idle-step">
            <div class="idle-dot">{{ s.n }}</div>
            <div>
              <div class="idle-name">{{ s.label }}</div>
              <div class="idle-wait">待执行</div>
            </div>
          </div>
        </div>
      </div>
      <div class="empty">
        <div class="empty-ico">
          <svg
            width="26"
            height="26"
            viewBox="0 0 16 16"
            fill="none"
            stroke="#5a4a86"
            stroke-width="1.3"
            stroke-linecap="round"
            stroke-linejoin="round">
            <rect x="2.5" y="3" width="11" height="10" rx="1.6" />
            <path d="M5 6.5l2 1.6-2 1.6M8.6 10h2.8" />
          </svg>
        </div>
        <div class="empty-title">尚未开始调试</div>
        <div class="empty-desc">
          选择任务与测试关键词,点击「开始调试」逐步执行采集链路,每一步的请求、响应与解析结果都会展示在这里。
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.debug {
  display: flex;
  flex-direction: column;
  height: 100%;
  line-height: normal;
}

/* 头部 */
.head {
  flex: none;
  padding: 22px 28px 16px;
}
.head-row {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 14px;
}
.head-row h1 {
  font-size: 24px;
  font-weight: 700;
  letter-spacing: -0.02em;
}
.status {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}
.status.fail {
  color: var(--danger);
}
.status.idle {
  color: var(--text-secondary);
}
.sdot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: currentColor;
}
.status.idle .sdot {
  background: #56565f;
}

/* 控制栏 */
.ctrl {
  display: flex;
  align-items: center;
  gap: 10px;
}
.src-sel {
  display: flex;
  align-items: center;
  gap: 9px;
  height: 38px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 9px;
  padding: 0 12px;
  cursor: pointer;
}
.src-sel:hover {
  border-color: #33333f;
}
.type-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border-radius: 5px;
  padding: 2px 7px;
  font-size: 10.5px;
  font-weight: 600;
}
.type-badge.web {
  background: rgba(224, 168, 90, 0.12);
  border: 1px solid rgba(224, 168, 90, 0.35);
  color: var(--warning);
}
.type-badge.api {
  background: rgba(45, 212, 191, 0.12);
  border: 1px solid rgba(45, 212, 191, 0.4);
  color: var(--success);
}
.type-badge .glyph {
  font-weight: 700;
}
.src-name {
  font-size: 13px;
  color: var(--text);
}
.kw {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 38px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 9px;
  padding: 0 12px;
  flex: 1;
  max-width: 300px;
}
.kw-label {
  font-size: 11px;
  color: #7a7a87;
  flex: none;
}
.kw input {
  flex: 1;
  min-width: 0;
  background: none;
  border: none;
  outline: none;
  color: #cdccd8;
  font-size: 12.5px;
}
.run {
  display: flex;
  align-items: center;
  gap: 7px;
  height: 38px;
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
.refresh {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border-radius: 9px;
  background: var(--bg-elevated);
  border: 1px solid #2e2e38;
  color: #cdccd8;
  cursor: pointer;
}
.refresh:hover {
  border-color: #3a3a46;
}
.seg {
  margin-left: auto;
  display: flex;
  height: 38px;
  padding: 2px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 9px;
}
.seg span {
  display: flex;
  align-items: center;
  padding: 0 11px;
  border-radius: 7px;
  font-size: 11px;
  color: var(--text-secondary);
  cursor: pointer;
}
.seg span.on:first-child {
  color: #fff;
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
}
.seg span.on:last-child {
  color: #cdccd8;
  background: var(--bg-elevated);
}

/* 主体分栏 */
.split {
  flex: 1;
  display: flex;
  min-height: 0;
}
.steps-panel {
  width: 300px;
  flex: none;
  border-right: 1px solid var(--border-subtle);
  padding: 16px 14px;
  overflow-y: auto;
  background: #0c0c12;
}
.panel-label {
  font-size: 10.5px;
  letter-spacing: 0.04em;
  color: #56565f;
  font-weight: 600;
  padding: 0 4px 10px;
}

/* 采集链路时间线(调试态) */
.timeline {
  display: flex;
  flex-direction: column;
}
.tl-step {
  display: flex;
  gap: 11px;
}
.tl-rail {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: none;
}
.tl-dot {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
}
.tl-dot.ok {
  background: rgba(52, 211, 153, 0.12);
  border: 1.5px solid #34d399;
}
.tl-dot.fail {
  background: rgba(224, 68, 62, 0.14);
  border: 1.5px solid var(--danger);
}
.tl-line {
  width: 2px;
  flex: 1;
  min-height: 14px;
}
.tl-line.ok {
  background: #34d399;
}
.tl-line.grad {
  background: linear-gradient(#34d399, #e0443e);
}
.tl-body {
  padding-bottom: 14px;
  flex: 1;
  min-width: 0;
}
.tl-head {
  display: flex;
  align-items: center;
  gap: 7px;
}
.tl-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
}
.tl-name.fail {
  font-weight: 700;
  color: #f1837d;
}
.tl-stat {
  font-size: 10px;
  color: #5dd9b8;
}
.tl-badge {
  font-size: 10px;
  color: var(--danger);
  background: rgba(224, 68, 62, 0.14);
  border-radius: 4px;
  padding: 1px 6px;
}
.tl-meta {
  font-size: 10.5px;
  color: #7a7a87;
  margin-top: 3px;
}
.tl-meta.fail {
  color: #c98a86;
  margin-top: 4px;
}
.card-fail {
  flex: 1;
  min-width: 0;
  background: rgba(224, 68, 62, 0.07);
  border: 1px solid rgba(224, 68, 62, 0.35);
  border-radius: 9px;
  padding: 9px 11px;
  margin-top: -2px;
}

/* 右侧详情 */
.detail {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.detail-head {
  flex: none;
  padding: 16px 24px 0;
}
.dh-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}
.dh-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--text);
}
.dh-badge {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: var(--danger);
  background: rgba(224, 68, 62, 0.12);
  border: 1px solid rgba(224, 68, 62, 0.35);
  border-radius: 6px;
  padding: 2px 9px;
}
.err-banner {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  background: rgba(224, 68, 62, 0.07);
  border: 1px solid rgba(224, 68, 62, 0.3);
  border-radius: 9px;
  padding: 11px 13px;
  margin-bottom: 14px;
}
.eb-ico {
  flex: none;
  margin-top: 1px;
}
.eb-text {
  min-width: 0;
}
.eb-title {
  font-size: 12.5px;
  color: #f1a8a4;
  font-weight: 600;
  margin-bottom: 2px;
}
.eb-desc {
  font-size: 11.5px;
  color: #a98a88;
  line-height: 1.5;
}
.amber {
  color: #d8b27a;
}
.accent {
  color: var(--accent-text);
}

/* tabs */
.tabs {
  display: flex;
  gap: 2px;
  border-bottom: 1px solid #20202a;
}
.tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 15px;
  font-size: 12.5px;
  color: var(--text-secondary);
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  cursor: pointer;
}
.tab.on {
  color: var(--text);
  border-bottom-color: var(--accent);
}
.t-code {
  font-size: 10px;
  color: #5dd9b8;
}
.t-reddot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--danger);
}

/* tab body */
.tab-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px 24px 24px;
}
.pane {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.blk-label {
  font-size: 10.5px;
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 7px;
}
.blk-label.mt {
  margin-top: 2px;
  margin-bottom: 0;
}

/* 请求 */
.req-line {
  display: flex;
  align-items: center;
  gap: 9px;
}
.method {
  font-size: 11px;
  font-weight: 700;
  border-radius: 5px;
  padding: 2px 8px;
}
.method.get {
  color: #5dd9b8;
  background: rgba(45, 212, 191, 0.12);
  border: 1px solid rgba(45, 212, 191, 0.35);
}
.req-url {
  font-size: 12px;
  color: #cdccd8;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.hdr-blk {
  background: var(--bg);
  border: 1px solid #24242e;
  border-radius: 9px;
  padding: 11px 13px;
  font-size: 11.5px;
  line-height: 1.9;
}
.hk {
  color: #8a86a6;
}
.hv {
  color: #a9a4c9;
}
.hv.dim {
  color: #7a7a87;
}
.enc {
  color: #5dd9b8;
}
.directives {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.directive {
  font-size: 11px;
  color: var(--warning);
  background: rgba(224, 168, 90, 0.1);
  border: 1px dashed rgba(224, 168, 90, 0.4);
  border-radius: 5px;
  padding: 3px 9px;
}

/* 响应 */
.resp-meta {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
  font-size: 11.5px;
}
.rm-code {
  font-size: 11.5px;
  font-weight: 600;
  color: #5dd9b8;
  background: rgba(45, 212, 191, 0.12);
  border: 1px solid rgba(45, 212, 191, 0.3);
  border-radius: 5px;
  padding: 2px 8px;
}
.rm-item {
  color: var(--text-secondary);
}
.rm-item .mono {
  color: #cdccd8;
}
.rm-item .amber {
  color: #d8b27a;
}
.resp-warn {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(224, 68, 62, 0.07);
  border: 1px solid rgba(224, 68, 62, 0.28);
  border-radius: 8px;
  padding: 8px 11px;
  font-size: 11.5px;
  color: #d99893;
}
.code-blk {
  background: #0b0b11;
  border: 1px solid #24242e;
  border-radius: 9px;
  overflow: hidden;
  font-size: 11.5px;
  line-height: 1.7;
}
.cb-row {
  display: flex;
}
.gutter {
  flex: none;
  width: 38px;
  text-align: right;
  padding: 9px 9px 9px 0;
  color: #3e3e48;
  background: var(--bg);
  border-right: 1px solid #1c1c24;
  user-select: none;
}
.cb-code {
  padding: 9px 13px;
  color: #a9a4c9;
  overflow-x: auto;
}
.cb-line {
  white-space: pre;
}
.cb-code .tag {
  color: #7fb4e6;
}
.cb-code .warn {
  color: #d8b27a;
}
.cb-code .miss {
  background: rgba(224, 68, 62, 0.16);
  color: #f1a8a4;
  border-radius: 3px;
}

/* 解析结果 */
.parse-table {
  background: var(--bg);
  border: 1px solid #24242e;
  border-radius: 9px;
  overflow: hidden;
}
.pt-head,
.pt-row {
  display: grid;
  grid-template-columns: 130px 1fr 90px;
  align-items: center;
}
.pt-head {
  font-size: 11px;
  color: var(--text-dim);
  padding: 9px 14px;
  border-bottom: 1px solid #20202a;
}
.pt-r {
  text-align: right;
}
.pt-row {
  font-size: 12px;
  padding: 10px 14px;
  border-bottom: 1px solid #18181f;
}
.pt-row:last-child {
  border-bottom: 0;
}
.pt-field {
  color: #cdccd8;
}
.pt-val {
  color: #a9a4c9;
}
.pt-row:first-child .pt-val {
  color: #6a6a76;
}
.pt-stat {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 4px;
  text-align: right;
}
.pt-stat.fail {
  color: var(--danger);
}
.pt-stat.dash {
  color: #7a7a87;
}
.upstream {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 11px;
}
.up-chip {
  border-radius: 5px;
  padding: 3px 9px;
}
.up-chip.var {
  color: var(--accent-text);
  background: rgba(124, 92, 252, 0.1);
  border: 1px solid #2e2747;
}
.up-chip.ok {
  color: #5dd9b8;
  background: rgba(45, 212, 191, 0.1);
  border: 1px solid rgba(45, 212, 191, 0.25);
}
.parse-actions {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-top: 4px;
}
.btn-primary {
  height: 34px;
  padding: 0 14px;
  border-radius: 8px;
  border: none;
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
  color: #fff;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
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

/* 初始态(空态) */
.pad-idle {
  padding: 16px 14px;
  overflow-y: visible;
}
.idle-label {
  padding: 0 4px 12px;
}
.idle-steps {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.idle-step {
  display: flex;
  align-items: center;
  gap: 11px;
}
.idle-dot {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 1.5px solid #2e2e38;
  font-size: 11px;
  color: var(--text-dim);
}
.idle-name {
  font-size: 13px;
  color: #9a9aa6;
}
.idle-wait {
  font-size: 10.5px;
  color: #56565f;
}
.empty {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 40px;
}
.empty-ico {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 60px;
  height: 60px;
  border-radius: 15px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  margin-bottom: 16px;
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
  max-width: 320px;
}
</style>

<style>
/* Reka 下拉 portal 到 body 外,scoped 够不着 → 全局样式(db- 前缀避免外泄) */
.db-menu {
  min-width: 200px;
  background: #16161e;
  border: 1px solid #2a2a34;
  border-radius: 10px;
  padding: 5px;
  z-index: 1001;
  box-shadow: 0 14px 36px rgba(0, 0, 0, 0.5);
}
.db-menu:focus {
  outline: none;
}
.db-menu-item {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 7px 10px;
  font-size: 12.5px;
  color: #cdccd8;
  border-radius: 7px;
  cursor: pointer;
  outline: none;
}
.db-menu-item[data-highlighted] {
  background: rgba(124, 92, 252, 0.16);
  color: #fff;
}
.db-menu-item.active {
  color: var(--accent-text);
}
.db-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex: none;
  border-radius: 5px;
  padding: 2px 7px;
  font-size: 10.5px;
  font-weight: 600;
}
.db-badge.web {
  background: rgba(224, 168, 90, 0.12);
  border: 1px solid rgba(224, 168, 90, 0.35);
  color: var(--warning);
}
.db-badge.api {
  background: rgba(45, 212, 191, 0.12);
  border: 1px solid rgba(45, 212, 191, 0.4);
  color: var(--success);
}
</style>
