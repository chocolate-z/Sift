// ============================================================================
// @sift/core-ir — top-level Rule envelope (§5.2① architectural keystone)
// JSON-serializable. NO functions/closures anywhere. The engine knows ONLY this
// structure; point-pick (line A), book-source (line B) and hand-written rules
// all compile into it — a new input method is just a new translator.
// ============================================================================

import type { RuleCapabilities } from './capabilities'
import type { OutputSpec } from './output'
import type { RequestConfig } from './request'
import type { CollectStep } from './step'
import type { VarDecl } from './vars'

export type SourceType = 'api' | 'web'
export type ValidationStatus = 'ok' | 'warning' | 'error'

export interface Rule {
  /** schema version — forward-compat / migration gate. */
  irVersion: 1
  meta: RuleMeta
  /** run parameterization (keyword / seed url / none). */
  entry: EntryPoint
  /** declared variables threaded between steps (keyword, book_id, item_id…). */
  vars: VarDecl[]
  /** ORDERED collection chain. length === 1 ⇒ line-A single-page rule. */
  steps: CollectStep[]
  /** friendly dataset schema (friendly name ← raw field) + provenance. */
  output: OutputSpec
  /** per-rule request defaults; each step's request shallow-overrides these. */
  defaults?: RequestConfig
  /** PHASE-3 sandbox script bodies, referenced by PipelineOp.scriptId. */
  scripts?: Record<string, string>
  /** PHASE-2/3 automation facets — absent in MVP, engine treats absent == off. */
  capabilities?: RuleCapabilities
  /** forward-compat escape hatch. */
  x?: Record<string, unknown>
}

export interface RuleMeta {
  id: string
  name: string
  /** which translator produced this IR — provenance of the whole rule. */
  origin: 'visual-picker' | 'book-source' | 'handwritten'
  /** dominant fetch flavor (line-B detection §6.3①); engine reads parse.engine. */
  sourceType: SourceType
  sourceUrl?: string
  remark?: string
  createdAt?: string
  /** compile diagnostics carried for the rule-import UI (line-B item 11). */
  status?: ValidationStatus
  warnings?: string[]
}

// ---------------------------------------------------------------------------
// Run inputs
// ---------------------------------------------------------------------------

export type EntryPoint =
  | { kind: 'none' } // self-contained URL
  | { kind: 'url'; url: string; example?: string } // line-A: open one page
  | { kind: 'keyword'; param: string; example?: string } // line-B: ###keyword###
  | { kind: 'params'; params: ParamSpec[] } // generic multi-input

export interface ParamSpec {
  name: string
  required: boolean
  example?: string
}
