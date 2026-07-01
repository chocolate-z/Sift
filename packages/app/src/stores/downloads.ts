import { defineStore } from 'pinia'
import { ref } from 'vue'
import { downloadFilesLive, type DlEvent } from '@/services/download'
import { useCompletedStore } from './completed'

export type DlStatus = 'waiting' | 'downloading' | 'done' | 'failed'

export interface DlItem {
  id: number
  name: string
  fileType: '图片' | '文件'
  status: DlStatus
  /** 0-100;null = 大小未知(无 Content-Length)。 */
  progress: number | null
  detail: string
  failReason?: string
}

function fmtSize(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}
function basename(p: string): string {
  return p.split(/[\\/]/).pop() || p
}
function urlName(url: string, i: number): string {
  const raw = (url.split(/[?#]/)[0] ?? '').split('/').pop() ?? ''
  return raw || `文件 ${i + 1}`
}
function guessType(url: string): '图片' | '文件' {
  return /\.(jpe?g|png|gif|webp|bmp|svg)(\?|#|$)/i.test(url) ? '图片' : '文件'
}

export const useDownloadsStore = defineStore('downloads', () => {
  const items = ref<DlItem[]>([])
  const running = ref(false)
  const find = (id: number) => items.value.find((x) => x.id === id)

  // 后端 Channel 事件 → 更新对应条目(id = urls 下标)。
  function onEvent(e: DlEvent) {
    const it = find(e.id)
    if (!it) return
    if (e.kind === 'queued') {
      it.name = e.name
      it.status = 'downloading'
      it.detail = '连接中…'
    } else if (e.kind === 'progress') {
      it.status = 'downloading'
      if (e.total && e.total > 0) {
        it.progress = Math.min(100, Math.round((e.downloaded / e.total) * 100))
        it.detail = `${fmtSize(e.downloaded)} / ${fmtSize(e.total)}`
      } else {
        it.progress = null
        it.detail = `已下 ${fmtSize(e.downloaded)}`
      }
    } else if (e.kind === 'done') {
      it.status = 'done'
      it.progress = 100
      it.name = basename(e.path)
      it.detail = fmtSize(e.size)
    } else if (e.kind === 'failed') {
      it.status = 'failed'
      it.progress = null
      it.failReason = e.error
      it.detail = ''
    }
  }

  /** 启动一批下载:种入队列 → 流式接收进度 → 全部结束后记入「已完成」。 */
  async function startBatch(urls: string[], subdir: string, source: string) {
    // 重入保护:上一批未完成前不启新批,否则旧批在途 Channel 事件会按 id 错更新批行。
    if (running.value || !urls.length) return
    items.value = urls.map((u, i) => ({
      id: i,
      name: urlName(u, i),
      fileType: guessType(u),
      status: 'waiting' as DlStatus,
      progress: null,
      detail: '等待中'
    }))
    running.value = true
    try {
      const batch = await downloadFilesLive(urls, subdir, onEvent)
      const ok = batch.results.filter((r) => r.ok)
      if (ok.length) {
        const bytes = ok.reduce((s, r) => s + r.size, 0)
        useCompletedStore().add({
          name: `${subdir} · 文件`,
          fileType: '图片',
          icon: 'img',
          path: batch.dir,
          size: fmtSize(bytes),
          count: `${ok.length}/${urls.length} 个`,
          time: '刚刚',
          source: `来源 ${source}`
        })
      }
    } finally {
      running.value = false
    }
  }

  function remove(id: number) {
    const i = items.value.findIndex((x) => x.id === id)
    if (i >= 0) items.value.splice(i, 1)
  }
  function clear() {
    items.value = []
  }

  return { items, running, startBatch, remove, clear }
})
