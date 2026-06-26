// ============================================================================
// Sift · @sift/source-parser — public API
// ============================================================================

import { parse as parseHtml } from 'node-html-parser'
import type { HTMLElement } from 'node-html-parser'
import { runTranslated, translatePseudo, type QueryAdapter } from './pseudo'

export * from './types'
export * from './decoders'
export * from './pseudo'
export * from './parser'

/**
 * Integration helper validating the chosen HTML parser (node-html-parser): run a
 * selector that may contain jQuery positional pseudos against an HTML fragment.
 * Standard CSS is handled by node-html-parser; :gt/:lt/:eq by the translation
 * layer. Used by the verification suite to prove the end-to-end path.
 */
export function htmlQuerySelectorAll(html: string, selector: string): HTMLElement[] {
  const root = parseHtml(html)
  const adapter: QueryAdapter<HTMLElement> = {
    root: (sel) => root.querySelectorAll(sel),
    within: (el, sel) => el.querySelectorAll(sel)
  }
  return runTranslated(translatePseudo(selector), adapter)
}
