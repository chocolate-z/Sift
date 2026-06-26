// ============================================================================
// @sift/core-ir — parse layer (§5.1 ②, §5.2②). Engine-dispatched by the
// `engine` tag on every SelectorExpr (the parser-plugin seam). List-aware.
// ============================================================================

import type { PipelineOp } from './pipeline'

export interface ParseSpec {
  /** 'page' = one record (book detail / chapter); 'list' = repeating column set. */
  shape: 'page' | 'list'
  /** present iff shape === 'list' (line-A RepeatStructure / line-B result list). */
  list?: ListSpec
  /** friendly-key → rule. For list steps these are per-item/column rules. */
  fields: Record<string, FieldRule>
  /** cap on items taken (line-B search_result.limit). */
  limit?: number
  /** line-B content_filter (already Base64-decoded patterns). */
  contentFilters?: ContentFilter[]
  x?: Record<string, unknown>
}

export interface ListSpec {
  /** the list container (line-A RepeatStructure.containerSelector / line-B list). */
  container: SelectorExpr
  /** selector matching ONE item; fields are relative to it (line-A itemSelector). */
  item?: SelectorExpr
}

// ---- the selector primitive: string + engine tag, NEVER a function ----

export interface SelectorExpr {
  /** dispatch key — THE parser plugin seam (§5.2②). */
  engine: ParserEngine
  /** CSS (may contain :gt/:lt/:eq verbatim) / XPath / dotted JSONPath. */
  expr: string
  /** ordered fallback alternatives, first hit wins (line-B item 8, comma-split). */
  fallbacks?: string[]
  /** value source: inner text vs named attribute (@href/@data-src) vs html. */
  extract?: Extraction
  /** ordered value post-processing. */
  pipeline?: PipelineOp[]
}

/** open string union — adding 'regex'/'jmespath' later is non-breaking. */
export type ParserEngine = 'css' | 'xpath' | 'jsonpath' | (string & {})

export type Extraction =
  | { mode: 'text' } // default
  | { mode: 'attr'; name: string } // 'href' | 'src' | 'data-src'
  | { mode: 'html' }

export interface FieldRule {
  selector: SelectorExpr
  /** friendly display name for the "原始→友好" double column (§ output). */
  label?: string
  required?: boolean
  x?: Record<string, unknown>
}

export interface ContentFilter {
  pattern: string
  isRegex?: boolean
}
