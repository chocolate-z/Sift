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

const SEED: Omit<DlItem, 'id'>[] = [
  {
    name: '诡秘之主/第0048章·深红.txt',
    fileType: '文本',
    status: 'downloading',
    progress: 72,
    detail: '1.2 / 1.7 MB · 420 KB/s · 3s'
  },
  {
    name: '封面_qimao_12345.jpg',
    fileType: '图片',
    status: 'downloading',
    progress: 35,
    detail: '86 / 240 KB · 260 KB/s · 1s'
  },
  {
    name: '诡秘之主/第0040章·星之子.txt',
    fileType: '文本',
    status: 'paused',
    progress: 48,
    detail: '已下 820 KB · 断点已保存'
  },
  { name: '诡秘之主/第0051章·黑夜.txt', fileType: '文本', status: 'waiting', progress: null, detail: '' },
  { name: '封面_qimao_12346.jpg', fileType: '图片', status: 'waiting', progress: null, detail: '' },
  {
    name: '诡秘之主/第0042章·愚者.txt',
    fileType: '文本',
    status: 'failed',
    progress: null,
    detail: '',
    failReason: '失败 · 超时'
  }
]

export const useDownloadsStore = defineStore('downloads', () => {
  let uid = 0
  const items = ref<DlItem[]>(SEED.map((s) => ({ id: ++uid, ...s })))
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
