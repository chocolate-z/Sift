// ============================================================================
// Sift · line-A — repeat-structure detection & column projection
// Covers items 2 (repeat detection, core), 3 (one→whole column),
// 4 (multi-field linkage) and 5 (attribute extraction).
// ============================================================================

import { generateSelector, isSemanticClass, queryAll } from './selector-gen'
import type { AttributeSuggestion, ColumnSelector, RepeatStructure, VNode } from './types'

/** Structural signature: tag + sorted semantic classes. */
export function signatureOf(node: VNode): string {
  const sem = node.classList.filter(isSemanticClass).slice().sort()
  return `${node.tag}|${sem.join('.')}`
}

function itemSelectorOf(node: VNode): string {
  const sem = node.classList.filter(isSemanticClass)
  return sem.length ? `${node.tag}.${sem[0]}` : node.tag
}

/** Relative selector from a list item down to the picked target ('' if same). */
export function pathWithinItem(item: VNode, target: VNode): string {
  if (item === target) return ''
  const segs: string[] = []
  let cur: VNode | null = target
  while (cur && cur !== item) {
    segs.unshift(itemSelectorOf(cur))
    cur = cur.parent
  }
  return segs.join(' ')
}

// ---------------------------------------------------------------------------
// item 2 — repeat-structure detection (the core algorithm)
// ---------------------------------------------------------------------------

export interface DetectOptions {
  /** minimum sibling count to treat a level as a list (default 2) */
  minSiblings?: number
}

/**
 * From a picked target, climb ancestors to find the nearest level whose children
 * include several structurally-similar siblings (the list container). Returns the
 * container, the representative item, the item count, and the path to the target.
 */
export function detectRepeat(target: VNode, options: DetectOptions = {}): RepeatStructure | null {
  const minSiblings = options.minSiblings ?? 2
  let child = target
  let ancestor = target.parent
  while (ancestor) {
    const sig = signatureOf(child)
    const siblings = ancestor.children.filter((c) => signatureOf(c) === sig)
    if (siblings.length >= minSiblings) {
      const itemClass = child.classList.filter(isSemanticClass)[0] ?? null
      return {
        container: ancestor,
        containerSelector: generateSelector(ancestor, rootOf(ancestor)).selector,
        itemTag: child.tag,
        itemClass,
        itemSignature: sig,
        itemSelector: itemSelectorOf(child),
        count: siblings.length,
        items: siblings,
        targetIndex: siblings.indexOf(child),
        pathWithinItem: pathWithinItem(child, target)
      }
    }
    child = ancestor
    ancestor = ancestor.parent
  }
  return null
}

function rootOf(node: VNode): VNode {
  let cur = node
  while (cur.parent) cur = cur.parent
  return cur
}

// ---------------------------------------------------------------------------
// item 3 — from one picked element to the whole column
// ---------------------------------------------------------------------------

export function generateColumnSelector(repeat: RepeatStructure): ColumnSelector {
  const parts = [repeat.containerSelector, repeat.itemSelector, repeat.pathWithinItem].filter(Boolean)
  const columnSelector = parts.join(' ')
  const root = rootOf(repeat.container)
  const targetNode = repeat.pathWithinItem ? queryAll(repeat.items[0]!, repeat.pathWithinItem)[0] : repeat.items[0]
  return {
    columnSelector,
    containerSelector: repeat.containerSelector,
    itemSelector: repeat.itemSelector,
    pathWithinItem: repeat.pathWithinItem,
    matchCount: queryAll(root, columnSelector).length,
    attribute: targetNode ? suggestAttribute(targetNode) : { mode: 'text', attr: null, reason: '' }
  }
}

// ---------------------------------------------------------------------------
// item 4 — multi-field linkage (several picks, one shared list)
// ---------------------------------------------------------------------------

export interface FieldPick {
  name: string
  target: VNode
}

export interface FieldColumns {
  containerSelector: string
  itemSelector: string
  columns: Array<{ name: string; column: ColumnSelector }>
}

export function buildFieldColumns(picks: FieldPick[], options: DetectOptions = {}): FieldColumns | null {
  const columns: Array<{ name: string; column: ColumnSelector }> = []
  let container: VNode | null = null
  let containerSelector: string | null = null
  let itemSelector: string | null = null
  for (const pick of picks) {
    const repeat = detectRepeat(pick.target, options)
    if (!repeat) return null
    if (container === null) {
      container = repeat.container
      containerSelector = repeat.containerSelector
      itemSelector = repeat.itemSelector
    } else if (repeat.container !== container) {
      // §6.4.4: every field column must resolve to the SAME list container.
      // Picks spanning different lists are not a valid multi-field linkage.
      return null
    }
    columns.push({ name: pick.name, column: generateColumnSelector(repeat) })
  }
  if (containerSelector === null || itemSelector === null) return null
  return { containerSelector, itemSelector, columns }
}

// ---------------------------------------------------------------------------
// item 5 — attribute extraction suggestion
// ---------------------------------------------------------------------------

const LAZY_ATTRS = ['data-src', 'data-original', 'data-lazy-src', 'data-lazyload', 'data-actualsrc']

export function suggestAttribute(node: VNode): AttributeSuggestion {
  if (node.tag === 'a' && node.attrs.href !== undefined) {
    return { mode: 'attr', attr: 'href', reason: 'anchor → link target' }
  }
  if (node.tag === 'img') {
    // When a non-empty lazy attribute is present, it holds the REAL url and the
    // (often placeholder) src is decorative — prefer the lazy attr (§6.4.5).
    const lazy = LAZY_ATTRS.find((a) => {
      const v = node.attrs[a]
      return v !== undefined && v !== ''
    })
    if (lazy) {
      return { mode: 'attr', attr: lazy, reason: `lazy-loaded image → real URL in @${lazy}` }
    }
    if (node.attrs.src !== undefined) return { mode: 'attr', attr: 'src', reason: 'image → @src' }
  }
  return { mode: 'text', attr: null, reason: 'extract inner text' }
}
