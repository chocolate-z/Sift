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

export const useCredentialsStore = defineStore('credentials', () => {
  let uid = 0
  const creds = ref<Cred[]>([])

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
