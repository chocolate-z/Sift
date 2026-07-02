<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useDatasetStore } from '@/stores/dataset'
import { isTauri, runRule, type EngineRunOutput, type StepTrace } from '@/services/engine'
import { resolveRuleCredentials } from '@/services/credentials'

const router = useRouter()
const ds = useDatasetStore()

type Tab = 'req' | 'resp' | 'parse'
const tab = ref<Tab>('parse')
const running = ref(false)
const runErr = ref<string | null>(null)
const result = ref<EngineRunOutput | null>(null)
const selected = ref(0)

const hasRule = computed(() => !!ds.lastRule)
const ruleName = computed(() => ds.lastRule?.meta.name ?? '')
const kwParam = computed(() => {
  const e = ds.lastRule?.entry
  return e?.kind === 'keyword' ? e.param : 'keyword'
})
const keyword = ref(ds.lastInputs[kwParam.value] ?? '')

const traces = computed<StepTrace[]>(() => result.value?.traces ?? [])
const selectedTrace = computed<StepTrace | null>(() => traces.value[selected.value] ?? null)

function stepStatus(t: StepTrace): 'ok' | 'warn' | 'fail' {
  if (t.httpStatus === 0 || t.httpStatus >= 400) return 'fail'
  if (t.recordCount === 0 || t.warnings.length > 0) return 'warn'
  return 'ok'
}
const statusLabel: Record<string, string> = { ok: '成功', warn: '有告警', fail: '失败' }

const selectedRecords = computed(() => {
  const t = selectedTrace.value
  if (!t) return []
  return (result.value?.stepRecords?.[t.stepId] ?? []).slice(0, 3)
})

function clip(v: string | null): string {
  if (v == null || v === '') return '—'
  return v.length > 160 ? v.slice(0, 160) + '…' : v
}

function selectStep(i: number) {
  selected.value = i
  tab.value = 'parse'
}

async function runDebug() {
  if (!hasRule.value || running.value) return
  runErr.value = null
  if (!isTauri) {
    runErr.value = '调试运行仅在桌面端可用(浏览器预览无 Tauri 引擎)。请用 pnpm tauri:dev 运行。'
    return
  }
  running.value = true
  try {
    const inputs = { ...ds.lastInputs, [kwParam.value]: keyword.value }
    // 复用上次运行时盖到规则上的 credentialRef,重新解出 Cookie(否则重跑丢凭据)。
    const credentials = await resolveRuleCredentials(ds.lastRule!)
    const out = await runRule(ds.lastRule!, inputs, credentials)
    result.value = out
    // 默认选中第一个有问题的步骤(失败/告警),否则最后一步。
    const bad = out.traces.findIndex((t) => stepStatus(t) !== 'ok')
    selected.value = bad >= 0 ? bad : Math.max(0, out.traces.length - 1)
    tab.value = 'parse'
  } catch (e) {
    runErr.value = `调试运行失败:${e instanceof Error ? e.message : typeof e === 'string' ? e : String(e)}`
    result.value = null
  } finally {
    running.value = false
  }
}
</script>

