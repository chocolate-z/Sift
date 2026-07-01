import { defineStore } from 'pinia'
import { ref } from 'vue'
import { deleteCompleted, listCompleted, saveCompleted, storageAvailable } from '@/services/storage'
import { relTime } from '@/utils/time'

export type DoneIcon = 'txt' | 'img' | 'data'

export interface DoneRecord {
  id: number
  /** 已存库 id(桌面端持久化后回填;删除据此删库)。 */
  dbId?: number
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

  function add(rec: Omit<DoneRecord, 'id' | 'dbId'>) {
    const local: DoneRecord = { id: ++uid, ...rec }
    records.value.unshift(local)
    // 桌面端落库(跨重启留存),完成后回填 dbId 供删除。
    if (storageAvailable) {
      saveCompleted({
        name: rec.name,
        fileType: rec.fileType,
        icon: rec.icon,
        path: rec.path,
        size: rec.size,
        count: rec.count,
        source: rec.source
      })
        .then((dbId) => {
          local.dbId = dbId
        })
        .catch(() => {})
    }
  }

  /** 从本地库恢复已完成记录(本会话已有则不覆盖)。 */
  async function restore() {
    if (!storageAvailable || records.value.length) return
    try {
      const rows = await listCompleted()
      records.value = rows.map((r) => ({
        id: ++uid,
        dbId: r.id,
        name: r.name,
        fileType: r.fileType as DoneRecord['fileType'],
        icon: r.icon as DoneIcon,
        path: r.path,
        size: r.size,
        count: r.count,
        source: r.source,
        time: relTime(r.createdAt)
      }))
    } catch {
      // 忽略:无库 / 读取失败时留空。
    }
  }

  function remove(id: number) {
    const i = records.value.findIndex((x) => x.id === id)
    if (i < 0) return
    const rec = records.value[i]!
    records.value.splice(i, 1)
    if (rec.dbId != null && storageAvailable) deleteCompleted(rec.dbId).catch(() => {})
  }

  function clear() {
    const ids = records.value.map((r) => r.dbId).filter((x): x is number => x != null)
    records.value = []
    if (storageAvailable) ids.forEach((id) => deleteCompleted(id).catch(() => {}))
  }

  return { records, add, restore, remove, clear }
})
