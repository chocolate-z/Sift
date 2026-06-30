<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { compileCatalogRule, compileSearchRule, parseBookSource, type ParseResult } from '@sift/source-parser'
import type { Rule } from '@sift/core-ir'
import { SAMPLE_SOURCES } from '@/data/sampleSources'
import { isTauri, runRule } from '@/services/engine'
import { saveDataset } from '@/services/storage'
import { useDatasetStore } from '@/stores/dataset'

const router = useRouter()
const dataset = useDatasetStore()

const input = ref(JSON.stringify(SAMPLE_SOURCES.jgb, null, 2))
const result = ref<ParseResult | null>(null)
const error = ref<string | null>(null)
const rawObj = ref<Record<string, unknown> | null>(null)

const keyword = ref('剑来')
const running = ref(false)
const runError = ref<string | null>(null)
const runNotice = ref<string | null>(null)

function parse() {
  error.value = null
  runError.value = null
  runNotice.value = null
  let raw: unknown
  try {
    raw = JSON.parse(input.value)
  } catch (e) {
    result.value = null
    rawObj.value = null
    error.value = `JSON 解析失败:${(e as Error).message}`
    return
  }
  rawObj.value = raw as Record<string, unknown>
  try {
    result.value = parseBookSource(raw as Parameters<typeof parseBookSource>[0])
  } catch (e) {
    result.value = null
    error.value = `规则解析出错:${(e as Error).message}`
  }
}
function loadSample(key: 'qimao' | 'jgb') {
  input.value = JSON.stringify(SAMPLE_SOURCES[key], null, 2)
  parse()
}

async function runCompiled(rule: Rule) {
  runError.value = null
  runNotice.value = null
  const param = rule.entry.kind === 'keyword' ? rule.entry.param : 'keyword'
  if (!isTauri) {
    runNotice.value = '真实运行仅在桌面端可用(浏览器预览无 Tauri 引擎)。请用 pnpm tauri:dev 运行。'
    return
  }
  running.value = true
  try {
    const out = await runRule(rule, { [param]: keyword.value })
    if (!out.records.length) {
      const tail = out.warnings.slice(0, 2).join(' / ')
      runNotice.value = `未解析到数据(0 条)。${tail || '检查关键词、选择器或站点是否可达'}`
      return
    }
    // 引擎 RunOutput.records 以列显示名为键(assemble_output 用 col.name),故 field 取 name。
    const cols = rule.output.columns.map((c) => ({ name: c.name, field: c.name, type: c.type }))
    dataset.setResult(cols, out.records, rule.meta.name, out.warnings)
    // 落库留存(best-effort,失败不影响预览)。
    saveDataset(rule.meta.name, rule.meta.name, cols, out.records).catch(() => {})
    router.push('/data')
  } catch (e) {
    // Tauri 命令以 Err(String) 拒绝,catch 到的是字符串而非 Error。
    const msg = e instanceof Error ? e.message : typeof e === 'string' ? e : JSON.stringify(e)
    runError.value = `运行失败:${msg}`
  } finally {
    running.value = false
  }
}
function runSearch() {
  if (!rawObj.value) return
  runCompiled(compileSearchRule(rawObj.value as Parameters<typeof compileSearchRule>[0]))
}
function runCatalog() {
  if (!rawObj.value) return
  runCompiled(compileCatalogRule(rawObj.value as Parameters<typeof compileCatalogRule>[0]))
}
const statusMeta: Record<string, { label: string; cls: string }> = {
  ok: { label: '解析成功', cls: 'ok' },
  warning: { label: '有警告', cls: 'warn' },
  error: { label: '解析失败', cls: 'err' }
}
const depLabel = (by: 'input' | number | 'unknown') =>
  by === 'input' ? '用户输入' : by === 'unknown' ? '未解析' : `步骤 ${by + 1}`

onMounted(parse)
</script>

