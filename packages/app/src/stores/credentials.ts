import { defineStore } from 'pinia'
import { ref } from 'vue'

export type CredType = 'Cookie' | '代理' | 'Token'
export type CredStatus = 'valid' | 'expiring' | 'invalid'

export interface Cred {
  id: number
  name: string
  domain: string
  type: CredType
  status: CredStatus
  lastUse: string
}

const SEED: Omit<Cred, 'id'>[] = [
  { name: '七猫账号 Cookie', domain: 'www.qimao.com', type: 'Cookie', status: 'valid', lastUse: '2 分钟前' },
  { name: '旧钢笔会话', domain: 'www.jiugangbi.com', type: 'Cookie', status: 'expiring', lastUse: '1 小时前' },
  { name: '本地代理', domain: 'http://127.0.0.1:7890', type: '代理', status: 'valid', lastUse: '使用中' },
  { name: '书城 API Token', domain: 'book.example.com', type: 'Token', status: 'invalid', lastUse: '3 天前' }
]

export const useCredentialsStore = defineStore('credentials', () => {
  let uid = 0
  const creds = ref<Cred[]>(SEED.map((c) => ({ id: ++uid, ...c })))

  function addCred(c: Omit<Cred, 'id'>) {
    creds.value.unshift({ id: ++uid, ...c })
  }
  function updateCred(id: number, patch: Partial<Omit<Cred, 'id'>>) {
    const c = creds.value.find((x) => x.id === id)
    if (c) Object.assign(c, patch)
  }
  function removeCred(id: number) {
    const i = creds.value.findIndex((x) => x.id === id)
    if (i >= 0) creds.value.splice(i, 1)
  }

  return { creds, addCred, updateCred, removeCred }
})
