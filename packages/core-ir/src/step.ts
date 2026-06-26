// ============================================================================
// @sift/core-ir — CollectStep: the unit the multi-step scheduler runs. Ties the
// §5.1 layers (request → parse → pipeline) together with the cross-step
// concerns (variable passing, fanout, pagination) as sibling fields.
// ============================================================================

import type { Pagination } from './pagination'
import type { ParseSpec } from './parse'
import type { RequestConfig } from './request'
import type { Fanout, StepInput, VarBinding } from './vars'

export interface CollectStep {
  /** stable, reorder-safe id: 'search' | 'book' | 'chapter' | pick-gen. */
  id: string
  name: string
  request: RequestConfig // ① 请求层
  parse: ParseSpec // ② 解析层 (engine-dispatched)
  /** placeholders this step consumes (resolves ###name### in url/body/headers). */
  inputs?: StepInput[]
  /** variables this step exports to downstream steps. */
  produces?: VarBinding[]
  /** how the driver fans this step out over an upstream list. */
  fanout?: Fanout
  /** pagination for THIS step's list/content (line-B multi_page/next_btn). */
  pagination?: Pagination
  /** missing data ⇒ warn, don't fail the run (line-B item 11). */
  optional?: boolean
  x?: Record<string, unknown>
}
