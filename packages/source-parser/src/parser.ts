// ============================================================================
// Sift · line-B — book-source orchestrator
// Ties the decoders + pseudo layers into a single parseBookSource() that yields
// a normalized, UI-ready ParseResult. Covers items 1, 5, 10, 11.
// ============================================================================

import {
  decodeContentFilter,
  extractPlaceholders,
  isJsonPathExpr,
  normalizeJsonPath,
  normalizeOrRaw,
  parseUrlDirectives,
  parseUrlReplaceRules
} from './decoders'
import { splitSelectorList } from './pseudo'
import type {
  CollectStep,
  FieldRule,
  ParsedSearchResult,
  ParseMode,
  ParseResult,
  RawBookSource,
  RawSearchResult,
  SourceType,
  SourceTypeDetection,
  StepVarDep,
  ValidationStatus
} from './types'

// ---------------------------------------------------------------------------
// Known-field tables (item 10 — unknown-field tolerance)
// ---------------------------------------------------------------------------

const KNOWN_TOP_FIELDS = new Set([
  'source_name',
  'source_type',
  'source_url',
  'source_remark',
  'time_out',
  'book_name',
  'book_remark',
  'book_author',
  'book_cover',
  'book_menu',
  'book_menu_attr',
  'item_id',
  'item_name',
  'item_url',
  'chapter_title',
  'chapter_content_type',
  'chapter_content',
  'content_filter',
  'multi_page',
  'next_btn',
  'next_val',
  'search_url',
  'search_result'
])

const KNOWN_SEARCH_RESULT_FIELDS = new Set([
  'limit',
  'list',
  'book_id',
  'name',
  'author',
  'newest',
  'remark',
  'cover',
  'cover_attr',
  'url',
  'url_type',
  'url_attr',
  'url_replace_rules'
])

// ---------------------------------------------------------------------------
// item 1 — source-type detection
// ---------------------------------------------------------------------------