<template>
  <section class="view paste">
    <header class="head">
      <div class="head-row">
        <div>
          <h1>粘贴规则</h1>
          <p class="sub">粘贴书源 JSON,Sift 现场解析(本地、不联网)· 由 @sift/source-parser 真实解析</p>
        </div>
        <button type="button" class="btn-soft" @click="router.push('/import')">卡片视图 ›</button>
      </div>
    </header>

    <div class="body">
      <!-- 左:编辑器 -->
      <div class="editor">
        <div class="ed-bar">
          <span class="ed-label">书源 JSON</span>
          <span class="ed-samples">
            示例
            <button type="button" class="chip-btn" @click="loadSample('qimao')">七猫 API</button>
            <button type="button" class="chip-btn" @click="loadSample('jgb')">旧钢笔 网页</button>
          </span>
        </div>
        <textarea v-model="input" class="ed-area mono" spellcheck="false" />
        <button type="button" class="btn-parse" @click="parse">解析</button>
      </div>

      <!-- 右:真实解析结果 -->
      <div class="result">
        <div v-if="error" class="err-banner">
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="#E0443E" stroke-width="1.6">
            <circle cx="8" cy="8" r="6.2" />
            <path d="M8 5v3.5M8 10.7v.01" />
          </svg>
          {{ error }}
        </div>

        <template v-else-if="result">
          <!-- 搜索预览 · 接采集引擎 -->
          <div class="rpanel run-panel">
            <div class="rp-title">搜索预览 · 接采集引擎</div>
            <div class="run-row">
              <input
                v-model="keyword"
                class="kw-input mono"
                placeholder="关键词,如 剑来"
                spellcheck="false"
                @keyup.enter="runSearch" />
              <button type="button" class="btn-run" :disabled="running" @click="runSearch">
                {{ running ? '运行中…' : '搜索预览' }}
              </button>
              <button type="button" class="btn-run alt" :disabled="running" @click="runCatalog">采集目录</button>
            </div>
            <div class="run-hint">搜索预览 = 结果书单;采集目录 = 每本书的章节列表(2 步链路,请求略多)</div>
            <div v-if="runError" class="run-msg err">✕ {{ runError }}</div>
            <div v-else-if="runNotice" class="run-msg notice">{{ runNotice }}</div>
          </div>

          <!-- 概览 -->
          <div class="rpanel">
            <div class="ov-row">
              <span class="type-badge" :class="result.sourceType.type">
                {{ result.sourceType.type === 'api' ? 'API 源' : '网页源' }}
              </span>
              <span class="conf mono">置信度 {{ Math.round(result.sourceType.confidence * 100) }}%</span>
              <span class="st-pill" :class="statusMeta[result.status]?.cls">
                {{ statusMeta[result.status]?.label }}
              </span>
            </div>
            <div class="ov-reasons">{{ result.sourceType.reasons.join(' · ') }}</div>
          </div>

          <!-- 采集链路 -->
          <div class="rpanel">
            <div class="rp-title">采集链路 · {{ result.steps.length }} 步</div>
            <div v-for="s in result.steps" :key="s.index" class="step">
              <div class="step-head">
                <span class="step-num">{{ s.index + 1 }}</span>
                <span class="step-name">{{ s.name }}</span>
                <span class="mode-badge" :class="s.parseMode">{{ s.parseMode === 'json' ? 'JSON' : 'CSS' }}</span>
                <span class="step-src">{{ s.urlSource }}</span>
              </div>
              <div v-if="s.urlTemplate" class="step-url mono">{{ s.urlTemplate }}</div>
              <div v-else-if="s.urlSelector" class="step-url mono">‹extract› {{ s.urlSelector }}</div>
              <div v-if="s.placeholderDeps.length" class="step-deps">
                <span v-for="d in s.placeholderDeps" :key="d.name" class="dep-chip">
                  {{ d.name }}
                  <i>←</i>
                  {{ depLabel(d.satisfiedBy) }}
                </span>
              </div>
              <div v-if="s.produces.length" class="step-prod">产出:{{ s.produces.join(', ') }}</div>
              <div v-if="Object.keys(s.rules).length" class="rules">
                <div v-for="(sel, f) in s.rules" :key="f" class="rule">
                  <span class="rule-k">{{ f }}</span>
                  <span class="rule-v mono">{{ sel }}</span>
                </div>
              </div>
              <div v-for="(n, i) in s.notes" :key="i" class="step-note">⚠ {{ n }}</div>
            </div>
          </div>

          <!-- 搜索字段映射 -->
          <div v-if="result.searchResult" class="rpanel">
            <div class="rp-title">
              搜索结果字段
              <span v-if="result.searchResult.limit != null" class="rp-sub">
                取前 {{ result.searchResult.limit }} 条
              </span>
            </div>
            <div v-if="result.searchResult.listSelector" class="kv">
              <span class="kv-k">列表</span>
              <span class="kv-v mono">{{ result.searchResult.listSelector }}</span>
            </div>
            <div class="rules">
              <div v-for="(fr, f) in result.searchResult.fields" :key="f" class="rule">
                <span class="rule-k">{{ f }}</span>
                <span class="rule-v mono">{{ fr.jsonPath || fr.selector }}{{ fr.attr ? ' @' + fr.attr : '' }}</span>
                <span v-if="fr.fallbacks.length" class="fb-tag">+{{ fr.fallbacks.length }} 备选</span>
              </div>
            </div>
          </div>

          <!-- 正文过滤(Base64 解码) -->
          <div v-if="result.contentFilters.length" class="rpanel">
            <div class="rp-title">正文过滤 · {{ result.contentFilters.length }} 条</div>
            <div v-for="(f, i) in result.contentFilters" :key="i" class="filter">
              <span class="f-status" :class="f.status">{{ f.status === 'decoded' ? 'Base64 已解码' : '原样' }}</span>
              <span class="f-text mono">{{ f.decoded ?? f.raw }}</span>
            </div>
          </div>

          <!-- 占位符 / 未识别字段 -->
          <div v-if="result.placeholders.length || result.unknownFields.length" class="rpanel">
            <div v-if="result.placeholders.length" class="chips-row">
              <span class="cr-label">占位符</span>
              <span v-for="p in result.placeholders" :key="p" class="ph-chip mono">{{ p }}</span>
            </div>
            <div v-if="result.unknownFields.length" class="chips-row">
              <span class="cr-label">未识别(容错保留)</span>
              <span v-for="u in result.unknownFields" :key="u" class="uk-chip mono">{{ u }}</span>
            </div>
          </div>

          <!-- 警告 / 错误 -->
          <div v-if="result.warnings.length || result.errors.length" class="rpanel">
            <div v-for="(w, i) in result.errors" :key="'e' + i" class="msg err">✕ {{ w }}</div>
            <div v-for="(w, i) in result.warnings" :key="'w' + i" class="msg warn">⚠ {{ w }}</div>
          </div>
        </template>
      </div>
    </div>
  </section>
