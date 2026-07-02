// ============================================================================
// Sift · line-A 翻译器 — 点选/输入结果 → core-ir Rule(§5.2① 三入口映射之一)。
// 单步 Rule:打开一个网址 → 按「列表项选择器 + 字段选择器」抽取列表数据;无列表项
// 选择器时退化为单页抽取(shape='page')。引擎对手写/点选/书源产物一视同仁。
// ============================================================================

import type {
  CollectStep,
  Extraction,
  FieldRule,
  OutputColumn,
  ParseSpec,
  PipelineOp,
  RequestConfig,
  Rule,
  RuleMeta,
  SelectorExpr
} from '@sift/core-ir'

/** 点选/输入的单个字段。selector 相对列表项(有 listSelector 时)或整页。 */
export interface VisualField {
  name: string
  selector: string
  /** 取值:留空 / 'text' 取文本;'href'/'src'/'data-src' 等取属性。 */
  attr?: string
  /** 友好列类型;url/image 会自动 resolveUrl 绝对化相对地址。 */
  type?: 'string' | 'number' | 'image' | 'url'
}

export interface VisualPickSpec {
  url: string
  /** 重复列表项容器选择器;缺省 → 单页抽取。 */
  listSelector?: string
  fields: VisualField[]
}

function toSelector(f: VisualField): SelectorExpr {
  const attr = f.attr && f.attr !== 'text' ? f.attr : null
  const extract: Extraction = attr ? { mode: 'attr', name: attr } : { mode: 'text' }
  const sel: SelectorExpr = { engine: 'css', expr: f.selector, fallbacks: [], extract }
  // url / image 字段(通常取相对 href/src)→ 绝对化为可访问链接。
  if (f.type === 'url' || f.type === 'image') {
    sel.pipeline = [{ op: 'resolveUrl' } as PipelineOp]
  }
  return sel
}

function columnType(t: VisualField['type']): NonNullable<OutputColumn['type']> {
  if (t === 'image') return 'image'
  if (t === 'url') return 'url'
  if (t === 'number') return 'number'
  return 'string'
}

function hostOf(url: string): string {
  try {
    return new URL(url).host || url
  } catch {
    return url || '点选'
  }
}

/**
 * 点选规格 → 单步 Rule。有 listSelector → shape='list'(容器 + 相对字段);否则 shape='page'。
 * 空名/空选择器的字段跳过。url/image 字段经 resolveUrl 绝对化。
 */
export function compileVisualRule(spec: VisualPickSpec): Rule {
  const usable = spec.fields.filter((f) => f.name.trim() && f.selector.trim())

  const fields: Record<string, FieldRule> = {}
  for (const f of usable) {
    fields[f.name] = { selector: toSelector(f), label: f.name }
  }

  const listSelector = spec.listSelector?.trim()
  const parse: ParseSpec = listSelector
    ? {
        shape: 'list',
        list: { container: { engine: 'css', expr: listSelector, fallbacks: [] } },
        fields
      }
    : { shape: 'page', fields }

  const request: RequestConfig = { url: { kind: 'static', url: spec.url }, method: 'GET' }

  const step: CollectStep = {
    id: 'pick',
    name: '点选采集 · Pick',
    request,
    parse,
    fanout: { kind: 'once' }
  }

  const columns: OutputColumn[] = usable.map((f) => ({
    name: f.name,
    fromField: f.name,
    fromStep: 'pick',
    type: columnType(f.type)
  }))

  const meta: RuleMeta = {
    id: spec.url || 'visual-pick',
    name: `点选 · ${hostOf(spec.url)}`,
    origin: 'visual-picker',
    sourceType: 'web'
  }
  if (spec.url) meta.sourceUrl = spec.url

  return {
    irVersion: 1,
    meta,
    entry: { kind: 'url', url: spec.url, example: spec.url },
    vars: [],
    steps: [step],
    output: { format: 'records', columns, formats: ['csv', 'json'] }
  }
}
