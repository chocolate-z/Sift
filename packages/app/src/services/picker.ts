// 点选采集前端接缝:打开一个 WebView 加载目标网址(真引擎渲染,JS 站也可点),
// 注入脚本点选后经 Tauri 事件 `picker:selected` 回传 CSS 选择器。仅桌面端可用。

import { isTauri } from './engine'

/** 打开(或导航到)点选 WebView 加载目标网址。 */
export async function openPicker(url: string): Promise<void> {
  if (!isTauri) throw new Error('点选采集仅桌面端可用(浏览器预览无 Tauri)')
  const { invoke } = await import('@tauri-apps/api/core')
  await invoke('open_picker', { url })
}

/** 监听点选窗口回传的选择器;返回取消监听函数。 */
export async function onPickerSelected(cb: (selector: string) => void): Promise<() => void> {
  if (!isTauri) return () => {}
  const { listen } = await import('@tauri-apps/api/event')
  return listen<string>('picker:selected', (e) => cb(e.payload))
}

/** 请求点选窗口高亮匹配该选择器的所有元素(空串=清除高亮)。 */
export async function highlightInPicker(selector: string): Promise<void> {
  if (!isTauri) return
  const { emit } = await import('@tauri-apps/api/event')
  await emit('picker:highlight', selector)
}

/** 监听点选窗口回传的匹配数(-1=选择器无效,-2=空);返回取消监听函数。 */
export async function onPickerCount(cb: (n: number) => void): Promise<() => void> {
  if (!isTauri) return () => {}
  const { listen } = await import('@tauri-apps/api/event')
  return listen<number>('picker:count', (e) => cb(e.payload))
}
