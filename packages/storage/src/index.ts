// ============================================================================
// @sift/storage — public surface: shared row types + schema version + a typed
// IR-parse helper at the DB↔IR boundary.
// ============================================================================

export * from './types'

import { isRule } from '@sift/core-ir'
import type { Rule } from '@sift/core-ir'
import type { RuleRow } from './types'

/** current schema version — matches the highest migration in ./migrations. */
export const SCHEMA_VERSION = 1

/**
 * Parse a rules-row's serialized IR into a validated `Rule`. Returns null when
 * the stored JSON is not a current-version Rule (forward-compat / corruption).
 */
export function parseRuleIr(row: RuleRow): Rule | null {
  let value: unknown
  try {
    value = JSON.parse(row.ir_json)
  } catch {
    return null
  }
  return isRule(value) ? value : null
}