<template>
  <section class="view debug">
    <header class="head">
      <div class="head-row">
        <h1>调试控制台</h1>
        <span v-if="running" class="status busy">
          <i class="sdot" />
          运行中…
        </span>
        <span v-else-if="runErr" class="status fail">
          <i class="sdot" />
          调试失败
        </span>
        <span v-else-if="result" class="status ok">
          <i class="sdot" />
          完成 · {{ traces.length }} 步
        </span>
        <span v-else class="status idle">
          <i class="sdot" />
          就绪 · 待开始调试
        </span>
      </div>

      <div v-if="hasRule" class="ctrl">
        <span class="rule-pill">
          <span class="rp-label">规则</span>
          {{ ruleName }}
        </span>
        <div class="kw">
          <span class="kw-label">关键词</span>
          <input class="mono" v-model="keyword" spellcheck="false" @keyup.enter="runDebug" />
        </div>
        <button type="button" class="run" :disabled="running" @click="runDebug">
          <svg width="13" height="13" viewBox="0 0 16 16" fill="#fff"><path d="M4 3l9 5-9 5z" /></svg>
          {{ running ? '运行中…' : '开始调试' }}
        </button>
      </div>
    </header>

    <!-- 无规则:引导先去采集 -->
    <div v-if="!hasRule" class="empty">
      <div class="empty-title">还没有可调试的规则</div>
      <div class="empty-desc">先在「粘贴规则」里跑一次采集,再回到这里逐步调试,查看每步的请求 / 响应 / 解析。</div>
      <button type="button" class="btn-primary" @click="router.push('/pick')">去点选采集</button>
    </div>

    <!-- 运行出错 -->
    <div v-else-if="runErr" class="empty">
      <div class="empty-title fail">调试运行失败</div>
      <div class="empty-desc">{{ runErr }}</div>
    </div>

    <!-- 还没跑:提示开始 -->
    <div v-else-if="!result" class="empty">
      <div class="empty-title">就绪</div>
      <div class="empty-desc">点「开始调试」逐步运行规则「{{ ruleName }}」,查看每步的请求、响应与解析产出。</div>
    </div>

    <!-- 调试结果 -->
    <div v-else class="split">
      <!-- 左:步骤时间线 -->
      <div class="steps-panel">
        <div class="panel-label">采集链路 · {{ traces.length }} 步</div>
        <div class="timeline">
          <div
            v-for="(t, i) in traces"
            :key="t.stepId"
            class="tl-step"
            :class="{ on: i === selected }"
            @click="selectStep(i)">
            <div class="tl-dot" :class="stepStatus(t)">{{ i + 1 }}</div>
            <div class="tl-body">
              <div class="tl-head">
                <span class="tl-name" :class="stepStatus(t)">{{ t.label }}</span>
                <span class="tl-stat" :class="stepStatus(t)">{{ statusLabel[stepStatus(t)] }}</span>
              </div>
              <div class="tl-meta mono">{{ t.httpStatus || '—' }} · {{ t.elapsedMs }}ms · {{ t.recordCount }} 条</div>
            </div>
          </div>
        </div>
      </div>

      <!-- 右:步骤详情 -->
      <div class="detail" v-if="selectedTrace">
        <div class="detail-head">
          <span class="dh-title">{{ selected + 1 }} · {{ selectedTrace.label }}</span>
          <span class="dh-badge" :class="stepStatus(selectedTrace)">
            HTTP {{ selectedTrace.httpStatus || '—' }} · {{ statusLabel[stepStatus(selectedTrace)] }}
          </span>
        </div>

        <div class="tabs">
          <div class="tab" :class="{ on: tab === 'req' }" @click="tab = 'req'">请求</div>
          <div class="tab" :class="{ on: tab === 'resp' }" @click="tab = 'resp'">响应</div>
          <div class="tab" :class="{ on: tab === 'parse' }" @click="tab = 'parse'">
            解析结果
            <span class="t-code mono">{{ selectedTrace.recordCount }}</span>
          </div>
        </div>

        <div class="tab-body">
          <!-- 请求 -->
          <template v-if="tab === 'req'">
            <div class="kv">
              <span class="kv-k">请求 URL</span>
              <span class="kv-v mono break">{{ selectedTrace.requestUrl || '—' }}</span>
            </div>
            <div class="kv">
              <span class="kv-k">执行次数</span>
              <span class="kv-v mono">{{ selectedTrace.execCount }}(fanout 每条上游一次)</span>
            </div>
            <div class="kv">
              <span class="kv-k">关键词</span>
              <span class="kv-v mono">{{ keyword || '—' }}</span>
            </div>
          </template>

          <!-- 响应 -->
          <template v-else-if="tab === 'resp'">
            <div class="kv">
              <span class="kv-k">HTTP 状态</span>
              <span class="kv-v mono" :class="{ bad: stepStatus(selectedTrace) === 'fail' }">
                {{ selectedTrace.httpStatus || '(无响应)' }}
              </span>
            </div>
            <div class="kv">
              <span class="kv-k">耗时</span>
              <span class="kv-v mono">{{ selectedTrace.elapsedMs }} ms</span>
            </div>
            <div class="kv">
              <span class="kv-k">编码</span>
              <span class="kv-v mono">{{ selectedTrace.encodingUsed || '—' }}</span>
            </div>
          </template>

          <!-- 解析结果 -->
          <template v-else>
            <div class="kv">
              <span class="kv-k">产出</span>
              <span class="kv-v mono" :class="{ bad: selectedTrace.recordCount === 0 }">
                {{ selectedTrace.recordCount }} 条
              </span>
            </div>
            <div v-if="selectedTrace.warnings.length" class="warns">
              <div v-for="(w, i) in selectedTrace.warnings" :key="i" class="warn-line">⚠ {{ w }}</div>
            </div>
            <div v-if="selectedRecords.length" class="recs">
              <div class="recs-label">样例(前 {{ selectedRecords.length }} 条)</div>
              <div v-for="(r, i) in selectedRecords" :key="i" class="rec">
                <div v-for="(v, k) in r" :key="k" class="rec-row">
                  <span class="rec-k mono">{{ k }}</span>
                  <span class="rec-v">{{ clip(v) }}</span>
                </div>
              </div>
            </div>
            <div v-else-if="!selectedTrace.warnings.length" class="recs-empty">本步无产出记录。</div>
          </template>
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
.head {
  flex: none;
  padding: 22px 28px 14px;
}
.head-row {
  display: flex;
  align-items: center;
  gap: 12px;
}
.head-row h1 {
  margin: 0;
  font-size: 24px;
  font-weight: 700;
  letter-spacing: -0.02em;
}
.status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 600;
  padding: 3px 9px;
  border-radius: 6px;
}
.status .sdot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}
.status.idle {
  color: #8a8a96;
  background: rgba(138, 138, 150, 0.12);
}
.status.busy {
  color: #9d83ff;
  background: rgba(124, 92, 252, 0.14);
}
.status.ok {
  color: #34d399;
  background: rgba(52, 211, 153, 0.12);
}
.status.fail {
  color: #e0443e;
  background: rgba(224, 68, 62, 0.12);
}

