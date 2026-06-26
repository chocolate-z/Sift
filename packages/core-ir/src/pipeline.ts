// ============================================================================
// @sift/core-ir — value pipeline (§5.1 ③). Ordered, declarative, op-tagged
// union. No closures: a JS post-process is a sandbox script referenced BY ID.
// ============================================================================

import type { UrlReplaceRule } from './request'

export type PipelineOp =
  | { op: 'regex'; pattern: string; replace?: string; flags?: string; group?: number } // 正则清洗
  | { op: 'base64Decode' } // content_filter (item 6)
  | { op: 'urlReplace'; rules: UrlReplaceRule[] } // %% (item 9) on a value
  | { op: 'resolveUrl'; base?: string } // relative → absolute
  | { op: 'trim' }
  | { op: 'join'; sep: string } // list → string
  // PHASE-3 — sandboxed user JS, referenced BY ID, never embedded (§5.2④, §11-4)
  | { op: 'script'; scriptId: string; lang?: 'js' }
