// ============================================================================
// Sift · line-B (book-source / 书源 DSL) — type definitions
// These types are the verification-phase contract for the source-parser package
// and are intended for reuse by the rule-import UI (§6.7 "types.ts 完整").
// ============================================================================

// ---------------------------------------------------------------------------
// Raw input shape — what the user pastes. Loosely typed: every known field is
// optional and arbitrary unknown keys are tolerated (see collectUnknownFields).
// ---------------------------------------------------------------------------

export interface RawSearchResult {
  limit?: string
  list?: string
  book_id?: string
  name?: string
  author?: string
  newest?: string
  remark?: string
  cover?: string
  cover_attr?: string
  url?: string
  url_type?: string
  url_attr?: string
  // array form (["from%%to"]) or '&&'-joined string form ("a%%b&&c%%d")
  url_replace_rules?: string | string[]
  [key: string]: unknown
}

export interface RawBookSource {
  source_name?: string
  source_type?: string
  source_url?: string
  source_remark?: string
  time_out?: number
  book_name?: string
  book_remark?: string
  book_author?: string
  book_cover?: string
  book_menu?: string
  book_menu_attr?: string
  item_id?: string
  item_name?: string
  item_url?: string
  chapter_title?: string
  chapter_content_type?: string
  chapter_content?: string
  content_filter?: string[]
  multi_page?: boolean
  next_btn?: string
  next_val?: string
  search_url?: string
  search_result?: RawSearchResult
  [key: string]: unknown
}

// ---------------------------------------------------------------------------
// Source-type detection (item 1)
// ---------------------------------------------------------------------------

export type SourceType = 'api' | 'web'
export type ParseMode = 'json' | 'css'
export type ValidationStatus = 'ok' | 'warning' | 'error'

export interface SourceTypeDetection {
  type: SourceType
  /** 0..1 — how strongly the heuristics agree */
  confidence: number
  reasons: string[]
}

// ---------------------------------------------------------------------------
// URL directive stripping (item 3)
// ---------------------------------------------------------------------------

export interface UrlDirectives {
  /** original raw string */
  raw: string
  /** ordered directive tokens, e.g. ['302', 'gb2312'] */
  instructions: string[]
  /** a 30x directive was present → follow HTTP redirect */
  followRedirect: boolean
  /** a charset directive was present, e.g. 'gb2312' */
  encoding: string | null
  /** the pure URL with all {{...}} directives stripped */
  url: string
}

// ---------------------------------------------------------------------------
// content_filter Base64 decode (item 6)
// ---------------------------------------------------------------------------

export interface DecodedFilter {
  raw: string
  decoded: string | null
  isBase64: boolean
  status: 'decoded' | 'kept'
}

// ---------------------------------------------------------------------------
// url_replace_rules (item 9)
// ---------------------------------------------------------------------------

export interface UrlReplaceRule {
  raw: string
  from: string
  to: string
}

// ---------------------------------------------------------------------------
// jQuery positional pseudo-class translation (item 7)
// ---------------------------------------------------------------------------

export type PositionalOp =
  | { type: 'gt'; n: number; slice: { start: number; end: number | null } }
  | { type: 'lt'; n: number; slice: { start: number; end: number } }
  | { type: 'eq'; n: number; index: number }

export interface PseudoSegment {
  /** standard-CSS chunk the op applies to (pseudo removed) */
  selector: string
  op: PositionalOp | null
}

export interface TranslatedSelector {
  original: string
  /** ordered chain of (standard selector chunk, positional op) */
  segments: PseudoSegment[]
  /** trailing standard-CSS descendant selector run inside the final filtered set */
  rest: string
  hadPseudo: boolean
  /** human-readable explanation, e.g. ':gt(8) → slice(9)' */
  description: string
}

// ---------------------------------------------------------------------------
// Field / search-result rule mapping
// ---------------------------------------------------------------------------

export interface FieldRule {
  /** primary selector or json path (raw form) */
  selector: string
  /** comma-separated fallback alternatives, in priority order (item 8) */
  fallbacks: string[]
  /** attribute to extract, e.g. 'href' / 'src' (item 5, line A mirror) */
  attr?: string
  /** normalized json path when the value used key$$ syntax (item 2) */
  jsonPath?: string
}

export interface ParsedSearchResult {
  limit: number | null
  listSelector: string | null
  listFallbacks: string[]
  fields: Record<string, FieldRule>
  urlType: string | null
  urlReplaceRules: UrlReplaceRule[]
}

// ---------------------------------------------------------------------------
// Multi-step collection chain (item 5)
// ---------------------------------------------------------------------------

export interface StepVarDep {
  /** placeholder name, e.g. 'book_id' */
  name: string
  /** 'input' (user supplies), a producing step index, or 'unknown' (unresolved) */
  satisfiedBy: 'input' | number | 'unknown'
}

export interface CollectStep {
  index: number
  id: 'search' | 'book' | 'chapter'
  name: string
  /** how this step's request URL is obtained */
  urlSource: 'input' | 'template' | 'extracted'
  /** URL template with ###placeholders### (when urlSource is template/input) */
  urlTemplate: string | null
  /** CSS selector that extracts the next URL from the previous page (when extracted) */
  urlSelector: string | null
  /** parsed URL directives (search step only, else null) */
  directives: UrlDirectives | null
  parseMode: ParseMode
  /** placeholders this step's URL depends on, with their producer resolved */
  placeholderDeps: StepVarDep[]
  /** normalized field → selector/path map for display */
  rules: Record<string, string>
  /** variables this step is expected to produce for downstream steps */
  produces: string[]
  notes: string[]
}

// ---------------------------------------------------------------------------
// Top-level parse result
// ---------------------------------------------------------------------------

export interface ParseResult {
  status: ValidationStatus
  sourceType: SourceTypeDetection
  steps: CollectStep[]
  searchResult: ParsedSearchResult | null
  contentFilters: DecodedFilter[]
  /** every ###placeholder### referenced anywhere in the source */
  placeholders: string[]
  /** keys not in the known-field table, tolerated rather than rejected (item 10) */
  unknownFields: string[]
  warnings: string[]
  errors: string[]
}