</template>

<style scoped>
.paste {
  display: flex;
  flex-direction: column;
  height: 100%;
  line-height: normal;
}
.head {
  flex: none;
  padding: 22px 28px 14px;
}
.head-row {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
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

.body {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 16px;
  padding: 12px 28px 24px;
}

/* 编辑器 */
.editor {
  width: 40%;
  min-width: 320px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.ed-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.ed-label {
  font-size: 11px;
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.ed-samples {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: #7a7a87;
}
.chip-btn {
  height: 24px;
  padding: 0 9px;
  border-radius: 6px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  color: #cdccd8;
  font-size: 11px;
  cursor: pointer;
}
.chip-btn:hover {
  border-color: var(--accent);
  color: var(--accent-text);
}
.ed-area {
  flex: 1;
  min-height: 0;
  resize: none;
  background: #0b0b11;
  border: 1px solid #24242e;
  border-radius: 10px;
  padding: 13px 15px;
  color: #a9a4c9;
  font-size: 11.5px;
  line-height: 1.6;
  outline: none;
  white-space: pre;
  overflow: auto;
}
.ed-area:focus {
  border-color: var(--accent);
}
.btn-parse {
  flex: none;
  align-self: flex-start;
  height: 38px;
  padding: 0 22px;
  border-radius: 9px;
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
  border: none;
  color: #fff;
  font-size: 13.5px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(124, 92, 252, 0.32);
}

/* 结果 */
.result {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.err-banner {
  display: flex;
  align-items: center;
  gap: 9px;
  background: rgba(224, 68, 62, 0.08);
  border: 1px solid rgba(224, 68, 62, 0.35);
  border-radius: 10px;
  padding: 12px 14px;
  font-size: 12.5px;
  color: #f1a8a4;
}
.rpanel {
  background: #14141b;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 14px 16px;
}
.rp-title {
  display: flex;
  align-items: center;
  gap: 9px;
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 11px;
}
.rp-sub {
  font-size: 11px;
  color: #7a7a87;
  font-weight: 400;
}

/* 搜索预览 */
.run-row {
  display: flex;
  gap: 9px;
}
.kw-input {
  flex: 1;
  min-width: 0;
  height: 38px;
  padding: 0 12px;
  background: #0b0b11;
  border: 1px solid #24242e;
  border-radius: 9px;
  color: #cdccd8;
  font-size: 13px;
  outline: none;
}
.kw-input:focus {
  border-color: var(--accent);
}
.btn-run {
  flex: none;
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
.btn-run.alt {
  background: var(--bg-elevated);
  border: 1px solid #34344a;
  color: #cdccd8;
  box-shadow: none;
}
.btn-run.alt:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent-text);
}
.btn-run:disabled {
  opacity: 0.55;
  cursor: not-allowed;
  box-shadow: none;
}
.run-hint {
  margin-top: 8px;
  font-size: 11px;
  color: #7a7a87;
  line-height: 1.5;
}
.run-msg {
  margin-top: 9px;
  font-size: 11.5px;
  line-height: 1.5;
}
.run-msg.err {
  color: #f1837d;
}
.run-msg.notice {
  color: #d8b27a;
}

/* 概览 */
.ov-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.type-badge {
  font-size: 11.5px;
  font-weight: 600;
  border-radius: 7px;
  padding: 3px 9px;
}
.type-badge.api {
  color: var(--success);
  background: rgba(45, 212, 191, 0.12);
  border: 1px solid rgba(45, 212, 191, 0.4);
}
.type-badge.web {
  color: var(--warning);
  background: rgba(224, 168, 90, 0.12);
  border: 1px solid rgba(224, 168, 90, 0.4);
}
.conf {
  font-size: 11.5px;
  color: var(--accent-text);
}
.st-pill {
  margin-left: auto;
  font-size: 11px;
  border-radius: 6px;
  padding: 2px 9px;
}
.st-pill.ok {
  color: #5dd9b8;
  background: rgba(45, 212, 191, 0.1);
  border: 1px solid rgba(45, 212, 191, 0.3);
}
.st-pill.warn {
  color: #d8b27a;
  background: rgba(224, 168, 90, 0.1);
  border: 1px solid rgba(224, 168, 90, 0.3);
}
.st-pill.err {
  color: #f1837d;
  background: rgba(224, 68, 62, 0.1);
  border: 1px solid rgba(224, 68, 62, 0.35);
}
.ov-reasons {
  margin-top: 8px;
  font-size: 11.5px;
  color: #8a86a6;
  line-height: 1.5;
}

/* 步骤 */
.step {
  border-top: 1px solid #20202a;
  padding: 11px 0;
}
.step:first-of-type {
  border-top: 0;
  padding-top: 0;
}
.step-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.step-num {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  flex: none;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
  color: #fff;
  font-size: 11px;
  font-weight: 700;
}
.step-name {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text);
}
.mode-badge {
  font-size: 9.5px;
  font-weight: 700;
  border-radius: 4px;
  padding: 1px 6px;
  color: #9a9aa6;
  background: var(--bg-card);
  border: 1px solid #2a2a34;
}
.step-src {
  margin-left: auto;
  font-size: 10.5px;
  color: #7a7a87;
}
.step-url {
  margin-top: 7px;
  font-size: 11px;
  color: #a9a4c9;
  background: var(--bg);
  border: 1px solid #24242e;
  border-radius: 6px;
  padding: 6px 9px;
  word-break: break-all;
  line-height: 1.5;
}
.step-deps {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}
.dep-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 10.5px;
  color: var(--accent-text);
  background: rgba(124, 92, 252, 0.1);
  border: 1px solid #3a3066;
  border-radius: 5px;
  padding: 1px 7px;
}
.dep-chip i {
  color: #56565f;
  font-style: normal;
}
.step-prod {
  margin-top: 7px;
  font-size: 10.5px;
  color: #5dd9b8;
}
.rules {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.rule {
  display: flex;
  align-items: center;
  gap: 9px;
  font-size: 11px;
}
.rule-k {
  flex: none;
  width: 84px;
  color: #cdccd8;
}
.rule-v {
  flex: 1;
  min-width: 0;
  color: #8a86a6;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.fb-tag {
  flex: none;
  font-size: 9.5px;
  color: #9d83ff;
  background: rgba(124, 92, 252, 0.1);
  border: 1px solid #2e2747;
  border-radius: 4px;
  padding: 1px 6px;
}
.step-note {
  margin-top: 6px;
  font-size: 10.5px;
  color: #d8b27a;
}

/* kv */
.kv {
  display: flex;
  gap: 9px;
  font-size: 11px;
  margin-bottom: 9px;
}
.kv-k {
  flex: none;
  width: 40px;
  color: #7a7a87;
}
.kv-v {
  flex: 1;
  min-width: 0;
  color: #a9a4c9;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 过滤 */
.filter {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 6px 0;
}
.f-status {
  flex: none;
  font-size: 9.5px;
  border-radius: 4px;
  padding: 1px 7px;
}
.f-status.decoded {
  color: #5dd9b8;
  background: rgba(45, 212, 191, 0.1);
  border: 1px solid rgba(45, 212, 191, 0.3);
}
.f-status.kept {
  color: #9a9aa6;
  background: var(--bg-card);
  border: 1px solid var(--border);
}
.f-text {
  flex: 1;
  min-width: 0;
  font-size: 11px;
  color: #cdccd8;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* chips */
.chips-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}
.chips-row + .chips-row {
  margin-top: 9px;
}
.cr-label {
  font-size: 10.5px;
  color: #7a7a87;
  margin-right: 3px;
}
.ph-chip {
  font-size: 10.5px;
  color: var(--accent-text);
  background: rgba(124, 92, 252, 0.1);
  border: 1px solid #3a3066;
  border-radius: 5px;
  padding: 1px 7px;
}
.uk-chip {
  font-size: 10.5px;
  color: #d8b27a;
  background: rgba(224, 168, 90, 0.1);
  border: 1px solid rgba(224, 168, 90, 0.3);
  border-radius: 5px;
  padding: 1px 7px;
}
.msg {
  font-size: 11.5px;
  line-height: 1.5;
  padding: 2px 0;
}
.msg.err {
  color: #f1837d;
}
.msg.warn {
  color: #d8b27a;
}
</style>
