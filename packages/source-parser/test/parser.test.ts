import { describe, expect, it } from 'vitest'
import {
  applyPositionalOp,
  collectUnknownFields,
  decodeContentFilter,
  detectSourceType,
  extractPlaceholders,
  htmlQuerySelectorAll,
  isLikelyBase64,
  normalizeJsonPath,
  parseBookSource,
  parseSearchResult,
  parseUrlDirectives,
  parseUrlReplaceRules,
  applyUrlReplace,
  resolveFallback,
  splitSelectorList,
  translatePseudo
} from '../src/index'
import {
  brokenMissing,
  jiugangbi,
  makeChapterListHtml,
  makeTwoListHtml,
  partialWarn,
  qimao,
  qimaoNoType,
  withUnknownFields
} from './fixtures'

// ---------------------------------------------------------------------------
// item 1 — source-type identification
// ---------------------------------------------------------------------------
describe('item 1 · source-type detection', () => {
  it('source_type="2" → API source', () => {
    const d = detectSourceType(qimao)
    expect(d.type).toBe('api')
    expect(d.confidence).toBe(1)
    expect(d.reasons[0]).toMatch(/source_type/)
  })

  it('no source_type but CSS selectors → web source', () => {
    const d = detectSourceType(jiugangbi)
    expect(d.type).toBe('web')
    // pin that the CSS heuristic (not the catch-all default) drove the result:
    // a broken looksLikeCss would give cssCount 0 → confidence 0 and fail here
    expect(d.confidence).toBeGreaterThan(0)
    expect(d.reasons[0]).toMatch(/CSS selector/)
  })

  it('a source whose only rule fields use key$$ must NOT be detected as web', () => {
    expect(detectSourceType(qimaoNoType).type).not.toBe('web')
  })

  it('no source_type but key$$ syntax → API source', () => {
    const d = detectSourceType(qimaoNoType)
    expect(d.type).toBe('api')
    expect(d.reasons[0]).toMatch(/key\$\$/)
  })
})

// ---------------------------------------------------------------------------
// item 2 — JSON path normalization
// ---------------------------------------------------------------------------
describe('item 2 · JSON path normalization', () => {
  it('strips every key$$ token', () => {
    expect(normalizeJsonPath('key$$data.key$$search_list')).toBe('data.search_list')
    expect(normalizeJsonPath('key$$id')).toBe('id')
    expect(normalizeJsonPath('key$$data.key$$chapters')).toBe('data.chapters')
  })

  it('flows through search_result parsing', () => {
    const sr = parseSearchResult(qimao.search_result, 'api')
    expect(sr?.listSelector).toBe('data.search_list')
    expect(sr?.fields.name?.jsonPath).toBe('title')
    expect(sr?.fields.author?.jsonPath).toBe('author')
  })
})

// ---------------------------------------------------------------------------
// item 3 — prefix directive stripping
// ---------------------------------------------------------------------------
describe('item 3 · URL directive stripping', () => {
  it('separates {{302}}{{gb2312}} from the pure URL', () => {
    const d = parseUrlDirectives(jiugangbi.search_url!)
    expect(d.instructions).toEqual(['302', 'gb2312'])
    expect(d.followRedirect).toBe(true)
    expect(d.encoding).toBe('gb2312')
    expect(d.url.startsWith('http://www.jiugangbi.com/modules/article/search.php')).toBe(true)
    expect(d.url).not.toContain('{{')
  })

  it('no directives → clean passthrough', () => {
    const d = parseUrlDirectives(qimao.search_url!)
    expect(d.instructions).toEqual([])
    expect(d.followRedirect).toBe(false)
    expect(d.encoding).toBeNull()
    expect(d.url).toBe(qimao.search_url)
  })
})

// ---------------------------------------------------------------------------
// item 4 — placeholder extraction
// ---------------------------------------------------------------------------
describe('item 4 · placeholder extraction', () => {
  it('extracts ###keyword###', () => {
    expect(extractPlaceholders(qimao.search_url!)).toEqual(['keyword'])
  })

  it('extracts ###book_id### and ###item_id### (deduped, ordered)', () => {
    expect(extractPlaceholders(qimao.item_url!)).toEqual(['book_id', 'item_id'])
    expect(extractPlaceholders(qimao.search_result!.url!)).toEqual(['book_id'])
  })

  it('deduplicates a repeated placeholder', () => {
    expect(extractPlaceholders('###k###/###k###')).toEqual(['k'])
  })
})

