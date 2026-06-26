// ============================================================================
// @sift/core-ir — public surface. The unified Rule IR shared by the engine
// (M1) and all three translators (point-pick / book-source / handwritten).
// Pure type package + a tiny runtime version const and structural guard.
// ============================================================================

export * from './rule'
export * from './vars'
export * from './step'
export * from './request'
export * from './parse'
export * from './pipeline'
export * from './pagination'
export * from './output'
export * from './capabilities'

import type { Rule } from './rule'

/** current Rule IR schema version (mirror this constant in the Rust engine). */
export const CURRENT_IR_VERSION = 1

/**
 * Minimal structural guard for the IR boundary (e.g. validating a rule loaded
 * from disk / shared from the rule market). Not a deep validator — it checks the
 * envelope shape and version so an old engine degrades rather than crashes.
 */
export function isRule(value: unknown): value is Rule {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return (
    v.irVersion === CURRENT_IR_VERSION &&
    typeof v.meta === 'object' &&
    v.meta !== null &&
    Array.isArray(v.steps) &&
    typeof v.entry === 'object'
  )
}