const CSS_HINT_RE = /[.#]|:(gt|lt|eq)\(|\[[^\]]+\]|\s>\s|\sa\b/

function looksLikeCss(v: string): boolean {
  return !v.includes('key$$') && CSS_HINT_RE.test(v)
}

export function detectSourceType(raw: RawBookSource): SourceTypeDetection {
  if (raw.source_type === '2') {
    return { type: 'api', confidence: 1, reasons: ['source_type="2" → API (JSON) source'] }
  }

  const values: string[] = []
  const push = (v: unknown) => {
    if (typeof v === 'string' && v.trim()) values.push(v)
  }
  push(raw.book_menu)
  push(raw.item_id)
  push(raw.item_name)
  push(raw.chapter_content)
  push(raw.chapter_title)
  push(raw.book_name)
  const sr = raw.search_result
  if (sr) {
    push(sr.list)
    push(sr.name)
    push(sr.author)
    push(sr.url)
    push(sr.book_id)
  }

  let jsonCount = 0
  let cssCount = 0
  for (const v of values) {
    if (v.includes('key$$')) jsonCount++
    else if (looksLikeCss(v)) cssCount++
  }

  const total = jsonCount + cssCount || 1
  if (jsonCount > 0 && jsonCount >= cssCount) {
    return {
      type: 'api',
      confidence: jsonCount / total,
      reasons: [`${jsonCount} field(s) use key$$ JSON-path syntax (no source_type)`]
    }
  }
  return {
    type: 'web',
    confidence: cssCount / total,
    reasons: [`${cssCount} field(s) look like CSS selectors, no JSON-path syntax`]
  }
}

// ---------------------------------------------------------------------------
// item 10 — collect unknown fields (tolerated, never throws)
// ---------------------------------------------------------------------------

export function collectUnknownFields(raw: RawBookSource): string[] {
  const unknown: string[] = []
  for (const k of Object.keys(raw)) {
    if (!KNOWN_TOP_FIELDS.has(k)) unknown.push(k)
  }
  const sr = raw.search_result
  if (sr && typeof sr === 'object') {
    for (const k of Object.keys(sr)) {
      if (!KNOWN_SEARCH_RESULT_FIELDS.has(k)) unknown.push(`search_result.${k}`)
    }
  }
  return unknown
}

// ---------------------------------------------------------------------------
// search_result parsing (items 2, 8, 9)
// ---------------------------------------------------------------------------

function parseRuleValue(value: string, isApi: boolean): FieldRule {
  if (isApi || isJsonPathExpr(value)) {
    return { selector: value, fallbacks: [], jsonPath: normalizeJsonPath(value) }
  }
  const alts = splitSelectorList(value)
  return { selector: alts[0] ?? value, fallbacks: alts.slice(1) }
}

export function parseSearchResult(sr: RawSearchResult | undefined, sourceType: SourceType): ParsedSearchResult | null {
  if (!sr) return null
  const isApi = sourceType === 'api'

  let listSelector: string | null = null
  let listFallbacks: string[] = []
  if (typeof sr.list === 'string' && sr.list) {
    const r = parseRuleValue(sr.list, isApi)
    listSelector = r.jsonPath ?? r.selector
    listFallbacks = r.fallbacks
  }

  const fields: Record<string, FieldRule> = {}
  for (const key of ['name', 'author', 'newest', 'remark', 'cover', 'url'] as const) {
    const v = sr[key]
    if (typeof v === 'string' && v) {
      const rule = parseRuleValue(v, isApi)
      const attrKey = `${key}_attr`
      const attr = sr[attrKey]
      if (typeof attr === 'string' && attr) rule.attr = attr
      fields[key] = rule
    }
  }

  const limit = typeof sr.limit === 'string' ? Number.parseInt(sr.limit, 10) : null

  return {
    limit: Number.isFinite(limit) ? limit : null,
    listSelector,
    listFallbacks,
    fields,
    urlType: typeof sr.url_type === 'string' ? sr.url_type : null,
    urlReplaceRules: parseUrlReplaceRules(sr.url_replace_rules)
  }
}

// ---------------------------------------------------------------------------
// item 5 — multi-step collection chain (variable passing)
// ---------------------------------------------------------------------------

export function buildStepChain(
  raw: RawBookSource,
  detection: SourceTypeDetection,
  searchResult: ParsedSearchResult | null
): CollectStep[] {
  const steps: CollectStep[] = []
  const producer = new Map<string, 'input' | number>()
  producer.set('keyword', 'input')

  const resolveDeps = (template: string | null | undefined): StepVarDep[] => {
    if (!template) return []
    return extractPlaceholders(template).map((name) => ({
      name,
      satisfiedBy: producer.get(name) ?? 'unknown'
    }))
  }
  // Parse mode is decided per step by the selector syntax: key$$ → json, else
  // css. A single source can mix modes (e.g. qimao searches a JSON API but its
  // chapter pages are HTML parsed with `body`). Falls back to the source type
  // only when a step exposes no selector at all.
  const modeOf = (sel: string | null | undefined): ParseMode =>
    sel == null ? (detection.type === 'api' ? 'json' : 'css') : isJsonPathExpr(sel) ? 'json' : 'css'

  const wholeSource = JSON.stringify(raw)

  // -- Step 1: search --
  if (raw.search_url) {
    const index = steps.length
    const directives = parseUrlDirectives(raw.search_url)
    const rules: Record<string, string> = {}
    if (searchResult) {
      if (searchResult.listSelector) rules.list = searchResult.listSelector
      for (const [k, f] of Object.entries(searchResult.fields)) rules[k] = f.jsonPath ?? f.selector
    }
    const step: CollectStep = {
      index,
      id: 'search',
      name: '搜索 · Search',
      urlSource: 'template',
      urlTemplate: directives.url,
      urlSelector: null,
      directives,
      parseMode: modeOf(raw.search_result?.list),
      placeholderDeps: resolveDeps(directives.url),
      rules,
      produces: [],
      notes: []
    }
    if (directives.followRedirect) step.notes.push('follow 302 redirect')
    if (directives.encoding) step.notes.push(`decode response as ${directives.encoding}`)
    // the search step produces book_id when a downstream URL template needs it
    if (raw.search_result?.book_id || wholeSource.includes('###book_id###')) {
      producer.set('book_id', index)
      step.produces.push('book_id')
    }
    steps.push(step)
  }

  // -- Step 2: book detail / catalog --
  const srUrl = raw.search_result?.url
  if (srUrl) {
    const index = steps.length
    const isTemplate = srUrl.includes('###') || srUrl.startsWith('http')
    const rules: Record<string, string> = {}
    if (raw.book_name) rules.book_name = raw.book_name
    if (raw.book_author) rules.book_author = raw.book_author
    if (raw.book_cover) rules.book_cover = raw.book_cover
    if (raw.book_remark) rules.book_remark = raw.book_remark
    if (raw.book_menu) rules.book_menu = normalizeOrRaw(raw.book_menu)
    if (raw.item_id) rules.item_id = normalizeOrRaw(raw.item_id)
    if (raw.item_name) rules.item_name = normalizeOrRaw(raw.item_name)
    if (raw.item_url) rules.item_url = raw.item_url
    const step: CollectStep = {
      index,
      id: 'book',
      name: '书籍详情 / 目录 · Book detail & catalog',
      urlSource: isTemplate ? 'template' : 'extracted',
      urlTemplate: isTemplate ? srUrl : null,
      urlSelector: isTemplate ? null : srUrl,
      directives: null,
      parseMode: modeOf(raw.book_menu ?? srUrl),
      placeholderDeps: isTemplate ? resolveDeps(srUrl) : [],
      rules,
      produces: [],
      notes: []
    }
    if (raw.item_id || raw.item_url?.includes('###item_id###')) {
      producer.set('item_id', index)
      step.produces.push('item_id')
    }
    steps.push(step)
  }

  // -- Step 3: chapter content --
  if (raw.chapter_content || raw.item_url) {
    const index = steps.length
    const isTemplate = !!raw.item_url && raw.item_url.includes('###')
    const rules: Record<string, string> = {}
    if (raw.chapter_title) rules.chapter_title = raw.chapter_title
    if (raw.chapter_content) rules.chapter_content = raw.chapter_content
    const step: CollectStep = {
      index,
      id: 'chapter',
      name: '正文 · Chapter content',
      urlSource: isTemplate ? 'template' : raw.book_menu ? 'extracted' : 'template',
      urlTemplate: isTemplate ? (raw.item_url ?? null) : null,
      urlSelector: !isTemplate && raw.book_menu ? raw.book_menu : null,
      directives: null,
      parseMode: modeOf(raw.chapter_content),
      placeholderDeps: isTemplate ? resolveDeps(raw.item_url) : [],
      rules,
      produces: [],
      notes: []
    }
    if (raw.chapter_content_type) step.notes.push(`chapter_content_type=${raw.chapter_content_type}`)
    if (raw.multi_page) {
      step.notes.push(`multi_page=true · next: "${raw.next_val ?? ''}" (${raw.next_btn ?? ''})`)
    }
    steps.push(step)
  }

  return steps
}

// ---------------------------------------------------------------------------
// item 11 — completeness validation (warnings, never throws)
// ---------------------------------------------------------------------------

function collectAllPlaceholders(raw: RawBookSource): string[] {
  const out = new Set<string>()
  const scan = (v: unknown) => {
    if (typeof v === 'string') for (const p of extractPlaceholders(v)) out.add(p)
  }
  scan(raw.search_url)
  scan(raw.item_url)
  scan(raw.search_result?.url)
  return [...out]
}

export function validate(
  raw: RawBookSource,
  steps: CollectStep[]
): { status: ValidationStatus; warnings: string[]; errors: string[] } {
  const warnings: string[] = []
  const errors: string[] = []

  // Hard failure: an object that exposes no search_url, no search_result and no
  // chapter/menu selectors yields zero collection steps — nothing is runnable.
  if (steps.length === 0) {
    errors.push('cannot construct any collection step — no search_url / search_result / selector rules')
  }

  if (!raw.search_url) warnings.push('missing search_url — search step unavailable')
  if (!raw.search_result) warnings.push('missing search_result — result mapping unavailable')
  else if (!raw.search_result.list) {
    warnings.push('missing search_result.list — cannot locate result rows')
  }
  if (!raw.chapter_content) warnings.push('missing chapter_content — cannot extract chapter body')

  for (const s of steps) {
    for (const d of s.placeholderDeps) {
      if (d.satisfiedBy === 'unknown') {
        warnings.push(`step "${s.id}": placeholder ###${d.name}### has no producer`)
      }
    }
  }

  const status: ValidationStatus = errors.length ? 'error' : warnings.length ? 'warning' : 'ok'
  return { status, warnings, errors }
}

// ---------------------------------------------------------------------------
// Top-level entry
// ---------------------------------------------------------------------------

export function parseBookSource(raw: RawBookSource): ParseResult {
  if (!raw || typeof raw !== 'object') {
    return {
      status: 'error',
      sourceType: { type: 'web', confidence: 0, reasons: ['input is not an object'] },
      steps: [],
      searchResult: null,
      contentFilters: [],
      placeholders: [],
      unknownFields: [],
      warnings: [],
      errors: ['input is not a valid object']
    }
  }

  // Safety net: a malformed real-world source must degrade to an error result,
  // never throw (the parser is fed untrusted, loosely-typed user input).
  try {
    const sourceType = detectSourceType(raw)
    const searchResult = parseSearchResult(raw.search_result, sourceType.type)
    const contentFilters = decodeContentFilter(raw.content_filter)
    const steps = buildStepChain(raw, sourceType, searchResult)
    const unknownFields = collectUnknownFields(raw)
    const placeholders = collectAllPlaceholders(raw)
    const v = validate(raw, steps)

    return {
      status: v.status,
      sourceType,
      steps,
      searchResult,
      contentFilters,
      placeholders,
      unknownFields,
      warnings: v.warnings,
      errors: v.errors
    }
  } catch (e) {
    return {
      status: 'error',
      sourceType: { type: 'web', confidence: 0, reasons: ['parse error'] },
      steps: [],
      searchResult: null,
      contentFilters: [],
      placeholders: [],
      unknownFields: [],
      warnings: [],
      errors: [`unexpected parse error: ${e instanceof Error ? e.message : String(e)}`]
    }
  }
}
