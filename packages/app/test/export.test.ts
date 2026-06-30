import { describe, expect, it } from 'vitest'
import { toBookTxt, toCsv, toJson, toTxt, type ExportColumn, type ExportRow } from '../src/utils/export'

const cols: ExportColumn[] = [
  { name: '书名', field: '书名' },
  { name: '简介', field: '简介' }
]
const rows: ExportRow[] = [
  { 书名: '剑来', 简介: '大千世界，无奇不有' },
  { 书名: '逗号,引号"测试', 简介: '含\n换行', 多余字段: 'x' },
  { 书名: null, 简介: '' }
]

describe('export utils', () => {
  it('toCsv quotes commas/quotes/newlines and doubles inner quotes', () => {
    const csv = toCsv(cols, rows)
    const lines = csv.split('\r\n')
    expect(lines[0]).toBe('书名,简介')
    expect(lines[1]).toBe('剑来,大千世界，无奇不有')
    // 逗号/引号 → 整格加引号,内部引号翻倍;换行 → 加引号
    expect(lines[2]).toBe('"逗号,引号""测试","含\n换行"')
    // null/空 → 空串
    expect(lines[3]).toBe(',')
  })

  it('toJson maps rows by display name, missing → null', () => {
    const data = JSON.parse(toJson(cols, rows))
    expect(data).toHaveLength(3)
    expect(data[0]).toEqual({ 书名: '剑来', 简介: '大千世界，无奇不有' })
    // 缺失/ null → null;空串保留为空串(有值但为空,非缺失)
    expect(data[2]).toEqual({ 书名: null, 简介: '' })
  })

  it('toTxt is tab-separated with flattened whitespace', () => {
    const txt = toTxt(cols, rows)
    const lines = txt.split('\n')
    expect(lines[0]).toBe('书名\t简介')
    expect(lines[1]).toBe('剑来\t大千世界，无奇不有')
    expect(lines[2]).toBe('逗号,引号"测试\t含 换行')
  })

  it('toBookTxt lays out a novel: title header + per-chapter title/body', () => {
    const bookCols: ExportColumn[] = [
      { name: '书名', field: '书名' },
      { name: '章节标题', field: '章节标题' },
      { name: '正文', field: '正文' }
    ]
    const bookRows: ExportRow[] = [
      { 书名: '诡秘之主', 章节标题: '第一章 绯红', 正文: '克莱恩睁开眼。' },
      { 书名: '诡秘之主', 章节标题: '第二章 黄昏', 正文: '蒸汽与机械的时代。' }
    ]
    const txt = toBookTxt(bookCols, bookRows)
    expect(txt.startsWith('诡秘之主\n')).toBe(true)
    expect(txt).toContain('第一章 绯红\n\n克莱恩睁开眼。')
    expect(txt).toContain('第二章 黄昏\n\n蒸汽与机械的时代。')
  })

  it('toBookTxt falls back to 章 column + 采集结果 title when 书名/章节标题 absent', () => {
    const cols2: ExportColumn[] = [
      { name: '章节', field: '章节' },
      { name: '正文', field: '正文' }
    ]
    const txt = toBookTxt(cols2, [{ 章节: '楔子', 正文: '正文内容' }])
    expect(txt.startsWith('采集结果\n')).toBe(true)
    expect(txt).toContain('楔子\n\n正文内容')
  })
})
