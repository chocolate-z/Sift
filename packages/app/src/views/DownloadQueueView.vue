<script setup lang="ts">
import { computed } from 'vue'
import { useDownloadsStore, type DlStatus } from '@/stores/downloads'

const store = useDownloadsStore()

const downloadingCount = computed(() => store.items.filter((i) => i.status === 'downloading').length)
// 并发显示封顶到上限 2(引擎只会同时跑 2 个,多出的概念上排队)
const activeSlots = computed(() => Math.min(downloadingCount.value, 2))
// 总进度:有进度项的平均(空队列为 0)。
const totalProgress = computed(() => {
  const withP = store.items.filter((i) => i.progress != null)
  if (!withP.length) return 0
  return Math.round(withP.reduce((s, i) => s + (i.progress ?? 0), 0) / withP.length)
})

function nameColor(s: DlStatus): 'white' | 'dim' | 'gray' {
  if (s === 'downloading') return 'white'
  if (s === 'waiting') return 'gray'
  return 'dim'
}
</script>

<template>
  <section class="view queue">
    <header class="head">
      <h1>下载队列</h1>
      <p class="sub">支持并发、限速与断点续传 · 暂停后可续传</p>
      <div class="stats">
        <span class="stat">
          并发
          <span class="mono accent">{{ activeSlots }} / 2</span>
        </span>
        <span class="stat">
          队列
          <span class="mono v">{{ store.items.length }} 项</span>
        </span>
        <span class="stat">
          总进度
          <span class="mono v">{{ totalProgress }}%</span>
        </span>
        <span class="stat">
          速度
          <span class="mono ok">{{ downloadingCount ? '680 KB/s' : '0 KB/s' }}</span>
        </span>
        <div class="stat-right">
          <button type="button" class="btn-soft" @click="store.pauseAll()">全部暂停</button>
          <button type="button" class="btn-soft" @click="store.resumeAll()">全部继续</button>
        </div>
      </div>
    </header>

    <div class="body">
      <!-- 有任务 -->
      <div v-if="store.items.length" class="list">
        <div
          v-for="it in store.items"
          :key="it.id"
          class="dl-item"
          :class="{ prog: it.progress != null, failborder: it.status === 'failed' }">
          <div class="dl-head">
            <span class="dl-name mono" :class="nameColor(it.status)">{{ it.name }}</span>
            <span class="file-chip">{{ it.fileType }}</span>

            <!-- 状态指示 -->
            <span v-if="it.status === 'downloading'" class="dl-stat downloading">
              <span class="dot pulse" />
              下载中
            </span>
            <span v-else-if="it.status === 'paused'" class="dl-stat paused">
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="#E0A85A" stroke-width="1.6">
                <rect x="4" y="3" width="3" height="10" rx="1" />
                <rect x="9" y="3" width="3" height="10" rx="1" />
              </svg>
              已暂停
            </span>
            <span v-else-if="it.status === 'waiting'" class="dl-stat waiting">
              <span class="dot" />
              等待
            </span>
            <span v-else class="dl-stat failed">
              <span class="dot" />
              {{ it.failReason }}
            </span>

            <!-- 动作 -->
            <button v-if="it.status === 'paused'" type="button" class="mini-btn primary" @click="store.resume(it.id)">
              续传
            </button>
            <button v-if="it.status === 'failed'" type="button" class="mini-btn" @click="store.retry(it.id)">
              <svg
                width="11"
                height="11"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                stroke-width="1.6"
                stroke-linecap="round"
                stroke-linejoin="round">
                <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2.5V5H11" />
              </svg>
              重试
            </button>
            <span v-if="it.status === 'downloading'" class="ico-btn" @click="store.pause(it.id)">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
                <rect x="4" y="3" width="3" height="10" rx="1" />
                <rect x="9" y="3" width="3" height="10" rx="1" />
              </svg>
            </span>
            <span class="ico-btn del" :class="{ dim: it.progress == null }" @click="store.remove(it.id)">
              <svg
                width="14"
                height="14"
                viewBox="0 0 16 16"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round">
                <path d="M4 4l8 8M12 4l-8 8" />
              </svg>
            </span>
          </div>

          <div v-if="it.progress != null" class="dl-prog">
            <div class="bar">
              <div
                class="bar-fill"
                :class="it.status === 'paused' ? 'gray' : 'purple'"
                :style="{ width: it.progress + '%' }" />
            </div>
            <span class="pct mono" :class="it.status === 'paused' ? 'gray' : 'accent'">{{ it.progress }}%</span>
            <span class="detail mono">{{ it.detail }}</span>
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
            <path d="M8 3v7M5 7.5l3 2.7 3-2.7M3.5 13h9" />
          </svg>
        </div>
        <div class="empty-title">暂无下载任务</div>
        <div class="empty-desc">运行采集任务并选择下载文本 / 图片 / 视频后,条目会出现在这里。</div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.queue {
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

/* 统计栏 */
.stats {
  display: flex;
  align-items: center;
  gap: 18px;
  margin-top: 14px;
}
.stat {
  font-size: 12px;
  color: var(--text-secondary);
}
.stat .accent {
  color: var(--accent-text);
}
.stat .v {
  color: #cdccd8;
}
.stat .ok {
  color: #5dd9b8;
}
.stat-right {
  margin-left: auto;
  display: flex;
  align-items: center;
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
.dl-item {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 11px;
  padding: 14px 16px;
}
.dl-item.prog {
  padding: 13px 16px;
}
.dl-item.failborder {
  border-color: rgba(224, 68, 62, 0.28);
}
.dl-head {
  display: flex;
  align-items: center;
  gap: 11px;
}
.dl-item.prog .dl-head {
  margin-bottom: 10px;
}
.dl-name {
  flex: 1;
  min-width: 0;
  font-size: 12.5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dl-name.white {
  color: var(--text);
}
.dl-name.dim {
  color: #cdccd8;
}
.dl-name.gray {
  color: #9a9aa6;
}
.file-chip {
  flex: none;
  font-size: 10px;
  color: #9a9aa6;
  background: var(--bg);
  border: 1px solid #2a2a34;
  border-radius: 5px;
  padding: 1px 7px;
}
.dl-stat {
  flex: none;
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
}
.dl-stat.downloading {
  color: #6fa8f5;
}
.dl-stat.paused {
  color: #d8b27a;
}
.dl-stat.waiting {
  color: var(--text-secondary);
}
.dl-stat.failed {
  color: #f1837d;
}
.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #56565f;
}
.dl-stat.downloading .dot {
  background: #5b8def;
}
.dl-stat.failed .dot {
  background: var(--danger);
}
.dot.pulse {
  animation: siftPulse 1.4s ease-in-out infinite;
}
.mini-btn {
  flex: none;
  display: flex;
  align-items: center;
  gap: 5px;
  height: 26px;
  padding: 0 11px;
  border-radius: 6px;
  font-size: 11px;
  cursor: pointer;
}
.mini-btn.primary {
  border: none;
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
  color: #fff;
  font-weight: 600;
}
.mini-btn:not(.primary) {
  background: var(--bg-elevated);
  border: 1px solid #2e2e38;
  color: #cdccd8;
}
.mini-btn:not(.primary):hover {
  border-color: #3a3a46;
}
.ico-btn {
  flex: none;
  display: flex;
  padding: 3px;
  color: #7a7a87;
  cursor: pointer;
}
.ico-btn.dim {
  color: var(--text-dim);
}
.ico-btn:hover {
  color: #cdccd8;
}
.ico-btn.del:hover {
  color: var(--danger);
}

/* 进度行 */
.dl-prog {
  display: flex;
  align-items: center;
  gap: 12px;
}
.bar {
  flex: 1;
  height: 6px;
  background: var(--bg);
  border-radius: 3px;
  overflow: hidden;
}
.bar-fill {
  height: 6px;
  border-radius: 3px;
}
.bar-fill.purple {
  background: linear-gradient(90deg, var(--accent), var(--accent-2));
}
.bar-fill.gray {
  background: #5a5160;
}
.pct {
  flex: none;
  font-size: 11px;
}
.pct.accent {
  color: var(--accent-text);
}
.pct.gray {
  color: #9a9aa6;
}
.detail {
  flex: none;
  font-size: 10.5px;
  color: var(--text-secondary);
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
