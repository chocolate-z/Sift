/** SQLite datetime('now') 为 UTC、空格分隔且无时区标记;补 T/Z 以 UTC 解析后转相对时间。 */
export function relTime(s: string): string {
  const t = Date.parse(s.replace(' ', 'T') + 'Z')
  if (Number.isNaN(t)) return s
  const min = Math.floor((Date.now() - t) / 60000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min} 分钟前`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} 小时前`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d} 天前`
  const dt = new Date(t)
  return `${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}
