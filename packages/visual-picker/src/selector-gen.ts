// ============================================================================
// Sift · line-A — robust selector generation + a tiny VNode CSS engine.
// Covers items 1 (selector generation) and 6 (robustness scoring). The CSS
// engine (queryAll/matches) is also used by repeat-detect and the test suite to
// verify that generated selectors actually match the intended nodes.
// ============================================================================

import type { GeneratedSelector, RobustnessGrade, RobustnessScore, SelectorStrategy, VNode } from './types'

// ---------------------------------------------------------------------------
// Tree helpers
// ---------------------------------------------------------------------------

export function walk(root: VNode, fn: (node: VNode) => void): void {
  fn(root)
  for (const c of root.children) walk(c, fn)
}

export function nthOfType(node: VNode): number {
  const parent = node.parent
  if (!parent) return 1
  let n = 0
  for (const c of parent.children) {
    if (c.tag === node.tag) {
      n++
      if (c === node) return n
    }
  }
  return n
}

// ---------------------------------------------------------------------------
// item 1 — "meaningful" id / "semantic" class heuristics
// ---------------------------------------------------------------------------

/** A single token that looks machine-generated (hash, pure number, long mixed). */
function looksRandom(s: string): boolean {
  if (/^\d+$/.test(s)) return true // pure numeric
  if (/^[0-9a-f]{6,}$/i.test(s) && /\d/.test(s)) return true // hex hash containing a digit
  if (s.length >= 16 && /\d/.test(s) && /[a-z]/i.test(s)) return true // long mixed alnum
  return false
}

export function isRandomId(id: string): boolean {
  if (!id) return true
  if (/^\d+$/.test(id)) return true // pure numeric id
  return id.split(/[-_]/).some(looksRandom)
}

export function isMeaningfulId(id: string | undefined): id is string {
  return !!id && !isRandomId(id)
}

const CSS_IN_JS_PREFIX = /^(css|sc|jsx|emotion|makeStyles|MuiBox)-/i

export function isSemanticClass(cls: string): boolean {
  if (!cls) return false
  if (CSS_IN_JS_PREFIX.test(cls)) return false
  if (/^\d/.test(cls)) return false // starts with a digit
  return !looksRandom(cls)
}

function semanticClasses(node: VNode): string[] {
  return node.classList.filter(isSemanticClass)
}

// ---------------------------------------------------------------------------
// Minimal CSS engine over VNode
// ---------------------------------------------------------------------------

interface AttrPredicate {
  name: string
  op: string | null
  value: string | null
}

interface Compound {
  tag: string | null
  id: string | null
  classes: string[]
  nth: number | null
  attrs: AttrPredicate[]
}

interface Step {
  combinator: ' ' | '>' | null
  compound: Compound
}

