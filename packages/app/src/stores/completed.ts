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

const SEED: Omit<DoneRecord, 'id'>[] = [
  {
    name: '诡秘之主·全本.txt',
    fileType: '文本',
    icon: 'txt',
    path: '~/Sift/downloads/诡秘之主/全本.txt',
    size: '8.6 MB',
    count: '1083 章',
    time: '今天 14:20',
    source: '来源 七猫·诡秘之主'
  },
  {
    name: '书城封面图集.zip',
    fileType: '图片',
    icon: 'img',
    path: '~/Sift/downloads/covers.zip',
    size: '24.3 MB',
    count: '50 张',
    time: '今天 13:05',
    source: '来源 书城商品列表'
  },
  {
    name: '商品数据.csv',
    fileType: '数据',
    icon: 'data',
    path: '~/Sift/exports/products.csv',
    size: '12 KB',
    count: '5 行',
    time: '昨天 18:40',
    source: '来源 书城商品列表'
  }
]

export const useCompletedStore = defineStore('completed', () => {
  let uid = 0
  const records = ref<DoneRecord[]>(SEED.map((r) => ({ id: ++uid, ...r })))

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
