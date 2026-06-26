// ============================================================================
// Sift · line-B — jQuery positional pseudo-class translation (items 7 & 8)
// DOM-library-independent core. The translation produces a structured op-chain;
// applying it to real elements is delegated through a tiny QueryAdapter so the
// algorithm can be verified without any HTML parser (§6.3 note).
// ============================================================================

import type { PositionalOp, PseudoSegment, TranslatedSelector } from './types'

// ---------------------------------------------------------------------------
// item 8 — comma-aware selector-list split (fallback alternatives).
// Splits only on top-level commas: commas inside [...], (...) or quotes are kept.
// ---------------------------------------------------------------------------

export function splitSelectorList(selector: string): string[] {
  const out: string[] = []
  let bracket = 0
  let paren = 0
  let quote: string | null = null
  let buf = ''
  for (let i = 0; i < selector.length; i++) {
    const ch = selector.charAt(i)
    if (quote) {
      buf += ch
      if (ch === quote && selector.charAt(i - 1) !== '\\') quote = null
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      buf += ch
      continue
    }
    if (ch === '[') bracket++
    else if (ch === ']') bracket = Math.max(0, bracket - 1)
    else if (ch === '(') paren++
    else if (ch === ')') paren = Math.max(0, paren - 1)
    if (ch === ',' && bracket === 0 && paren === 0) {
      const t = buf.trim()
      if (t) out.push(t)
      buf = ''
      continue
    }
    buf += ch
  }
  const last = buf.trim()
  if (last) out.push(last)
  return out
}

/**
 * item 8 — try fallback alternatives in priority order, returning the first hit.
 * `match` returns a truthy value when a selector resolves; null/undefined = miss.
 */
export function resolveFallback<T>(
  selectors: string[],
  match: (selector: string) => T | null | undefined
): { selector: string; index: number; value: T } | null {
  for (let i = 0; i < selectors.length; i++) {
    const sel = selectors[i]
    if (sel === undefined) continue
    const value = match(sel)
    if (value !== null && value !== undefined) return { selector: sel, index: i, value }
  }
  return null
}

// ---------------------------------------------------------------------------
// item 7 — jQuery positional pseudo translation
//   :gt(N) -> slice(N+1)      (elements after index N)
//   :lt(N) -> slice(0, N)     (elements before index N)
//   :eq(N) -> nth at index N
// ---------------------------------------------------------------------------

const PSEUDO_GLOBAL_RE = /:(gt|lt|eq)\(\s*(-?\d+)\s*\)/g

export function hasJqueryPseudo(selector: string): boolean {
  return /:(gt|lt|eq)\(\s*-?\d+\s*\)/.test(selector)
}

function makeOp(kind: 'gt' | 'lt' | 'eq', n: number): PositionalOp {
  if (kind === 'gt') return { type: 'gt', n, slice: { start: n + 1, end: null } }
  if (kind === 'lt') return { type: 'lt', n, slice: { start: 0, end: n } }
  return { type: 'eq', n, index: n }
}

function describeOp(op: PositionalOp): string {
  switch (op.type) {
    case 'gt':
      return `:gt(${op.n}) → slice(${op.slice.start})`
    case 'lt':
      return `:lt(${op.n}) → slice(0, ${op.slice.end})`
    case 'eq':
      return `:eq(${op.n}) → index ${op.index}`
  }
}

function stripLeadingCombinator(s: string): string {
  return s.replace(/^\s*>\s*/, '').trim()
}

/**
 * Translate a selector that may contain jQuery positional pseudos into a chain
 * of (standard CSS chunk, positional op) segments plus a trailing `rest`.
 * Example: `.a .b ul li:gt(8) a`
 *   segments: [{ selector: '.a .b ul li', op: gt(8) }]
 *   rest:     'a'
 */
export function translatePseudo(selector: string): TranslatedSelector {
  PSEUDO_GLOBAL_RE.lastIndex = 0
  const segments: PseudoSegment[] = []
  const descriptions: string[] = []
  let lastIndex = 0
  let hadPseudo = false
  let m: RegExpExecArray | null
  while ((m = PSEUDO_GLOBAL_RE.exec(selector)) !== null) {
    hadPseudo = true
    const chunk = selector.slice(lastIndex, m.index)
    const kind = m[1] as 'gt' | 'lt' | 'eq'
    const n = Number.parseInt(m[2] ?? '0', 10)
    const op = makeOp(kind, n)
    segments.push({ selector: stripLeadingCombinator(chunk), op })
    descriptions.push(describeOp(op))
    lastIndex = m.index + m[0].length
  }
  if (!hadPseudo) {
    return {
      original: selector,
      segments: [],
      rest: selector,
      hadPseudo: false,
      description: ''
    }
  }
  const rest = stripLeadingCombinator(selector.slice(lastIndex))
  return {
    original: selector,
    segments,
    rest,
    hadPseudo: true,
    description: descriptions.join('; ')
  }
}

// ---------------------------------------------------------------------------
// Apply a positional op to an array — the verifiable core (DOM-independent).
// ---------------------------------------------------------------------------

export function applyPositionalOp<T>(items: T[], op: PositionalOp): T[] {
  switch (op.type) {
    case 'gt':
      return items.slice(op.slice.start)
    case 'lt':
      return items.slice(op.slice.start, op.slice.end)
    case 'eq': {
      const idx = op.index < 0 ? items.length + op.index : op.index
      const el = items[idx]
      return el === undefined ? [] : [el]
    }
  }
}

// ---------------------------------------------------------------------------
// Generic applier — wires the op-chain to any DOM via a QueryAdapter.
// jQuery positional pseudos operate on the *global* matched set at each stage,
// matching jQuery semantics, then descend.
// ---------------------------------------------------------------------------

export interface QueryAdapter<E> {
  /** query the document root by a standard CSS selector */
  root: (selector: string) => E[]
  /** query inside a single element by a standard CSS selector */
  within: (el: E, selector: string) => E[]
}

export function runTranslated<E>(t: TranslatedSelector, q: QueryAdapter<E>): E[] {
  if (!t.hadPseudo) return q.root(t.original)
  let current: E[] = []
  t.segments.forEach((seg, i) => {
    if (i === 0) {
      current = seg.selector ? q.root(seg.selector) : current
    } else if (seg.selector) {
      current = current.flatMap((el) => q.within(el, seg.selector))
    }
    if (seg.op) current = applyPositionalOp(current, seg.op)
  })
  if (t.rest) current = current.flatMap((el) => q.within(el, t.rest))
  return current
}
