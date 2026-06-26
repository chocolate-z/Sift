// ============================================================================
// Sift · line-B — value decoders & normalizers
// Pure, DOM- and network-independent helpers. Portable (atob/TextDecoder/btoa),
// so the same code runs in Node (tests), the Tauri WebView, and the browser.
// ============================================================================

import type { DecodedFilter, UrlDirectives, UrlReplaceRule } from './types'

const KNOWN_CHARSETS = new Set([
  'gb2312',
  'gbk',
  'gb18030',
  'big5',
  'utf-8',
  'utf8',
  'iso-8859-1',
  'shift_jis',
  'euc-jp',
  'euc-kr'
])

// ---------------------------------------------------------------------------
// item 2 — JSON path normalization: strip every `key$$` token.
//   'key$$data.key$$search_list' -> 'data.search_list'
//   'key$$id'                    -> 'id'
// ---------------------------------------------------------------------------

export function normalizeJsonPath(expr: string): string {
  return expr.split('key$$').join('').trim()
}

export function isJsonPathExpr(expr: string): boolean {
  return expr.includes('key$$')
}

/** normalize when it is a json path, otherwise return the value unchanged */
export function normalizeOrRaw(expr: string): string {
  return isJsonPathExpr(expr) ? normalizeJsonPath(expr) : expr
}

// ---------------------------------------------------------------------------
// item 4 — placeholder extraction: `###name###`
// ---------------------------------------------------------------------------

const PLACEHOLDER_RE = /###([A-Za-z0-9_]+)###/g

export function extractPlaceholders(input: string): string[] {
  const out: string[] = []
  for (const m of input.matchAll(PLACEHOLDER_RE)) {
    const name = m[1]
    if (name && !out.includes(name)) out.push(name)
  }
  return out
}

// ---------------------------------------------------------------------------
// item 3 — URL directive stripping: {{302}}{{gb2312}}http://...
// ---------------------------------------------------------------------------

const LEADING_DIRECTIVE_RE = /^\s*\{\{([^}]*)\}\}/

export function parseUrlDirectives(raw: string): UrlDirectives {
  let rest = raw
  const instructions: string[] = []
  let m: RegExpExecArray | null
  while ((m = LEADING_DIRECTIVE_RE.exec(rest)) !== null) {
    instructions.push((m[1] ?? '').trim())
    rest = rest.slice(m[0].length)
  }
  const url = rest.trim()
  let followRedirect = false
  let encoding: string | null = null
  for (const ins of instructions) {
    const low = ins.toLowerCase()
    if (/^30\d$/.test(low)) followRedirect = true
    else if (KNOWN_CHARSETS.has(low)) encoding = low
  }
  return { raw, instructions, followRedirect, encoding, url }
}

// ---------------------------------------------------------------------------
// item 9 — url_replace_rules: 'http://m%%http://www' split on '%%'
// ---------------------------------------------------------------------------

export function parseUrlReplaceRules(rules: unknown): UrlReplaceRule[] {
  // Real-world sources express this either as an array (["from%%to", ...]) or as
  // a single string with multiple rules joined by '&&' ("a%%b&&c%%d"). Accept
  // both, ignore anything else, and never throw on malformed input.
  const raw0 =
    typeof rules === 'string'
      ? [rules]
      : Array.isArray(rules)
        ? rules.filter((r): r is string => typeof r === 'string')
        : []
  return raw0
    .flatMap((s) => s.split('&&'))
    .map((s) => s.trim())
    .filter(Boolean)
    .map((raw) => {
      const idx = raw.indexOf('%%')
      if (idx === -1) return { raw, from: raw, to: '' }
      return { raw, from: raw.slice(0, idx), to: raw.slice(idx + 2) }
    })
}

export function applyUrlReplace(url: string, rules: UrlReplaceRule[]): string {
  let out = url
  for (const r of rules) {
    if (r.from) out = out.split(r.from).join(r.to)
  }
  return out
}

// ---------------------------------------------------------------------------
// item 6 — content_filter Base64 detect + decode
// A string is treated as decoded base64 only if it (a) matches the base64
// charset, (b) round-trips canonically, and (c) decodes to valid UTF-8.
// This rejects plain words like 'body' that merely look base64-ish.
// ---------------------------------------------------------------------------

const BASE64_CHARSET_RE = /^[A-Za-z0-9+/]+={0,2}$/

export function isLikelyBase64(s: string): boolean {
  return s.length >= 8 && s.length % 4 === 0 && BASE64_CHARSET_RE.test(s)
}

export function decodeBase64Utf8(s: string): string | null {
  try {
    const binary = atob(s)
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0))
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    // canonical round-trip guard
    let reBinary = ''
    for (const b of bytes) reBinary += String.fromCharCode(b)
    if (btoa(reBinary) !== s) return null
    return decoded
  } catch {
    return null
  }
}

export function decodeContentFilter(entries: unknown): DecodedFilter[] {
  if (!Array.isArray(entries)) return []
  return entries
    .filter((raw): raw is string => typeof raw === 'string')
    .map((raw): DecodedFilter => {
      if (isLikelyBase64(raw)) {
        const decoded = decodeBase64Utf8(raw)
        if (decoded !== null) return { raw, decoded, isBase64: true, status: 'decoded' }
      }
      return { raw, decoded: null, isBase64: false, status: 'kept' }
    })
}
