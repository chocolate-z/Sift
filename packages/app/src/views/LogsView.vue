<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'

interface LogRow {
  time: string
  level: 'INFO' | 'WARN' | 'ERROR'
  msg: string
}
const logs = ref<LogRow[]>([
  { time: '16:57:11', level: 'INFO', msg: '引擎就绪 · 已加载 12 个规则' },
  { time: '16:57:09', level: 'INFO', msg: '七猫规则解析完成 · 识别 2 个数据源,正文过滤已解码' },
  { time: '16:56:40', level: 'WARN', msg: '旧钢笔会话即将过期 · 建议在凭据管理中更新 Cookie' },
  {
    time: '16:56:22',
    level: 'ERROR',
    msg: '旧钢笔 · 正文 .chapter_content > a:eq(1) 返回 0 字 · HTTP 200 疑似反爬提示页'
  },
  { time: '16:56:18', level: 'INFO', msg: '旧钢笔 · 目录解析成功 · 1083 章' },
  { time: '16:55:50', level: 'WARN', msg: '网络限速触发 · 请求间隔自动提升至 800ms' },
  { time: '16:55:31', level: 'INFO', msg: '书城商品列表 · 抓取完成 · 5 条 / 当前页' },
  { time: '16:55:02', level: 'ERROR', msg: '书城 API Token 已失效(401)· 请在凭据管理中重新登录' },
  { time: '16:54:47', level: 'INFO', msg: '应用启动 · Sift Pro v0.1.0 · 本地优先模式' }
])

const filter = ref<'all' | 'warn' | 'error'>('all')
const filtered = computed(() => {
  if (filter.value === 'warn') return logs.value.filter((l) => l.level === 'WARN')
  if (filter.value === 'error') return logs.value.filter((l) => l.level === 'ERROR')
  return logs.value
})

const exportFlash = ref(false)
let exportTimer: ReturnType<typeof setTimeout> | undefined
function exportLogs() {
  exportFlash.value = true
  if (exportTimer) clearTimeout(exportTimer)
  exportTimer = setTimeout(() => (exportFlash.value = false), 1200)
}
function clearLogs() {
  logs.value = []
}
onBeforeUnmount(() => {
  if (exportTimer) clearTimeout(exportTimer)
})
</script>

<template>
  <section class="view logs">
    <header class="head">
      <div class="head-row">
        <div>
          <h1>日志</h1>
          <p class="sub">运行记录 · 颜色区分级别(信息 / 警告 / 错误)</p>
        </div>
        <div class="actions">
          <div class="seg">
            <span :class="{ on: filter === 'all' }" @click="filter = 'all'">全部</span>
            <span :class="{ on: filter === 'warn' }" @click="filter = 'warn'">警告</span>
            <span :class="{ on: filter === 'error' }" @click="filter = 'error'">错误</span>
          </div>
          <button type="button" class="btn-soft" @click="exportLogs">{{ exportFlash ? '已导出 ✓' : '导出' }}</button>
          <button type="button" class="btn-clear" @click="clearLogs">清空</button>
        </div>
      </div>
    </header>

    <div class="body">
      <div class="console mono">
        <div v-for="(l, i) in filtered" :key="i" class="log-row" :class="{ last: i === filtered.length - 1 }">
          <span class="time">{{ l.time }}</span>
          <span class="level" :class="l.level.toLowerCase()">{{ l.level }}</span>
          <span class="msg" :class="l.level.toLowerCase()">{{ l.msg }}</span>
        </div>
        <div v-if="!filtered.length" class="log-empty">暂无日志</div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.logs {
  display: flex;
  flex-direction: column;
  height: 100%;
  line-height: normal;
}
.head {
  flex: none;
  padding: 22px 28px 16px;
}
.head-row {
  display: flex;
  align-items: center;
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
.actions {
  display: flex;
  gap: 8px;
}
.seg {
  display: flex;
  padding: 3px;
  background: var(--bg);
  border: 1px solid #2a2a34;
  border-radius: 8px;
  font-size: 11.5px;
}
.seg span {
  display: flex;
  align-items: center;
  padding: 4px 11px;
  color: var(--text-secondary);
  border-radius: 6px;
  cursor: pointer;
}
.seg span.on {
  color: #fff;
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
}
.seg span:not(.on):hover {
  color: #cdccd8;
}
.btn-soft {
  height: 34px;
  padding: 0 13px;
  border-radius: 8px;
  background: var(--bg-elevated);
  border: 1px solid #2e2e38;
  color: #cdccd8;
  font-size: 12px;
  cursor: pointer;
}
.btn-soft:hover {
  border-color: #3a3a46;
}
.btn-clear {
  height: 34px;
  padding: 0 13px;
  border-radius: 8px;
  background: var(--bg-elevated);
  border: 1px solid #2e2e38;
  color: #9a6a72;
  font-size: 12px;
  cursor: pointer;
}
.btn-clear:hover {
  border-color: #5a2e30;
  color: var(--danger);
}

/* 日志控制台 */
.body {
  flex: 1;
  overflow-y: auto;
  padding: 14px 28px 24px;
}
.console {
  background: #0b0b11;
  border: 1px solid #24242e;
  border-radius: 11px;
  font-size: 12px;
  line-height: 1.5;
  overflow: hidden;
}
.log-row {
  display: flex;
  gap: 12px;
  padding: 8px 15px;
  border-bottom: 1px solid #14141b;
}
.log-row.last {
  border-bottom: 0;
}
.log-row:hover {
  background: #101018;
}
.time {
  flex: none;
  color: #56565f;
}
.level {
  flex: none;
  width: 48px;
}
.level.info {
  color: #5dd9b8;
}
.level.warn {
  color: var(--warning);
}
.level.error {
  color: #f1837d;
}
.msg.info {
  color: #b6b6c2;
}
.msg.warn {
  color: #d8b27a;
}
.msg.error {
  color: #e69b96;
}
.log-empty {
  padding: 28px 15px;
  text-align: center;
  color: #56565f;
  font-size: 12px;
}
</style>
