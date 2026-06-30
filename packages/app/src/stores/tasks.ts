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

export const useTasksStore = defineStore('tasks', () => {
  let uid = 0
  const tasks = ref<Task[]>([])

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