// ---------------------------------------------------------------------------
// item 5 — multi-step collection chain
// ---------------------------------------------------------------------------
describe('item 5 · multi-step chain (variable passing)', () => {
  it('builds search→book→chapter for the API source', () => {
    const { steps } = parseBookSource(qimao)
    expect(steps.map((s) => s.id)).toEqual(['search', 'book', 'chapter'])
    expect(steps.map((s) => s.parseMode)).toEqual(['json', 'json', 'css'])

    const [search, book, chapter] = steps
    // search consumes keyword (from input), produces book_id
    expect(search!.placeholderDeps).toEqual([{ name: 'keyword', satisfiedBy: 'input' }])
    expect(search!.produces).toContain('book_id')
    // book consumes book_id from step 0, produces item_id
    expect(book!.placeholderDeps).toEqual([{ name: 'book_id', satisfiedBy: 0 }])
    expect(book!.produces).toContain('item_id')
    expect(book!.rules.book_menu).toBe('data.chapters')
    // chapter consumes both vars, resolved to their producing steps
    expect(chapter!.placeholderDeps).toEqual([
      { name: 'book_id', satisfiedBy: 0 },
      { name: 'item_id', satisfiedBy: 1 }
    ])
  })

  it('builds a selector-driven chain for the web source', () => {
    const { steps } = parseBookSource(jiugangbi)
    expect(steps.map((s) => s.id)).toEqual(['search', 'book', 'chapter'])
    expect(steps.every((s) => s.parseMode === 'css')).toBe(true)
    // search step carries the directive metadata
    expect(steps[0]!.directives?.followRedirect).toBe(true)
    expect(steps[0]!.directives?.encoding).toBe('gb2312')
    // book + chapter URLs are extracted from the previous page via selectors
    expect(steps[1]!.urlSource).toBe('extracted')
    expect(steps[2]!.urlSource).toBe('extracted')
    expect(steps[2]!.notes.join(' ')).toMatch(/multi_page/)
  })
})

