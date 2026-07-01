// 本地持久化前端接缝:经 Tauri invoke 调用 sift-storage(SQLite)。数据集的 columns/rows
// 在此序列化为 JSON 字符串存取。浏览器预览无 Tauri,调用抛错(界面以 isTauri 守卫)。

import type { DatasetColumn, DatasetRow } from '@/stores/dataset'

export interface SavedDatasetMeta {
  id: number
  name: string
  source: string
  rowCount: number
  createdAt: string
}

export const storageAvailable = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

async function invokeCmd<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!storageAvailable) throw new Error('本地存储仅桌面端可用')
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<T>(cmd, args)
}

/** 存一个数据集,返回新 id。 */
export function saveDataset(
  name: string,
  source: string,
  columns: DatasetColumn[],
  rows: DatasetRow[]
): Promise<number> {
  return invokeCmd<number>('db_save_dataset', {
    name,
    source,
    columns: JSON.stringify(columns),
    rows: JSON.stringify(rows),
    count: rows.length
  })
}

export function listDatasets(): Promise<SavedDatasetMeta[]> {
  return invokeCmd<SavedDatasetMeta[]>('db_list_datasets')
}

/** 读回数据集主体(已 JSON.parse);不存在返回 null。 */
export async function loadDataset(id: number): Promise<{ columns: DatasetColumn[]; rows: DatasetRow[] } | null> {
  const blob = await invokeCmd<{ columns: string; rows: string } | null>('db_load_dataset', { id })
  if (!blob) return null
  return { columns: JSON.parse(blob.columns), rows: JSON.parse(blob.rows) }
}

export function deleteDataset(id: number): Promise<boolean> {
  return invokeCmd<boolean>('db_delete_dataset', { id })
}

/** 已完成记录(导出/下载产物;跨重启留存)。 */
export interface SavedCompleted {
  id: number
  name: string
  fileType: string
  icon: string
  path: string
  size: string
  count: string
  source: string
  createdAt: string
}
export interface CompletedInput {
  name: string
  fileType: string
  icon: string
  path: string
  size: string
  count: string
  source: string
}

export function saveCompleted(rec: CompletedInput): Promise<number> {
  return invokeCmd<number>('db_save_completed', { rec })
}
export function listCompleted(): Promise<SavedCompleted[]> {
  return invokeCmd<SavedCompleted[]>('db_list_completed')
}
export function deleteCompleted(id: number): Promise<boolean> {
  return invokeCmd<boolean>('db_delete_completed', { id })
}
