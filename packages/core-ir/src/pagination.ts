// ============================================================================
// @sift/core-ir — pagination (line-B multi_page / next_btn / next_val).
// Discriminated union, additive. `combine` resolves the catalog-pages-add-rows
// vs chapter-pages-concat-content ambiguity.
// ============================================================================

import type { SelectorExpr } from './parse'

export type Pagination =
  | { kind: 'none' }
  | {
      kind: 'nextButton'
      next: SelectorExpr
      /** 下一页元素文本含此串 ⇒ 已到底,停止(stop-if-match)。 */
      stopText?: string
      /** 仅当下一页元素文本含此串才继续翻(continue-if-match);line-B next_val。 */
      requireText?: string
      maxPages?: number
      combine?: PageCombine
    }
  | {
      kind: 'pageParam'
      param: string
      start?: number
      step?: number
      maxPages?: number
      combine?: PageCombine
    }
  | { kind: 'cursor'; field: string; param: string; maxPages?: number } // api cursor (phase-2)

/** appendRows = more list items (catalog pages); appendContent = concat one row's text. */
export type PageCombine = 'appendRows' | 'appendContent'
