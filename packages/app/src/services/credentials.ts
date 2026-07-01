// 凭据前端接缝:元信息经 SQLite、**密文经 OS 钥匙串**(Windows 凭据管理器 / macOS Keychain)。
// 密文只在保存/更新时传入,列表只回元信息;明文运行时按 credentialRef 用 getCredential 读。

import type { Rule } from '@sift/core-ir'
import { storageAvailable } from './storage'

/** 凭据元信息(列表用,不含密文)。 */
export interface CredMeta {
  id: number
  name: string
  domain: string
  credType: string
  status: string
  createdAt: string
}
export interface CredInput {
  name: string
  domain: string
  credType: string
  status: string
}

async function invokeCmd<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!storageAvailable) throw new Error('凭据存储仅桌面端可用')
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<T>(cmd, args)
}

/** 存一条凭据(元信息落库 + 密文写钥匙串),返回 id。 */
export function saveCredential(meta: CredInput, secret: string): Promise<number> {
  return invokeCmd<number>('cred_save', { meta, secret })
}
/** 更新一条凭据;secret 非空才更新密文(留空 = 保持原密文)。 */
export function updateCredential(id: number, meta: CredInput, secret: string): Promise<boolean> {
  return invokeCmd<boolean>('cred_update', { id, meta, secret })
}
export function listCredentials(): Promise<CredMeta[]> {
  return invokeCmd<CredMeta[]>('cred_list')
}
/** 读回密文(运行时按 credentialRef 用;UI 列表不调用)。 */
export function getCredential(id: number): Promise<string> {
  return invokeCmd<string>('cred_get', { id })
}
export function deleteCredential(id: number): Promise<boolean> {
  return invokeCmd<boolean>('cred_delete', { id })
}

/** 凭据引用格式:须与 Rust 钥匙串账户 `cred-{id}` 一致,否则引擎按 ref 精确匹配取不到密文。 */
export function credRef(dbId: number): string {
  return `cred-${dbId}`
}

/**
 * 遍历规则收集全部 credentialRef(默认请求 + 各步 request),按 ref 解出明文,
 * 组成引擎所需的 credentialRef→Cookie 映射。无引用时返回空表(不触钥匙串)。
 * 解不出(密文已删 / 钥匙串缺失)则抛出,由调用方以运行失败提示。
 */
export async function resolveRuleCredentials(rule: Rule): Promise<Record<string, string>> {
  const refs = new Set<string>()
  if (rule.defaults?.credentialRef) refs.add(rule.defaults.credentialRef)
  for (const step of rule.steps) {
    if (step.request.credentialRef) refs.add(step.request.credentialRef)
  }
  const map: Record<string, string> = {}
  for (const ref of refs) {
    const m = /^cred-(\d+)$/.exec(ref)
    if (m) map[ref] = await getCredential(Number(m[1]))
  }
  return map
}
