import { defineStore } from 'pinia'
import { ref } from 'vue'

export type DoneIcon = 'txt' | 'img' | 'data'

export interface DoneRecord {
  id: number
  name: string
  fileType: '文本' | '图片' | '数据'
  icon: DoneIcon
  path: string
  size: string
  count: string
  time: string
  source: string
}

export const useCompletedStore = defineStore('completed', () => {
  let uid = 0
  const records = ref<DoneRecord[]>([])

  function add(rec: Omit<DoneRecord, 'id'>) {
    records.value.unshift({ id: ++uid, ...rec })
  }
  function remove(id: number) {
    const i = records.value.findIndex((x) => x.id === id)
    if (i >= 0) records.value.splice(i, 1)
  }
  function clear() {
    records.value = []
  }

  return { records, add, remove, clear }
})
