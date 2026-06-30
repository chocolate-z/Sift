// 数据集导出工具(自包含,不依赖 Vue/store,便于单测)。
// 列对象用 { name(显示名), field(记录键) };引擎 RunOutput.records 以列显示名为键,
// 故界面层 field 即列名,这里按 field 取值。

export interface ExportColumn {
  name: string
  field: string
  type?: string
}
export type ExportRow = Record<string, string | null>

function csvCell(value: string): string {
  // 含逗号/引号/换行的字段用双引号包裹,内部引号翻倍(RFC 4180)。
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

export function toCsv(columns: ExportColumn[], rows: ExportRow[]): string {
  const header = columns.map((c) => csvCell(c.name)).join(',')
  const body = rows.map((r) => columns.map((c) => csvCell(r[c.field] ?? '')).join(','))
  return [header, ...body].join('\r\n')
}

export function toJson(columns: ExportColumn[], rows: ExportRow[]): string {
  const data = rows.map((r) => Object.fromEntries(columns.map((c) => [c.name, r[c.field] ?? null])))
  return JSON.stringify(data, null, 2)
}

export function toTxt(columns: ExportColumn[], rows: ExportRow[]): string {
  const flat = (s: string) => s.replace(/[\t\r\n]+/g, ' ')
  const header = columns.map((c) => c.name).join('\t')
  const body = rows.map((r) => columns.map((c) => flat(r[c.field] ?? '')).join('\t'))
  return [header, ...body].join('\n')
}

/**
 * 把正文数据集排版为单本小说 TXT:书名抬头 + 每章「章节标题\n\n正文」。
 * 按列显示名识别字段(书名 / 章节标题|章节 / 正文);缺正文列则退化为仅标题清单。
 */
export function toBookTxt(columns: ExportColumn[], rows: ExportRow[]): string {
  const fieldOf = (name: string) => columns.find((c) => c.name === name)?.field
  const bookF = fieldOf('书名')
  const titleF = fieldOf('章节标题') ?? fieldOf('章节')
  const contentF = fieldOf('正文')
  const bookTitle = (bookF && rows[0]?.[bookF]) || '采集结果'
  const out: string[] = [bookTitle, '']
  for (const r of rows) {
    const title = (titleF && r[titleF]) || ''
    const content = (contentF && r[contentF]) || ''
    if (title) out.push(title, '')
    if (content) out.push(content, '')
    out.push('')
  }
  return out.join('\n')
}

/** 触发浏览器/WebView 下载一段文本(Blob + 隐藏 <a>)。 */
export function downloadText(filename: string, content: string, mime = 'text/plain;charset=utf-8'): void {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
