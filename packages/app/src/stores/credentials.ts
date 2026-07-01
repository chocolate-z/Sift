import { defineStore } from 'pinia'
import { ref } from 'vue'
import { deleteCredential, listCredentials, saveCredential, updateCredential } from '@/services/credentials'
import { storageAvailable } from '@/services/storage'
import { relTime } from '@/utils/time'

export type CredType = 'Cookie' | '代理' | 'Token'
export type CredStatus = 'valid' | 'expiring' | 'invalid'

export interface Cred {
  id: number
  /** 已存库 id(桌面端持久化后回填;更新/删除据此)。 */
  dbId?: number
  /** 落库在途的 Promise(dbId 未回填就更新/删除时链到它,避免更新丢失 / 孤儿密文)。 */
  _pending?: Promise<number>
  name: string
  domain: string
  type: CredType
  status: CredStatus
  lastUse: string
}

export const useCredentialsStore = defineStore('credentials', () => {
  let uid = 0
  const creds = ref<Cred[]>([])
  let restored = false

  // 新增:元信息落库 + 密文写钥匙串;记住在途 Promise 供未回填就更新/删除时链上去。
  function addCred(c: Omit<Cred, 'id' | 'dbId' | '_pending'>, secret: string) {
    const local: Cred = { id: ++uid, ...c }
    creds.value.unshift(local)
    if (storageAvailable) {
      local._pending = saveCredential(
        { name: c.name, domain: c.domain, credType: c.type, status: c.status },
        secret
      ).then((dbId) => {
        local.dbId = dbId
        return dbId
      })
      local._pending.catch(() => {})
    }
  }

  // 编辑:更新元信息;secret 非空才更新密文(留空 = 保持原密文)。dbId 未回填则链到落库 Promise。
  function updateCred(id: number, patch: Partial<Omit<Cred, 'id' | 'dbId' | '_pending'>>, secret: string) {
    const c = creds.value.find((x) => x.id === id)
    if (!c) return
    Object.assign(c, patch)
    if (!storageAvailable) return
    const meta = { name: c.name, domain: c.domain, credType: c.type, status: c.status }
    if (c.dbId != null) updateCredential(c.dbId, meta, secret).catch(() => {})
    else c._pending?.then((dbId) => updateCredential(dbId, meta, secret)).catch(() => {})
  }

  function removeCred(id: number) {
    const i = creds.value.findIndex((x) => x.id === id)
    if (i < 0) return
    const [c] = creds.value.splice(i, 1)
    if (!c || !storageAvailable) return
    // dbId 已回填直接删库;未回填则链到落库 Promise 上删,避免孤儿密文/库行(重启复活)。
    if (c.dbId != null) deleteCredential(c.dbId).catch(() => {})
    else c._pending?.then((dbId) => deleteCredential(dbId)).catch(() => {})
  }

  /** 从本地库恢复凭据元信息(本会话内存记录在前,库历史接后)。 */
  async function restore() {
    if (!storageAvailable || restored) return
    restored = true
    try {
      const rows = await listCredentials()
      const seen = new Set(creds.value.map((c) => c.dbId).filter((x) => x != null))
      const historical = rows
        .filter((r) => !seen.has(r.id))
        .map((r) => ({
          id: ++uid,
          dbId: r.id,
          name: r.name,
          domain: r.domain,
          type: r.credType as CredType,
          status: r.status as CredStatus,
          lastUse: relTime(r.createdAt)
        }))
      creds.value = [...creds.value, ...historical]
    } catch {
      restored = false
    }
  }

  return { creds, addCred, updateCred, removeCred, restore }
})
