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
  Pagination,
  ParseSpec,
  PipelineOp,
  PlaceholderDep,
  RequestConfig,
  Rule,
  RuleMeta,
  SelectorExpr,
  UrlSource,
  VarDecl
} from '@sift/core-ir'

import {
  decodeContentFilter,
  extractPlaceholders,
  isJsonPathExpr,
  normalizeOrRaw,
  parseUrlDirectives
} from './decoders'
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

/**
 * 把书源编译为「目录」Rule:搜索 → 每本书的章节列表(2 步链路,可作预览运行)。
 * API 源(七猫)走 template-id 链路(book_id 穿线 + JSON data.chapters);网页源(旧钢笔)
 * 走 extracted-url 链路(从搜索行抽 book_url + book_menu 直取章节链接,引擎空选择器自取)。
 * 正文抓取 / 内容过滤 / 正文翻页量大,属下载流(后续 compileBookSource),此处不含。
 */
export function compileCatalogRule(raw: RawBookSource): Rule {
  const detection = detectSourceType(raw)
  const searchEngine = detection.type === 'api' ? 'jsonpath' : 'css'
  const searchResult = parseSearchResult(raw.search_result, detection.type)

  const directives = parseUrlDirectives(raw.search_url ?? '')
  const placeholders = inputPlaceholders(directives.url)
  const keywordParam = placeholders[0]?.name ?? 'keyword'

  // 站点指令(gb2312 / 302)同域贯穿:每步请求都带上(目录/正文页同站同编码)。
  const withDirectives = (req: RequestConfig): RequestConfig => {
    if (directives.encoding) req.encoding = directives.encoding
    if (directives.followRedirect) req.followRedirect = true
    return req
  }

  // ---- 步骤 1:搜索 ----
  const searchReq = withDirectives({
    url: { kind: 'template', template: directives.url, placeholders },
    method: 'GET'
  })
  if (typeof raw.time_out === 'number') searchReq.timeoutMs = raw.time_out

  const searchFields: Record<string, IrFieldRule> = {}
  if (searchResult) {
    for (const key of DISPLAY_FIELDS) {
      const f = searchResult.fields[key]
      if (f) searchFields[key] = { selector: toSelector(searchEngine, f), label: FIELD_LABELS[key] }
    }
  }

  // 目录 URL 来源:模板(七猫 ?book_id=###book_id###)vs 抽取(旧钢笔从搜索行链接)。
  const srUrl = raw.search_result?.url
  const catalogUrlIsTemplate = !!srUrl && (srUrl.includes('###') || srUrl.startsWith('http'))

  if (catalogUrlIsTemplate) {
    // 七猫:搜索步骤需抽出 book_id 供目录 URL 模板。
    if (raw.search_result?.book_id) {
      searchFields.book_id = {
        selector: {
          engine: searchEngine,
          expr: normalizeOrRaw(raw.search_result.book_id),
          fallbacks: [],
          extract: { mode: 'text' }
        }
      }
    }
  } else if (srUrl && searchResult?.fields.url) {
    // 旧钢笔:从每个搜索行抽出书籍详情 URL(url_replace m→www + resolveUrl)。
    const sel = toSelector(searchEngine, searchResult.fields.url)
    sel.pipeline = []
    if (searchResult.urlReplaceRules.length) {
      sel.pipeline.push({
        op: 'urlReplace',
        rules: searchResult.urlReplaceRules.map((r) => ({ from: r.from, to: r.to }))
      })
    }
    sel.pipeline.push({ op: 'resolveUrl' })
    searchFields.book_url = { selector: sel }
  }

  const searchParse: ParseSpec = {
    shape: 'list',
    list: {
      container: {
        engine: searchEngine,
        expr: searchResult?.listSelector ?? '',
        fallbacks: searchResult?.listFallbacks ?? []
      }
    },
    fields: searchFields
  }
  if (searchResult?.limit != null) searchParse.limit = searchResult.limit

  const searchStep: CollectStep = {
    id: 'search',
    name: '搜索 · Search',
    request: searchReq,
    parse: searchParse,
    fanout: { kind: 'once' }
  }

  // ---- 步骤 2:目录(章节列表)----
  // 能否构建目录:模板式目录 URL(七猫 ?book_id=)或已抽出 book_url(旧钢笔)。
  // 否则(网页源缺 search_result.url,无从得知书籍详情链接)优雅降级为「仅搜索」,
  // 避免发出永远填不上的 ###book_url### 导致整轮失败。
  const canBuildCatalog = catalogUrlIsTemplate || !!searchFields.book_url
  const catalogEngine = isJsonPathExpr(raw.book_menu ?? '') ? 'jsonpath' : searchEngine
  const catalogUrl: UrlSource = catalogUrlIsTemplate
    ? {
        kind: 'template',
        template: srUrl as string,
        placeholders: extractPlaceholders(srUrl as string).map((name) => ({
          name,
          satisfiedBy: { kind: 'step', stepId: 'search' }
        }))
      }
    : {
        kind: 'template',
        template: '###book_url###',
        placeholders: [{ name: 'book_url', satisfiedBy: { kind: 'step', stepId: 'search' } }]
      }

  const catalogFields: Record<string, IrFieldRule> = {}
  let thirdCol: OutputColumn | null = null
  if (catalogEngine === 'jsonpath') {
    // 七猫:章节名 ← item_name(key$$title),章节ID ← item_id。
    if (raw.item_name) {
      catalogFields.chapter_name = {
        selector: { engine: 'jsonpath', expr: normalizeOrRaw(raw.item_name), fallbacks: [], extract: { mode: 'text' } },
        label: '章节名'
      }
    }
    if (raw.item_id) {
      catalogFields.chapter_id = {
        selector: { engine: 'jsonpath', expr: normalizeOrRaw(raw.item_id), fallbacks: [], extract: { mode: 'text' } },
        label: '章节ID'
      }
      thirdCol = { name: '章节ID', fromField: 'chapter_id', fromStep: 'catalog', type: 'string' }
    }
  } else {
    // 旧钢笔:book_menu 直取 <a>,章节名=自身文本,链接=自身 href(空选择器自取)。
    const attr = typeof raw.book_menu_attr === 'string' && raw.book_menu_attr ? raw.book_menu_attr : 'href'
    catalogFields.chapter_name = {
      selector: { engine: 'css', expr: '', fallbacks: [], extract: { mode: 'text' } },
      label: '章节名'
    }
    catalogFields.chapter_url = {
      selector: {
        engine: 'css',
        expr: '',
        fallbacks: [],
        extract: { mode: 'attr', name: attr },
        pipeline: [{ op: 'resolveUrl' }]
      },
      label: '章节链接'
    }
    thirdCol = { name: '链接', fromField: 'chapter_url', fromStep: 'catalog', type: 'url' }
  }

  const catalogStep: CollectStep = {
    id: 'catalog',
    name: '目录 · Catalog',
    request: withDirectives({ url: catalogUrl, method: 'GET' }),
    parse: {
      shape: 'list',
      list: {
        container: {
          engine: catalogEngine,
          expr: catalogEngine === 'jsonpath' ? normalizeOrRaw(raw.book_menu ?? '') : (raw.book_menu ?? ''),
          fallbacks: []
        }
      },
      fields: catalogFields
    },
    fanout: { kind: 'perItem', overStep: 'search' }
  }

  // 输出:书名(搜索,下沉) + 章节 +(链接/章节ID);仅搜索降级时只输出书单列。
  const columns: OutputColumn[] = []
  if (searchFields.name) columns.push({ name: '书名', fromField: 'name', fromStep: 'search', type: 'string' })
  if (searchFields.author) columns.push({ name: '作者', fromField: 'author', fromStep: 'search', type: 'string' })
  if (canBuildCatalog && catalogFields.chapter_name)
    columns.push({ name: '章节', fromField: 'chapter_name', fromStep: 'catalog', type: 'string' })
  if (canBuildCatalog && thirdCol) columns.push(thirdCol)

  const vars: VarDecl[] = [{ name: keywordParam, origin: 'input', required: true }]
  if (canBuildCatalog) {
    vars.push({ name: catalogUrlIsTemplate ? 'book_id' : 'book_url', origin: 'produced', producedBy: 'search' })
  }

  const meta: RuleMeta = {
    id: raw.source_url ?? raw.source_name ?? 'book-source',
    name: raw.source_name ?? '书源',
    origin: 'book-source',
    sourceType: detection.type
  }
  if (raw.source_url) meta.sourceUrl = raw.source_url
  if (raw.source_remark) meta.remark = raw.source_remark

  const entry: EntryPoint = { kind: 'keyword', param: keywordParam, example: '剑来' }

  return {
    irVersion: 1,
    meta,
    entry,
    vars,
    steps: canBuildCatalog ? [searchStep, catalogStep] : [searchStep],
    output: { format: 'records', columns, formats: ['csv', 'json'] }
  }
}

