// ============================================================================
// @sift/core-ir — request layer (§5.1 ①). MVP fields are concrete; phase-2
// facets (proxy / render / sniff) are optional and engine-ignored when absent.
// ============================================================================

import type { SelectorExpr } from './parse'
import type { PlaceholderDep } from './vars'

export interface RequestConfig {
  url: UrlSource
  method?: 'GET' | 'POST' // default GET
  headers?: Record<string, string> // templated
  body?: RequestBody // POST payload (templated)
  /** Cookie/credential — ENCRYPTED REF, never plaintext (§2 凭据原则, §5.2④). */
  credentialRef?: string
  userAgent?: string
  /** response decode, e.g. 'gb2312' (line-B item 3, UrlDirectives.encoding). */
  encoding?: string
  /** follow HTTP 30x (line-B {{302}} directive, UrlDirectives.followRedirect). */
  followRedirect?: boolean
  timeoutMs?: number // book-source time_out
  retry?: RetryPolicy
  rateLimit?: RateLimit // default-on per §4 MVP
  /** url_replace_rules applied to the request URL (line-B item 9). */
  urlReplaceRules?: UrlReplaceRule[]
  // ---- PHASE-2 facets — engine ignores when absent ----
  proxyRef?: string // proxy profile id (HTTP/SOCKS5)
  render?: RenderConfig // dynamic render (webview/chromium)
  sniff?: SniffSpec // 接口嗅探 (XHR/Fetch)
  x?: Record<string, unknown>
}

export type UrlSource =
  /** templated URL with ###placeholder### bound from vars (search / line-A seed). */
  | { kind: 'template'; template: string; placeholders: PlaceholderDep[] }
  /** URL extracted from a field/selector of the prior step's response (book_menu). */
  | { kind: 'extracted'; from: SelectorExpr }
  /** fixed URL (line-A picked page / static source). */
  | { kind: 'static'; url: string }

/** url_replace_rules entry: %%-split (line-B item 9). */
export interface UrlReplaceRule {
  from: string
  to: string
}

export type RequestBody =
  | { kind: 'form'; fields: Record<string, string> }
  | { kind: 'json'; json: string } // serialized; templated
  | { kind: 'raw'; contentType: string; data: string }

export interface RetryPolicy {
  max: number
  backoffMs?: number
}

export interface RateLimit {
  concurrency?: number
  perSecond?: number
  minIntervalMs?: number
}

// ---- phase-2 stubs (only the discriminator shape matters now) ----
export interface RenderConfig {
  engine: 'webview' | 'chromium'
  waitForSelector?: string
  waitMs?: number
}

export interface SniffSpec {
  urlPattern?: string
  responseType?: 'xhr' | 'fetch'
}
