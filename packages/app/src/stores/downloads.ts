import { defineStore } from 'pinia'
import { ref } from 'vue'

export type DlStatus = 'downloading' | 'paused' | 'waiting' | 'failed'

export interface DlItem {
  id: number
  name: string
  fileType: '文本' | '图片'
  status: DlStatus
  progress: number | null
  detail: string
  failReason?: string
}

export const useDownloadsStore = defineStore('downloads', () => {
  const items = ref<DlItem[]>([])
  const find = (id: number) => items.value.find((x) => x.id === id)

  function pause(id: number) {
    const it = find(id)
    if (it && it.status === 'downloading') {
      it.status = 'paused'
      it.detail = `断点已保存 · 已下 ${it.progress ?? 0}%`
    }
  }
  function resume(id: number) {
    const it = find(id)
    if (it && it.status === 'paused') {
      it.status = 'downloading'
      it.detail = `续传中 · ${it.progress ?? 0}%`
    }
  }
  function retry(id: number) {
    const it = find(id)
    if (it && it.status === 'failed') {
      it.status = 'downloading'
      it.progress = 0
      it.detail = '重新开始…'
      it.failReason = undefined
    }
  }
  function remove(id: number) {
    const i = items.value.findIndex((x) => x.id === id)
    if (i >= 0) items.value.splice(i, 1)
  }
  function pauseAll() {
    items.value.forEach((it) => {
      if (it.status === 'downloading') {
        it.status = 'paused'
        it.detail = `断点已保存 · 已下 ${it.progress ?? 0}%`
      }
    })
  }
  function resumeAll() {
    items.value.forEach((it) => {
      if (it.status === 'paused') {
        it.status = 'downloading'
        it.detail = `续传中 · ${it.progress ?? 0}%`
      }
    })
  }

  return { items, pause, resume, retry, remove, pauseAll, resumeAll }
})
