// ============================================================================
// Sift · line-B 翻译器 — RawBookSource → core-ir Rule(§5.2① 三入口映射之一)。
// 本模块产出**搜索步骤**的可执行 Rule:输关键词 → 搜索结果书单。这是「输入关键词
// 看到真实数据」最直接的形态,搜索字段经 parseSearchResult 完整保留(fallbacks/attr/
// jsonPath)。完整多步链路(书详情 → 目录 → 正文,供下载流)后续补 compileBookSource。
// ============================================================================

import type {
  CollectStep,
  EntryPoint,
  Extraction,
  FieldRule as IrFieldRule,
  OutputColumn,
  ParseSpec,
  PlaceholderDep,
  RequestConfig,
  Rule,
  RuleMeta,
  SelectorExpr,
  VarDecl
} from '@sift/core-ir'

import { extractPlaceholders, parseUrlDirectives } from './decoders'
import { detectSourceType, parseSearchResult } from './parser'
import type { FieldRule as SpFieldRule, RawBookSource } from './types'

/** 搜索结果里用于展示的字段(url 是导航用,不入展示列)。 */
const DISPLAY_FIELDS = ['name', 'author', 'newest', 'remark', 'cover'] as const

const FIELD_LABELS: Record<string, string> = {
  name: '书名',
  author: '作者',
  newest: '最新章节',
  remark: '简介',
  cover: '封面'
}

/** source-parser 的 FieldRule → core-ir SelectorExpr。 */
function toSelector(engine: string, f: SpFieldRule): SelectorExpr {
  const extract: Extraction = f.attr ? { mode: 'attr', name: f.attr } : { mode: 'text' }
  return {
    engine,
    expr: f.jsonPath ?? f.selector,
    fallbacks: f.fallbacks ?? [],
    extract
  }
}

function inputPlaceholders(template: string): PlaceholderDep[] {
  // 搜索步骤的占位符(keyword)均由用户输入提供。
  return extractPlaceholders(template).map((name) => ({ name, satisfiedBy: { kind: 'input' } }))
}

/**
 * 把书源编译为一条「搜索」Rule:entry=keyword → 单步 search → 输出书单友好列。
 * 网页源走 CSS(含伪类原样保留,引擎切片),API 源走 JSONPath(key$$ 已归一)。
 */
export function compileSearchRule(raw: RawBookSource): Rule {
  const detection = detectSourceType(raw)
  const engine = detection.type === 'api' ? 'jsonpath' : 'css'
  const searchResult = parseSearchResult(raw.search_result, detection.type)

  const directives = parseUrlDirectives(raw.search_url ?? '')
  const placeholders = inputPlaceholders(directives.url)
  // 入口关键词参数名取搜索 URL 里的占位符(七猫/旧钢笔均为 keyword),缺省 keyword。
  const keywordParam = placeholders[0]?.name ?? 'keyword'

  const request: RequestConfig = {
    url: { kind: 'template', template: directives.url, placeholders },
    method: 'GET'
  }
  if (directives.encoding) request.encoding = directives.encoding
  if (directives.followRedirect) request.followRedirect = true
  if (typeof raw.time_out === 'number') request.timeoutMs = raw.time_out

  const fields: Record<string, IrFieldRule> = {}
  if (searchResult) {
    for (const key of DISPLAY_FIELDS) {
      const f = searchResult.fields[key]
      if (f) fields[key] = { selector: toSelector(engine, f), label: FIELD_LABELS[key] }
    }
  }

  const container: SelectorExpr = {
    engine,
    expr: searchResult?.listSelector ?? '',
    fallbacks: searchResult?.listFallbacks ?? []
  }

  const parse: ParseSpec = {
    shape: 'list',
    list: { container },
    fields
  }
  if (searchResult?.limit != null) parse.limit = searchResult.limit

  const step: CollectStep = {
    id: 'search',
    name: '搜索 · Search',
    request,
    parse,
    fanout: { kind: 'once' }
  }

  const columns: OutputColumn[] = Object.keys(fields).map((key) => ({
    name: FIELD_LABELS[key] ?? key,
    fromField: key,
    fromStep: 'search',
    type: key === 'cover' ? 'image' : 'string'
  }))

  const entry: EntryPoint = {
    kind: 'keyword',
    param: keywordParam,
    example: '剑来'
  }

  const vars: VarDecl[] = [{ name: keywordParam, origin: 'input', required: true }]

  const meta: RuleMeta = {
    id: raw.source_url ?? raw.source_name ?? 'book-source',
    name: raw.source_name ?? '书源',
    origin: 'book-source',
    sourceType: detection.type
  }
  if (raw.source_url) meta.sourceUrl = raw.source_url
  if (raw.source_remark) meta.remark = raw.source_remark

  return {
    irVersion: 1,
    meta,
    entry,
    vars,
    steps: [step],
    output: { format: 'records', columns, formats: ['csv', 'json'] }
  }
}
