import { defineStore } from 'pinia'
import { ref } from 'vue'
import { deleteCompleted, listCompleted, saveCompleted, storageAvailable } from '@/services/storage'
import { relTime } from '@/utils/time'

export type DoneIcon = 'txt' | 'img' | 'data'

export interface DoneRecord {
  id: number
  /** 已存库 id(桌面端持久化后回填;删除据此删库)。 */
  dbId?: number
  /** 落库在途的 Promise(dbId 未回填就删除时,链到它上面确保删得掉库)。 */
  _pending?: Promise<number>
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
  // 是否已从库恢复过(显式标志,不用 records.length 推断——否则本会话先 add 过就永不恢复历史)。
  let restored = false

  function add(rec: Omit<DoneRecord, 'id' | 'dbId' | '_pending'>) {
    const local: DoneRecord = { id: ++uid, ...rec }
    records.value.unshift(local)
    // 桌面端落库(跨重启留存),完成后回填 dbId 供删除;记住在途 Promise 供未回填就删时链上去。
    if (storageAvailable) {
      local._pending = saveCompleted({
        name: rec.name,
        fileType: rec.fileType,
        icon: rec.icon,
        path: rec.path,
        size: rec.size,
        count: rec.count,
        source: rec.source
      }).then((dbId) => {
        local.dbId = dbId
        return dbId
      })
      local._pending.catch(() => {})
    }
  }

  // 删库:dbId 已回填直接删;未回填则链到落库 Promise 上删,避免孤儿库行(重启复活)。
  function dropFromDb(rec: DoneRecord) {
    if (!storageAvailable) return
    if (rec.dbId != null) deleteCompleted(rec.dbId).catch(() => {})
    else rec._pending?.then((dbId) => deleteCompleted(dbId)).catch(() => {})
  }

  /** 从本地库恢复已完成记录:本会话内存记录(近)在前,库中历史接后(不覆盖内存 adds)。 */
  async function restore() {
    if (!storageAvailable || restored) return
    restored = true
    try {
      const rows = await listCompleted()
      const seen = new Set(records.value.map((r) => r.dbId).filter((x) => x != null))
      const historical = rows
        .filter((r) => !seen.has(r.id))
        .map((r) => ({
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
      records.value = [...records.value, ...historical]
    } catch {
      restored = false // 失败可重试
    }
  }

  function remove(id: number) {
    const i = records.value.findIndex((x) => x.id === id)
    if (i < 0) return
    const [rec] = records.value.splice(i, 1)
    if (rec) dropFromDb(rec)
  }

  function clear() {
    const recs = records.value.slice()
    records.value = []
    recs.forEach(dropFromDb)
  }

  return { records, add, restore, remove, clear }
})