/** 正文预览的安全上限:只抓前 N 章、每章至多 M 页,避免对上千章逐一发请求。 */
const CHAPTER_PREVIEW_LIMIT = 3
const CHAPTER_PAGE_LIMIT = 8

/**
 * 把书源编译为「正文」Rule:搜索 → 目录 → 每章正文(3 步链路,下载流 M3 前置)。
 * 在 compileCatalogRule 的 2 步基础上**追加第 3 步 chapter**:对目录每一章 fanout 抓正文页,
 * 抽 chapter_title/chapter_content;content_filter(已解码的正则)编为 `regex` 清洗管线去广告/
 * 版权(全局替换为空);正文翻页(multi_page + next_btn)走 nextButton + appendContent 拼接同章多页。
 * **预览防失控**:限前 N 章(目录 limit)+ 限页 + 限速(core-ir 风险 #5)。
 * 无目录(网页源缺 book_url 已降级为仅搜索)或无正文选择器 / 章节 URL 不可得 → 返回目录规则原样。
 */
export function compileBookSource(raw: RawBookSource): Rule {
  const catalogRule = compileCatalogRule(raw)
  const catalogStep = catalogRule.steps.find((s) => s.id === 'catalog')
  // 无目录步(仅搜索降级)或无正文选择器 → 无从抓正文,退回目录/搜索规则。
  if (!catalogStep || typeof raw.chapter_content !== 'string' || !raw.chapter_content) return catalogRule

  const isApi = detectSourceType(raw).type === 'api'

  // 章节 URL 来源:七猫=item_url 模板(item_id 对齐目录字段名 chapter_id);
  // 旧钢笔=目录抽出的 chapter_url。任一不可得 → 退回目录规则。
  let chapterUrl: UrlSource
  if (isApi) {
    if (typeof raw.item_url !== 'string' || !raw.item_url) return catalogRule
    const tmpl = raw.item_url.replace(/###item_id###/g, '###chapter_id###')
    chapterUrl = {
      kind: 'template',
      template: tmpl,
      placeholders: extractPlaceholders(tmpl).map((name) => ({
        name,
        satisfiedBy: { kind: 'step', stepId: 'catalog' }
      }))
    }
  } else {
    if (!catalogStep.parse.fields.chapter_url) return catalogRule
    chapterUrl = {
      kind: 'template',
      template: '###chapter_url###',
      placeholders: [{ name: 'chapter_url', satisfiedBy: { kind: 'step', stepId: 'catalog' } }]
    }
  }

  // 预览限章:截断目录产出,fanout 只对前 N 章发请求。
  catalogStep.parse.limit = Math.min(catalogStep.parse.limit ?? CHAPTER_PREVIEW_LIMIT, CHAPTER_PREVIEW_LIMIT)

  // 站点指令(gb2312/302)同站贯穿正文页;超时同源;预览逐章抓正文,设最小间隔温和限速。
  const directives = parseUrlDirectives(raw.search_url ?? '')
  const chapterReq: RequestConfig = { url: chapterUrl, method: 'GET' }
  if (directives.encoding) chapterReq.encoding = directives.encoding
  if (directives.followRedirect) chapterReq.followRedirect = true
  if (typeof raw.time_out === 'number') chapterReq.timeoutMs = raw.time_out
  chapterReq.rateLimit = { minIntervalMs: 800 }

  // content_filter(已 Base64 解码)→ 正文字段上的 regex 清洗管线(全局替换为空)。
  const cleanOps: PipelineOp[] = decodeContentFilter(raw.content_filter)
    .map((f) => (f.status === 'decoded' && f.decoded ? f.decoded : f.raw))
    .filter((p): p is string => !!p)
    .map((pattern): PipelineOp => ({ op: 'regex', pattern, replace: '' }))

  const chapterFields: Record<string, IrFieldRule> = {}
  if (typeof raw.chapter_title === 'string' && raw.chapter_title.trim()) {
    chapterFields.chapter_title = {
      selector: { engine: 'css', expr: raw.chapter_title, fallbacks: [], extract: { mode: 'text' } },
      label: '章节标题'
    }
  }
  const contentSel: SelectorExpr = {
    engine: 'css',
    expr: raw.chapter_content,
    fallbacks: [],
    extract: { mode: 'text' }
  }
  if (cleanOps.length) contentSel.pipeline = cleanOps
  chapterFields.chapter_content = { selector: contentSel, label: '正文' }

  // 正文翻页(旧钢笔 multi_page + next_btn):跟随「下一页」,appendContent 拼接同章多页。
  // next_val 是「下一页」按钮的**显示文本**:仅当 next 元素文本含之才继续翻(requireText),
  // 末页文本变化(如「下一章」)即止——不是 stopText(那是反过来的「含此即停」)。
  let pagination: Pagination | undefined
  if (raw.multi_page && typeof raw.next_btn === 'string' && raw.next_btn) {
    pagination = {
      kind: 'nextButton',
      next: { engine: 'css', expr: raw.next_btn, fallbacks: [], extract: { mode: 'attr', name: 'href' } },
      maxPages: CHAPTER_PAGE_LIMIT,
      combine: 'appendContent'
    }
    if (typeof raw.next_val === 'string' && raw.next_val) pagination.requireText = raw.next_val
  }

  const chapterStep: CollectStep = {
    id: 'chapter',
    name: '正文 · Chapter',
    request: chapterReq,
    parse: { shape: 'page', fields: chapterFields },
    fanout: { kind: 'perItem', overStep: 'catalog' }
  }
  if (pagination) chapterStep.pagination = pagination

  // 输出:书名 + 章节 + [章节标题] + 正文(聚焦正文,省去作者/链接列)。
  const columns: OutputColumn[] = []
  if (catalogRule.steps[0]?.parse.fields.name)
    columns.push({ name: '书名', fromField: 'name', fromStep: 'search', type: 'string' })
  if (catalogStep.parse.fields.chapter_name)
    columns.push({ name: '章节', fromField: 'chapter_name', fromStep: 'catalog', type: 'string' })
  if (chapterFields.chapter_title)
    columns.push({ name: '章节标题', fromField: 'chapter_title', fromStep: 'chapter', type: 'string' })
  columns.push({ name: '正文', fromField: 'chapter_content', fromStep: 'chapter', type: 'string' })

  return {
    ...catalogRule,
    steps: [...catalogRule.steps, chapterStep],
    output: { ...catalogRule.output, columns }
  }
}
