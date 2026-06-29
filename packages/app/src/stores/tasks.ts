import { defineStore } from 'pinia'
import { ref } from 'vue'

export type TaskType = 'pick' | 'api' | 'web'
export type TaskStatus = 'ready' | 'running' | 'failed'

export interface Task {
  id: number
  name: string
  type: TaskType
  url: string
  fields: string
  lastRun: string
  result: string
  resultFail?: boolean
  status: TaskStatus
}

const SEED: Omit<Task, 'id'>[] = [
  {
    name: '书城商品列表',
    type: 'pick',
    url: 'book.example.com/list?cat=novel',
    fields: '3',
    lastRun: '2 小时前',
    result: '5 条',
    status: 'ready'
  },
  {
    name: '七猫 · 诡秘之主',
    type: 'api',
    url: 'www.qimao.com',
    fields: '5',
    lastRun: '12 分钟前',
    result: '1083 章',
    status: 'running'
  },
  {
    name: '旧钢笔 · 全本抓取',
    type: 'web',
    url: 'www.jiugangbi.com',
    fields: '4',
    lastRun: '1 小时前',
    result: '正文为空',
    resultFail: true,
    status: 'failed'
  },
  {
    name: '当当图书榜',
    type: 'pick',
    url: 'book.dangdang.com/bestseller',
    fields: '4',
    lastRun: '昨天',
    result: '50 条',
    status: 'ready'
  }
]

export const useTasksStore = defineStore('tasks', () => {
  let uid = 0
  const tasks = ref<Task[]>(SEED.map((t) => ({ id: ++uid, ...t })))

  function addTask(t: Omit<Task, 'id'>) {
    tasks.value.unshift({ id: ++uid, ...t })
  }
  function updateTask(id: number, patch: Partial<Omit<Task, 'id'>>) {
    const t = tasks.value.find((x) => x.id === id)
    if (t) Object.assign(t, patch)
  }
  function removeTask(id: number) {
    const i = tasks.value.findIndex((x) => x.id === id)
    if (i >= 0) tasks.value.splice(i, 1)
  }
  function duplicateTask(id: number) {
    const i = tasks.value.findIndex((x) => x.id === id)
    const t = tasks.value[i]
    if (!t) return
    tasks.value.splice(i + 1, 0, { ...t, id: ++uid, name: `${t.name} 副本`, status: 'ready', resultFail: false })
  }
  function toggleRun(id: number) {
    const t = tasks.value.find((x) => x.id === id)
    if (!t) return
    t.status = t.status === 'running' ? 'ready' : 'running'
    if (t.status === 'running') t.lastRun = '刚刚'
  }

  return { tasks, addTask, updateTask, removeTask, duplicateTask, toggleRun }
})
