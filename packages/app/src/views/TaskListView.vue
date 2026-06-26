<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const alt = ref(false)

interface Task {
  name: string
  type: 'pick' | 'api' | 'web'
  url: string
  fields: string
  lastRun: string
  result: string
  resultFail?: boolean
  status: 'ready' | 'running' | 'failed'
  action: 'run' | 'pause' | 'debug'
}
const tasks: Task[] = [
  {
    name: '书城商品列表',
    type: 'pick',
    url: 'book.example.com/list?cat=novel',
    fields: '3',
    lastRun: '2 小时前',
    result: '5 条',
    status: 'ready',
    action: 'run'
  },
  {
    name: '七猫 · 诡秘之主',
    type: 'api',
    url: 'www.qimao.com',
    fields: '5',
    lastRun: '12 分钟前',
    result: '1083 章',
    status: 'running',
    action: 'pause'
  },
  {
    name: '旧钢笔 · 全本抓取',
    type: 'web',
    url: 'www.jiugangbi.com',
    fields: '4',
    lastRun: '1 小时前',
    result: '正文为空',
    resultFail: true,
    status: 'failed',
    action: 'debug'
  },
  {
    name: '当当图书榜',
    type: 'pick',
    url: 'book.dangdang.com/bestseller',
    fields: '4',
    lastRun: '昨天',
    result: '50 条',
    status: 'ready',
    action: 'run'
  }
]
const statusLabel = { ready: '就绪', running: '运行中', failed: '失败' }
const actionLabel = { run: '运行', pause: '暂停', debug: '调试' }
const typeMeta = {
  pick: { label: '点选', glyph: '' },
  api: { label: 'API 源', glyph: '{}' },
  web: { label: '网页源', glyph: '</>' }
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
          <input class="mono" placeholder="搜索任务名 / 站点…" />
        </div>
        <div class="filter">
          <span class="on">全部</span>
          <span>点选</span>
          <span>规则</span>
        </div>
        <div class="sort">
          最近运行
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
        <div class="tb-right">
          <div class="seg">
            <span :class="{ on: !alt }" @click="alt = false">有数据</span>
            <span :class="{ on: alt }" @click="alt = true">空态</span>
          </div>
          <button type="button" class="btn-new">+ 新建任务</button>
        </div>
      </div>
    </header>

    <div class="body">
      <div v-if="!alt" class="list">
        <div v-for="t in tasks" :key="t.name" class="task-row" @click="router.push('/data')">
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
            <button v-if="t.action === 'run'" type="button" class="act-run">{{ actionLabel[t.action] }}</button>
            <button v-else-if="t.action === 'pause'" type="button" class="act-soft">{{ actionLabel[t.action] }}</button>
            <button v-else type="button" class="act-debug" @click="router.push('/debug')">
              {{ actionLabel[t.action] }}
            </button>
            <span class="act-edit">编辑</span>
            <span class="act-more">⋯</span>
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
        <div class="empty-title">还没有任务</div>
        <div class="empty-desc">从点选采集像圈图一样选取字段,或粘贴第三方规则导入 —— 都会出现在这里。</div>
        <div class="empty-actions">
          <button type="button" class="btn-new tall" @click="router.push('/pick')">去点选采集</button>
          <button type="button" class="btn-ghost" @click="router.push('/import')">导入规则</button>
        </div>
      </div>
    </div>
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
.tb-right {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 8px;
}
.seg {
  display: flex;
  height: 34px;
  padding: 2px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 8px;
}
.seg span {
  display: flex;
  align-items: center;
  padding: 0 11px;
  font-size: 11px;
  color: var(--text-secondary);
  border-radius: 6px;
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
