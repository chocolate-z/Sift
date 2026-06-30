// 文件保存前端接缝:经 Tauri invoke 调用本壳 save_text_file 命令,写盘到系统下载目录下的
// Sift 文件夹,返回真实路径。浏览器预览无 Tauri,调用抛错(界面以 isTauri 守卫)。

import { isTauri } from './engine'

/** 写一段文本到下载目录,返回写入的绝对路径。 */
export async function saveTextFile(name: string, content: string): Promise<string> {
  if (!isTauri) throw new Error('文件保存仅桌面端可用')
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<string>('save_text_file', { name, content })
}

/** 单个文件的下载结果。 */
export interface DownloadResult {
  url: string
  ok: boolean
  path: string | null
  size: number
  error: string | null
}

/** 一批下载的产物:落盘子目录 + 逐条结果。 */
export interface DownloadBatch {
  dir: string
  results: DownloadResult[]
}

/** 下载进度事件(后端经 Tauri Channel 实时回传)。 */
export type DlEvent =
  | { kind: 'queued'; id: number; name: string }
  | { kind: 'progress'; id: number; downloaded: number; total: number | null }
  | { kind: 'done'; id: number; path: string; size: number }
  | { kind: 'failed'; id: number; error: string }

/** 批量下载文件链接到 Sift/<subdir>/,经 Channel 实时回传进度;Promise 在全部结束时 resolve。 */
export async function downloadFilesLive(
  urls: string[],
  subdir: string,
  onEvent: (e: DlEvent) => void
): Promise<DownloadBatch> {
  if (!isTauri) throw new Error('文件下载仅桌面端可用')
  const { invoke, Channel } = await import('@tauri-apps/api/core')
  const channel = new Channel<DlEvent>()
  channel.onmessage = onEvent
  return invoke<DownloadBatch>('download_files_live', { urls, subdir, channel })
}