.ctrl {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 14px;
}
.rule-pill {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 36px;
  padding: 0 12px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 9px;
  font-size: 13px;
  color: var(--text);
  font-weight: 500;
}
.rp-label {
  font-size: 11px;
  color: #7a7a87;
}
.kw {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 36px;
  padding: 0 12px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 9px;
}
.kw-label {
  font-size: 11px;
  color: #7a7a87;
}
.kw input {
  background: none;
  border: none;
  outline: none;
  color: var(--text);
  font-size: 13px;
  width: 160px;
}
.run {
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
.run:disabled {
  opacity: 0.55;
  cursor: not-allowed;
  box-shadow: none;
}

/* 空态 */
.empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 60px 20px;
}
.empty-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 8px;
}
.empty-title.fail {
  color: #e0443e;
}
.empty-desc {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.6;
  max-width: 420px;
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

/* 分栏 */
.split {
  flex: 1;
  display: grid;
  grid-template-columns: 300px 1fr;
  gap: 16px;
  padding: 6px 28px 28px;
  overflow: hidden;
}
.steps-panel,
.detail {
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--bg-card);
  overflow-y: auto;
}
.panel-label {
  padding: 12px 14px;
  font-size: 11px;
  font-weight: 600;
  color: #7a7a87;
  border-bottom: 1px solid var(--border);
}
.timeline {
  padding: 8px;
}
.tl-step {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 9px 10px;
  border-radius: 9px;
  cursor: pointer;
}
.tl-step:hover {
  background: rgba(124, 92, 252, 0.06);
}
.tl-step.on {
  background: rgba(124, 92, 252, 0.14);
}
.tl-dot {
  flex: none;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 600;
  color: #fff;
}
.tl-dot.ok {
  background: #34d399;
}
.tl-dot.warn {
  background: #d9a441;
}
.tl-dot.fail {
  background: #e0443e;
}
.tl-body {
  min-width: 0;
  flex: 1;
}
.tl-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.tl-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text);
}
.tl-name.fail {
  color: #e0443e;
}
.tl-stat {
  font-size: 10.5px;
}
.tl-stat.ok {
  color: #34d399;
}
.tl-stat.warn {
  color: #d9a441;
}
.tl-stat.fail {
  color: #e0443e;
}
.tl-meta {
  font-size: 10.5px;
  color: #7a7a87;
  margin-top: 3px;
}

/* 详情 */
.detail-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
}
.dh-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
}
.dh-badge {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 5px;
}
.dh-badge.ok {
  color: #34d399;
  background: rgba(52, 211, 153, 0.12);
}
.dh-badge.warn {
  color: #d9a441;
  background: rgba(217, 164, 65, 0.14);
}
.dh-badge.fail {
  color: #e0443e;
  background: rgba(224, 68, 62, 0.12);
}
.tabs {
  display: flex;
  gap: 4px;
  padding: 10px 16px 0;
}
.tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 12px;
  font-size: 12.5px;
  color: #8a8a96;
  border-radius: 8px 8px 0 0;
  cursor: pointer;
}
.tab.on {
  color: var(--text);
  background: var(--bg-elevated, #1a1a22);
}
.t-code {
  font-size: 10px;
  color: var(--accent-text);
  background: rgba(124, 92, 252, 0.16);
  border-radius: 6px;
  padding: 1px 6px;
}
.tab-body {
  padding: 14px 16px;
}
.kv {
  display: flex;
  gap: 12px;
  padding: 7px 0;
  border-bottom: 1px solid #1c1c24;
  font-size: 12.5px;
}
.kv-k {
  flex: none;
  width: 76px;
  color: #7a7a87;
}
.kv-v {
  color: #cdccd8;
  min-width: 0;
}
.kv-v.break {
  word-break: break-all;
}
.kv-v.bad {
  color: #e0443e;
}
.warns {
  margin-top: 10px;
}
.warn-line {
  font-size: 11.5px;
  color: #d9a441;
  padding: 3px 0;
  line-height: 1.5;
}
.recs {
  margin-top: 12px;
}
.recs-label {
  font-size: 11px;
  color: #7a7a87;
  margin-bottom: 7px;
}
.rec {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px 10px;
  margin-bottom: 8px;
}
.rec-row {
  display: flex;
  gap: 10px;
  padding: 2px 0;
  font-size: 12px;
}
.rec-k {
  flex: none;
  width: 96px;
  color: #8a86a6;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rec-v {
  color: #cdccd8;
  min-width: 0;
  word-break: break-word;
}
.recs-empty {
  margin-top: 12px;
  font-size: 12px;
  color: #7a7a87;
}
</style>
