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

/** 批量下载文件链接到下载目录下的 Sift/<subdir>/,逐条返回结果。 */
export async function downloadFiles(urls: string[], subdir: string): Promise<DownloadBatch> {
  if (!isTauri) throw new Error('文件下载仅桌面端可用')
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<DownloadBatch>('download_files', { urls, subdir })
}