// ---------------------------------------------------------------------------
// item 6 — content_filter Base64 decode
// ---------------------------------------------------------------------------
describe('item 6 · content_filter Base64 decode', () => {
  it('decodes real base64 filters to readable text', () => {
    const decoded = decodeContentFilter(jiugangbi.content_filter)
    expect(decoded).toHaveLength(3)
    expect(decoded.every((d) => d.status === 'decoded')).toBe(true)
    // pin every decoded value — a decoder corrupting only the first would slip past otherwise
    expect(decoded[0]!.decoded).toBe('www.jiugangbi.com提供的.+页\\)')
    expect(decoded[1]!.decoded).toBe('--.+本章未完，请点击下一页继续阅读.')
    expect(decoded[2]!.decoded).toBe('【请收藏.+的小说】')
  })

  it('keeps non-base64 input as-is and flags it', () => {
    const [a, b] = decodeContentFilter(['.+本章未完', 'body'])
    expect(a!.status).toBe('kept')
    expect(a!.isBase64).toBe(false)
    // 'body' is rejected by the length<8 guard (it never reaches the decode path)
    expect(b!.status).toBe('kept')
    expect(isLikelyBase64('body')).toBe(false)
  })

  it('rejects base64-shaped strings that do not round-trip canonically', () => {
    // 'YWJjZB==' passes the charset + length guards and decodes to valid UTF-8
    // ('abcd'), but re-encodes to 'YWJjZA==' — non-canonical, so the round-trip
    // guard (not the length/utf-8 guards) is what keeps it.
    expect(isLikelyBase64('YWJjZB==')).toBe(true)
    const [nc] = decodeContentFilter(['YWJjZB=='])
    expect(nc!.status).toBe('kept')
    expect(nc!.isBase64).toBe(false)
  })

  it('tolerates a non-array / non-string content_filter without throwing', () => {
    // real-world inputs are loosely typed (decodeContentFilter takes unknown)
    expect(decodeContentFilter('not-an-array')).toEqual([])
    expect(decodeContentFilter([123, null]).length).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// item 7 — jQuery pseudo translation
// ---------------------------------------------------------------------------
describe('item 7 · jQuery positional pseudo translation', () => {
  it(':gt(N) → slice(N+1), :lt(N) → slice(0,N), :eq(N) → index N', () => {
    const fifteen = Array.from({ length: 15 }, (_, i) => i)

    const gt = translatePseudo('ul li:gt(8)')
    expect(gt.segments[0]!.op).toEqual({ type: 'gt', n: 8, slice: { start: 9, end: null } })
    expect(applyPositionalOp(fifteen, gt.segments[0]!.op!)).toEqual([9, 10, 11, 12, 13, 14])

    const lt = translatePseudo('ul li:lt(3)')
    expect(applyPositionalOp(fifteen, lt.segments[0]!.op!)).toEqual([0, 1, 2])

    const eq = translatePseudo('ul li:eq(6)')
    expect(applyPositionalOp(fifteen, eq.segments[0]!.op!)).toEqual([6])
  })

  it('splits a descendant selector around the pseudo', () => {
    const t = translatePseudo('.indexyfw_listbox .listchapter ul li:gt(8) a')
    expect(t.segments[0]!.selector).toBe('.indexyfw_listbox .listchapter ul li')
    expect(t.rest).toBe('a')
    expect(t.description).toContain('slice(9)')

    const t2 = translatePseudo('.chapter_content > a:eq(1)')
    expect(t2.segments[0]!.selector).toBe('.chapter_content > a')
    expect(t2.rest).toBe('')
  })

  it('end-to-end: 15-element list :gt(8) returns the last 6 (via node-html-parser)', () => {
    const html = makeChapterListHtml(15)
    const hits = htmlQuerySelectorAll(html, '.indexyfw_listbox .listchapter ul li:gt(8) a')
    expect(hits).toHaveLength(6)
    expect(hits.map((a) => a.text)).toEqual(['第10章', '第11章', '第12章', '第13章', '第14章', '第15章'])
  })

  it('plain selectors are unaffected by the translation layer', () => {
    const hits = htmlQuerySelectorAll(makeChapterListHtml(3), 'ul li a')
    expect(hits).toHaveLength(3)
  })

  it('positional ops apply to the GLOBAL matched set across parents (jQuery semantics)', () => {
    // two <ul> of 3 <li> → matched set [A1,A2,A3,B1,B2,B3]; gt(1) = slice(2)
    // global  → [A3,B1,B2,B3] (4 hits); a naive per-parent impl would give [A3,B3] (2)
    const html = makeTwoListHtml(3, 3)
    const hits = htmlQuerySelectorAll(html, '.wrap ul li:gt(1) a')
    expect(hits.map((a) => a.text)).toEqual(['A3', 'B1', 'B2', 'B3'])
  })
})

// ---------------------------------------------------------------------------
// item 8 — multi-selector fallback
// ---------------------------------------------------------------------------
describe('item 8 · multi-selector fallback', () => {
  it('splits comma-separated alternatives, preserving bracket/quote contents', () => {
    const alts = splitSelectorList(jiugangbi.search_result!.name!)
    expect(alts).toHaveLength(2)
    expect(alts[0]).toBe("p.p1 a[href^='http://www.jiugangbi.com/']")
    expect(alts[1]).toContain('.novelname')
  })

  it('does NOT split on commas inside [...], (...) or quotes', () => {
    // a naive String.split(',') would yield 5 parts; the bracket/quote-aware
    // splitter must yield exactly 3 top-level alternatives
    expect(splitSelectorList("a[data-x='1,2'], .b:not(.c, .d), .e")).toEqual([
      "a[data-x='1,2']",
      '.b:not(.c, .d)',
      '.e'
    ])
  })

  it('search_result fields expose fallbacks for the web source', () => {
    const sr = parseSearchResult(jiugangbi.search_result, 'web')
    expect(sr?.listSelector).toBe('.toplist_list .list_ul li')
    expect(sr?.listFallbacks).toEqual(['.indexyfw_novel'])
    expect(sr?.fields.name?.fallbacks).toHaveLength(1)
  })

  it('resolveFallback tries in order until a hit', () => {
    const order: string[] = []
    const res = resolveFallback(['.a', '.b', '.c'], (sel) => {
      order.push(sel)
      return sel === '.b' ? 'HIT' : null
    })
    expect(res).toEqual({ selector: '.b', index: 1, value: 'HIT' })
    expect(order).toEqual(['.a', '.b']) // stops at first hit
  })
})

// ---------------------------------------------------------------------------
// item 9 — url_replace_rules
// ---------------------------------------------------------------------------
describe('item 9 · url_replace_rules', () => {
  it('parses "from%%to" into a replacement rule', () => {
    const rules = parseUrlReplaceRules(jiugangbi.search_result!.url_replace_rules)
    expect(rules).toEqual([{ raw: 'http://m%%http://www', from: 'http://m', to: 'http://www' }])
  })

  it('applies the replacement', () => {
    const rules = parseUrlReplaceRules(['http://m%%http://www'])
    expect(applyUrlReplace('http://m.jiugangbi.com/x', rules)).toBe('http://www.jiugangbi.com/x')
  })

  it('handles no-match, no-%% and undefined inputs', () => {
    const rules = parseUrlReplaceRules(['http://m%%http://www'])
    // URL without the `from` substring → unchanged passthrough
    expect(applyUrlReplace('http://example.com/x', rules)).toBe('http://example.com/x')
    // a rule without '%%' → from = whole string, to = ''
    expect(parseUrlReplaceRules(['nofrom'])).toEqual([{ raw: 'nofrom', from: 'nofrom', to: '' }])
    // undefined → empty list
    expect(parseUrlReplaceRules(undefined)).toEqual([])
  })

  it('accepts the real-world string form and &&-joined multi-rule form', () => {
    // real sources store this as a string, sometimes with several rules via '&&'
    expect(parseUrlReplaceRules('book%%list')).toEqual([{ raw: 'book%%list', from: 'book', to: 'list' }])
    expect(parseUrlReplaceRules('m.feibzw%%www.feibzw&&book-%%Html/')).toEqual([
      { raw: 'm.feibzw%%www.feibzw', from: 'm.feibzw', to: 'www.feibzw' },
      { raw: 'book-%%Html/', from: 'book-', to: 'Html/' }
    ])
    // garbage (object/number) → empty list, never throws
    expect(parseUrlReplaceRules({ a: 1 })).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// item 10 — unknown-field tolerance
// ---------------------------------------------------------------------------
describe('item 10 · unknown-field tolerance', () => {
  it('collects unknown keys without throwing', () => {
    const unknown = collectUnknownFields(withUnknownFields)
    expect(unknown).toContain('custom_flag')
    expect(unknown).toContain('extra_note')
    expect(unknown).toContain('search_result.weird_field')
  })

  it('known sources report no unknown fields, parsing still succeeds', () => {
    expect(collectUnknownFields(qimao)).toEqual([])
    expect(collectUnknownFields(jiugangbi)).toEqual([])
    expect(() => parseBookSource(withUnknownFields)).not.toThrow()
    expect(parseBookSource(withUnknownFields).unknownFields.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// item 11 — completeness validation
// ---------------------------------------------------------------------------
describe('item 11 · completeness validation', () => {
  it('both real sources validate as ok', () => {
    expect(parseBookSource(qimao).status).toBe('ok')
    expect(parseBookSource(jiugangbi).status).toBe('ok')
  })

  it('usable-with-gaps source (missing chapter_content) → warning (not a crash)', () => {
    const r = parseBookSource(partialWarn)
    expect(r.status).toBe('warning')
    expect(r.warnings.length).toBeGreaterThan(0)
    expect(r.warnings.some((w) => w.includes('chapter_content'))).toBe(true)
    expect(r.steps.length).toBeGreaterThan(0) // some steps still built
  })

  it('object with no constructable step → error (not a crash)', () => {
    const r = parseBookSource(brokenMissing)
    expect(r.status).toBe('error')
    expect(r.steps).toHaveLength(0)
    expect(r.errors.length).toBeGreaterThan(0)
  })

  it('non-object input → error status, no throw', () => {
    // @ts-expect-error intentional bad input
    const r = parseBookSource(null)
    expect(r.status).toBe('error')
    expect(r.errors.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// integration smoke — full parse result shape
// ---------------------------------------------------------------------------
describe('integration · parseBookSource end-to-end', () => {
  it('qimao produces a complete, UI-ready result', () => {
    const r = parseBookSource(qimao)
    expect(r.sourceType.type).toBe('api')
    expect(r.steps).toHaveLength(3)
    expect(r.placeholders.sort()).toEqual(['book_id', 'item_id', 'keyword'])
    expect(r.searchResult?.limit).toBe(7)
  })

  it('jiugangbi produces decoded filters + directive metadata', () => {
    const r = parseBookSource(jiugangbi)
    expect(r.sourceType.type).toBe('web')
    expect(r.contentFilters.filter((f) => f.status === 'decoded')).toHaveLength(3)
    expect(r.searchResult?.urlReplaceRules[0]?.to).toBe('http://www')
  })
})
