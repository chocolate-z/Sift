// ============================================================================
// @sift/core-ir — variable model: the binding scope the multi-step scheduler
// threads between steps (line-B keyword → book_id → item_id; line-A none).
// ============================================================================

export interface VarDecl {
  /** placeholder name: 'keyword' | 'book_id' | 'item_id' | … */
  name: string
  /** input = user-supplied seed; produced = bound by a step. */
  origin: 'input' | 'produced'
  required?: boolean
  /** when origin === 'produced': id of the step that binds it (provenance). */
  producedBy?: string
}

/** a placeholder this step consumes, with its producer resolved. */
export interface StepInput {
  name: string // 'book_id'
  from: { kind: 'input' } | { kind: 'step'; stepId: string; field: string } | { kind: 'unknown' }
}

/** a variable this step exports to downstream steps. */
export interface VarBinding {
  /** variable name to export (book_id, item_id). */
  name: string
  /** parsed field key in this step that supplies the value. */
  from: string
}

/** a placeholder dependency in a templated URL, with its producer resolved. */
export interface PlaceholderDep {
  name: string // 'keyword' | 'book_id'
  satisfiedBy: { kind: 'input' } | { kind: 'step'; stepId: string } | { kind: 'unknown' }
}

/** how the driver fans a step out over an upstream list. */
export type Fanout =
  | { kind: 'once' } // search / single-page step
  | { kind: 'perItem'; overStep: string; asVar?: string } // run once per upstream item