function parseCompound(src: string): Compound {
  const compound: Compound = { tag: null, id: null, classes: [], nth: null, attrs: [] }
  let s = src
  const tagM = /^([a-zA-Z][\w-]*|\*)/.exec(s)
  if (tagM) {
    compound.tag = tagM[1] === '*' ? null : (tagM[1] ?? null)
    s = s.slice(tagM[0].length)
  }
  while (s.length) {
    let m: RegExpExecArray | null
    if ((m = /^#([\w-]+)/.exec(s))) compound.id = m[1] ?? null
    else if ((m = /^\.([\w-]+)/.exec(s))) compound.classes.push(m[1] ?? '')
    else if ((m = /^:nth-of-type\((\d+)\)/.exec(s))) compound.nth = Number.parseInt(m[1] ?? '0', 10)
    else if ((m = /^\[([\w-]+)(?:([~^$*|]?=)["']?([^"'\]]*)["']?)?\]/.exec(s))) {
      compound.attrs.push({ name: m[1] ?? '', op: m[2] ?? null, value: m[3] ?? null })
    } else break
    s = s.slice(m[0].length)
  }
  return compound
}

function parseComplex(selector: string): Step[] {
  const tokens = selector.trim().split(/\s+/)
  const steps: Step[] = []
  let combinator: ' ' | '>' = ' '
  let first = true
  for (const tok of tokens) {
    if (tok === '>') {
      combinator = '>'
      continue
    }
    steps.push({ combinator: first ? null : combinator, compound: parseCompound(tok) })
    combinator = ' '
    first = false
  }
  return steps
}

function matchAttr(node: VNode, a: AttrPredicate): boolean {
  const v = node.attrs[a.name]
  if (a.op === null) return v !== undefined
  if (v === undefined || a.value === null) return false
  switch (a.op) {
    case '=':
      return v === a.value
    case '^=':
      return v.startsWith(a.value)
    case '$=':
      return v.endsWith(a.value)
    case '*=':
      return v.includes(a.value)
    default:
      return true
  }
}

function matchCompound(node: VNode, c: Compound): boolean {
  if (c.tag && node.tag !== c.tag) return false
  if (c.id && node.id !== c.id) return false
  for (const cls of c.classes) if (!node.classList.includes(cls)) return false
  if (c.nth !== null && nthOfType(node) !== c.nth) return false
  for (const a of c.attrs) if (!matchAttr(node, a)) return false
  return true
}

function matchesComplex(node: VNode, steps: Step[]): boolean {
  if (steps.length === 0) return false
  let i = steps.length - 1
  if (!matchCompound(node, steps[i]!.compound)) return false
  let current = node.parent
  i--
  while (i >= 0) {
    const step = steps[i]!
    const combinator = steps[i + 1]!.combinator
    if (combinator === '>') {
      if (!current || !matchCompound(current, step.compound)) return false
      current = current.parent
    } else {
      let p: VNode | null = current
      let found: VNode | null = null
      while (p) {
        if (matchCompound(p, step.compound)) {
          found = p
          break
        }
        p = p.parent
      }
      if (!found) return false
      current = found.parent
    }
    i--
  }
  return true
}

function splitComma(selector: string): string[] {
  return selector
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

/** Query every node in `root`'s subtree (root included) matching `selector`. */
export function queryAll(root: VNode, selector: string): VNode[] {
  const complexes = splitComma(selector).map(parseComplex)
  const out: VNode[] = []
  walk(root, (node) => {
    if (complexes.some((steps) => matchesComplex(node, steps)) && !out.includes(node)) {
      out.push(node)
    }
  })
  return out
}

export function matches(node: VNode, selector: string): boolean {
  return splitComma(selector)
    .map(parseComplex)
    .some((steps) => matchesComplex(node, steps))
}

// ---------------------------------------------------------------------------
// item 1 — selector generation (priority: id > semantic class > nth-of-type)
// ---------------------------------------------------------------------------

interface LocalToken {
  token: string
  strategy: SelectorStrategy
}

function baseToken(node: VNode): LocalToken {
  if (isMeaningfulId(node.id)) return { token: `#${node.id}`, strategy: 'id' }
  const sem = semanticClasses(node)
  if (sem.length) return { token: `${node.tag}.${sem[0]}`, strategy: 'class' }
  return { token: node.tag, strategy: 'tag' }
}

function localToken(node: VNode): LocalToken {
  const base = baseToken(node)
  if (base.strategy === 'id') return base
  // disambiguate among siblings that would yield the same base token
  const parent = node.parent
  if (parent) {
    const twins = parent.children.filter((c) => baseToken(c).token === base.token)
    if (twins.length > 1) {
      return { token: `${base.token}:nth-of-type(${nthOfType(node)})`, strategy: 'nth-of-type' }
    }
  }
  return base
}

/**
 * Generate a stable, unique CSS selector for `node` within `root`.
 * Walks upward, stopping as soon as the selector is unique (or anchored on a
 * meaningful id). Random ids / pure-numeric ids are skipped (item 1).
 */
export function generateSelector(node: VNode, root: VNode): GeneratedSelector {
  // fast path: a meaningful, unique id
  if (isMeaningfulId(node.id) && queryAll(root, `#${node.id}`).length === 1) {
    return finalize([`#${node.id}`], ['id'])
  }

  const segs: string[] = []
  const strategies: SelectorStrategy[] = []
  let cur: VNode | null = node
  while (cur && cur !== root.parent) {
    const { token, strategy } = localToken(cur)
    segs.unshift(token)
    strategies.unshift(strategy)
    const candidate = segs.join(' > ')
    const hits = queryAll(root, candidate)
    if (hits.length === 1 && hits[0] === node) return finalize(segs, strategies)
    if (strategy === 'id') break // id anchors; no need to climb further
    cur = cur.parent
  }
  return finalize(segs, strategies)
}

function finalize(segs: string[], strategies: SelectorStrategy[]): GeneratedSelector {
  const { score, grade, reasons } = scoreStrategies(strategies)
  return { selector: segs.join(' > '), strategies, score, grade, reasons }
}

// ---------------------------------------------------------------------------
// item 6 — robustness scoring
// ---------------------------------------------------------------------------

export function scoreStrategies(strategies: SelectorStrategy[]): RobustnessScore {
  let score = 100
  const reasons: string[] = []
  // Penalties are calibrated to §6.4.6: id / semantic class → high, nth-of-type
  // → low. A single positional segment must land in the 'low' band, because a
  // positional selector breaks as soon as the list order changes.
  for (const s of strategies) {
    switch (s) {
      case 'id':
        reasons.push('anchored on a meaningful id (very stable)')
        break
      case 'class':
        score -= 10
        reasons.push('semantic class (stable)')
        break
      case 'tag':
        score -= 30
        reasons.push('bare tag (weak)')
        break
      case 'nth-of-type':
        score -= 55
        reasons.push('positional nth-of-type (fragile — breaks if order changes)')
        break
    }
  }
  score = Math.max(0, Math.min(100, score))
  const grade: RobustnessGrade = score >= 80 ? 'high' : score >= 50 ? 'medium' : 'low'
  return { score, grade, reasons }
}

export function scoreSelectorOf(generated: GeneratedSelector): RobustnessScore {
  return scoreStrategies(generated.strategies)
}
