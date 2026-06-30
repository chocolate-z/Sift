// 采集引擎前端接缝:经 Tauri invoke 调用 Rust 的 sift-engine。浏览器预览无 Tauri
// 运行时,调用会抛出明确错误(界面应以 isTauri 守卫,或回退种子数据)。

import type { Rule } from '@sift/core-ir'

/** 一步执行轨迹(调试台逐步可视)。 */
export interface StepTrace {
  stepId: string
  label: string
  requestUrl: string
  httpStatus: number
  encodingUsed: string
  elapsedMs: number
  recordCount: number
  execCount: number
  warnings: string[]
}

/** run_rule 返回:友好列记录 + 每步原始记录 + 告警 + 每步轨迹(与 Rust RunOutput camelCase 对齐)。 */
export interface EngineRunOutput {
  records: Array<Record<string, string | null>>
  stepRecords: Record<string, Array<Record<string, string | null>>>
  warnings: string[]
  traces: StepTrace[]
}

export const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

async function invokeCmd<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri) {
    throw new Error('采集引擎仅在桌面端可用(浏览器预览无 Tauri 运行时)')
  }
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<T>(cmd, args)
}

/** 执行整条规则。inputs 为用户种子变量(keyword 等),credentials 为 credentialRef→Cookie。 */
export function runRule(
  rule: Rule,
  inputs?: Record<string, string>,
  credentials?: Record<string, string>
): Promise<EngineRunOutput> {
  return invokeCmd<EngineRunOutput>('engine_run_rule', { rule, inputs, credentials })
}

/** 引擎版本(冒烟用,确认接缝可达)。 */
export function engineVersion(): Promise<string> {
  return invokeCmd<string>('engine_version')
}
