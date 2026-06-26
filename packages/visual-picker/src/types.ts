// ============================================================================
// Sift · line-A (visual point-and-pick) — type definitions
// The picker operates on a framework-agnostic VNode tree (plain objects with
// parent references), so the algorithms are verifiable without a real browser
// (§6.4). The same VNode contract can be produced from a real DOM, an HTML
// snapshot, or node-html-parser at integration time.
// ============================================================================

export interface VNode {
  /** lowercase tag name, e.g. 'div', 'a', 'img' */
  tag: string
  id?: string
  classList: string[]
  /** attributes, including href / src / data-src / etc. */
  attrs: Record<string, string>
  children: VNode[]
  parent: VNode | null
  /** optional text content (leaf nodes) */
  text?: string
}

export type SelectorStrategy = 'id' | 'class' | 'nth-of-type' | 'tag'

export interface GeneratedSelector {
  selector: string
  /** strategy used at each path segment, root → leaf */
  strategies: SelectorStrategy[]
  /** robustness score 0..100 */
  score: number
  grade: RobustnessGrade
  reasons: string[]
}

export type RobustnessGrade = 'high' | 'medium' | 'low'

export interface RobustnessScore {
  score: number
  grade: RobustnessGrade
  reasons: string[]
}

// ---------------------------------------------------------------------------
// Repeat-structure detection (core, item 2)
// ---------------------------------------------------------------------------

export interface RepeatStructure {
  /** the inferred list container */
  container: VNode
  /** a stable selector for the container */
  containerSelector: string
  /** the representative list-item tag */
  itemTag: string
  /** the list-item semantic class, if any */
  itemClass: string | null
  /** signature shared by all items (tag + sorted semantic classes) */
  itemSignature: string
  /** a selector matching a single item, e.g. 'div.product-card' */
  itemSelector: string
  /** number of sibling items detected */
  count: number
  /** the detected item nodes */
  items: VNode[]
  /** 0-based index of the picked item within the list */
  targetIndex: number
  /** relative selector from an item down to the picked target ('' if target is the item) */
  pathWithinItem: string
}

// ---------------------------------------------------------------------------
// "From one to whole column" (item 3) + multi-field linkage (item 4)
// ---------------------------------------------------------------------------

export interface ColumnSelector {
  /** selector matching the same field across every list item */
  columnSelector: string
  containerSelector: string
  itemSelector: string
  pathWithinItem: string
  /** how many elements the column selector matches */
  matchCount: number
  attribute: AttributeSuggestion
}

// ---------------------------------------------------------------------------
// Attribute extraction (item 5)
// ---------------------------------------------------------------------------

export interface AttributeSuggestion {
  /** 'text' to take inner text, 'attr' to take a named attribute */
  mode: 'text' | 'attr'
  /** attribute name when mode === 'attr', e.g. 'href' / 'data-src' */
  attr: string | null
  reason: string
}
