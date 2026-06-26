import { describe, expect, it } from 'vitest'
import {
  buildFieldColumns,
  detectRepeat,
  generateColumnSelector,
  generateSelector,
  isMeaningfulId,
  isRandomId,
  isSemanticClass,
  queryAll,
  scoreStrategies,
  signatureOf,
  suggestAttribute
} from '../src/index'
import { buildEcommerce, buildRandomIdDom, buildTwoListDom } from './fixtures'

const dom = buildEcommerce()

// ---------------------------------------------------------------------------
// CSS engine sanity (underpins every other assertion)
// ---------------------------------------------------------------------------
describe('VNode CSS engine', () => {
  it('matches id, class, descendant and nth-of-type', () => {
    expect(queryAll(dom.body, '#list')).toHaveLength(1)
    expect(queryAll(dom.body, 'div.product-card')).toHaveLength(5)
    expect(queryAll(dom.body, '#list div.product-card a.title')).toHaveLength(5)
    const third = queryAll(dom.body, 'div.product-card:nth-of-type(3)')
    expect(third).toHaveLength(1)
    expect(third[0]).toBe(dom.card3)
  })

  it('supports child combinator and attribute selectors', () => {
    expect(queryAll(dom.body, '#list > div.product-card')).toHaveLength(5)
    expect(queryAll(dom.body, "a[href^='/product/']")).toHaveLength(5)
    expect(queryAll(dom.body, 'img[data-src]')).toHaveLength(5)
  })
})

// ---------------------------------------------------------------------------
// item 1 — robust selector generation
// ---------------------------------------------------------------------------
describe('item 1 · robust selector generation', () => {
  it('prefers a meaningful id', () => {
    const g = generateSelector(dom.productList, dom.body)
    expect(g.selector).toBe('#list')
    expect(g.strategies).toEqual(['id'])
  })

  it('falls back to nth-of-type for structurally-identical siblings', () => {
    const g = generateSelector(dom.card3, dom.body)
    expect(g.selector).toContain('nth-of-type(3)')
    const hits = queryAll(dom.body, g.selector)
    expect(hits).toHaveLength(1)
    expect(hits[0]).toBe(dom.card3)
  })

  it('generates a unique selector for a nested element', () => {
    const g = generateSelector(dom.card3Title, dom.body)
    const hits = queryAll(dom.body, g.selector)
    expect(hits).toHaveLength(1)
    expect(hits[0]).toBe(dom.card3Title)
    expect(g.selector).toContain('.title')
  })

  it('skips random and pure-numeric ids', () => {
    expect(isRandomId('item-a3f9b2c1')).toBe(true)
    expect(isRandomId('1024')).toBe(true)
    expect(isMeaningfulId('list')).toBe(true)
    expect(isMeaningfulId('product-list')).toBe(true)

    const { root, randomCard, numericCard } = buildRandomIdDom()
    const g1 = generateSelector(randomCard, root)
    expect(g1.selector).not.toContain('item-a3f9b2c1')
    expect(g1.strategies).not.toContain('id')
    const g2 = generateSelector(numericCard, root)
    expect(g2.selector).not.toContain('1024')
  })

  it('recognizes semantic vs machine-generated classes', () => {
    expect(isSemanticClass('product-card')).toBe(true)
    expect(isSemanticClass('title')).toBe(true)
    expect(isSemanticClass('css-1a2b3c')).toBe(false)
    expect(isSemanticClass('sc-bdfBwQ')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// item 2 — repeat-structure detection (core)
// ---------------------------------------------------------------------------
describe('item 2 · repeat-structure detection', () => {
  it('finds the list container from a deeply-picked target', () => {
    const r = detectRepeat(dom.card3Title)
    expect(r).not.toBeNull()
    expect(r!.container).toBe(dom.productList)
    expect(r!.itemTag).toBe('div')
    expect(r!.itemClass).toBe('product-card')
    expect(r!.count).toBe(5)
    expect(r!.pathWithinItem).toBe('a.title')
    expect(r!.targetIndex).toBe(2)
  })

  it('handles the picked element being the list item itself', () => {
    const r = detectRepeat(dom.card3)
    expect(r!.container).toBe(dom.productList)
    expect(r!.pathWithinItem).toBe('')
    expect(r!.targetIndex).toBe(2)
  })

  it('returns null when there is no repeating structure', () => {
    expect(detectRepeat(dom.header)).toBeNull()
    expect(signatureOf(dom.card3)).toBe('div|product-card')
  })
})

// ---------------------------------------------------------------------------
// item 3 — from one picked element to the whole column
// ---------------------------------------------------------------------------
describe('item 3 · one → whole column', () => {
  it('a single picked title yields a selector matching all 5 titles', () => {
    const r = detectRepeat(dom.card3Title)!
    const col = generateColumnSelector(r)
    expect(col.columnSelector).toBe('#list div.product-card a.title')
    expect(col.matchCount).toBe(5)

    const hits = queryAll(dom.body, col.columnSelector)
    expect(hits).toHaveLength(5)
    expect(hits).toEqual(dom.cards.map((c) => c.children[0]))
  })
})

// ---------------------------------------------------------------------------
// item 4 — multi-field linkage (shared list container)
// ---------------------------------------------------------------------------
describe('item 4 · multi-field linkage', () => {
  it('title / price / image columns all share one container', () => {
    const result = buildFieldColumns([
      { name: 'title', target: dom.card3Title },
      { name: 'price', target: dom.card3Price },
      { name: 'image', target: dom.card3Cover }
    ])
    expect(result).not.toBeNull()
    expect(result!.containerSelector).toBe('#list')
    expect(result!.itemSelector).toBe('div.product-card')

    const byName = Object.fromEntries(result!.columns.map((c) => [c.name, c.column]))
    expect(byName.title!.matchCount).toBe(5)
    expect(byName.price!.matchCount).toBe(5)
    expect(byName.image!.matchCount).toBe(5)
    expect(byName.price!.columnSelector).toBe('#list div.product-card span.price')
    expect(byName.image!.columnSelector).toBe('#list div.product-card img.cover')
    // every column is rooted in the same container
    for (const c of result!.columns) expect(c.column.containerSelector).toBe('#list')
  })

  it('rejects picks that span two different list containers', () => {
    const { aTitle, bPrice } = buildTwoListDom()
    const result = buildFieldColumns([
      { name: 'title', target: aTitle }, // lives in #listA
      { name: 'price', target: bPrice } // lives in #listB
    ])
    expect(result).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// item 5 — attribute extraction
// ---------------------------------------------------------------------------
describe('item 5 · attribute extraction', () => {
  it('anchor → @href', () => {
    const a = suggestAttribute(dom.card3Title)
    expect(a).toEqual({ mode: 'attr', attr: 'href', reason: 'anchor → link target' })
  })

  it('lazy-loaded img → @data-src', () => {
    const a = suggestAttribute(dom.card3Cover)
    expect(a.mode).toBe('attr')
    expect(a.attr).toBe('data-src')
    expect(a.reason).toMatch(/lazy/)
  })

  it('plain element → inner text', () => {
    expect(suggestAttribute(dom.card3Price).mode).toBe('text')
  })

  it('img with a real src → @src', () => {
    const img = {
      tag: 'img',
      classList: [],
      attrs: { src: '/real.jpg' },
      children: [],
      parent: null
    }
    expect(suggestAttribute(img).attr).toBe('src')
  })

  it('lazy img with a placeholder src still prefers @data-src', () => {
    const img = {
      tag: 'img',
      classList: [],
      attrs: { src: '/placeholder.gif', 'data-src': '/real.jpg' },
      children: [],
      parent: null
    }
    expect(suggestAttribute(img).attr).toBe('data-src')
  })
})

// ---------------------------------------------------------------------------
// item 6 — robustness scoring
// ---------------------------------------------------------------------------
describe('item 6 · robustness scoring', () => {
  it('grades per §6.4.6: id / semantic class → high, nth-of-type → low', () => {
    expect(scoreStrategies(['id'])).toMatchObject({ score: 100, grade: 'high' })
    expect(scoreStrategies(['class']).grade).toBe('high')
    expect(scoreStrategies(['nth-of-type']).grade).toBe('low')
    expect(scoreStrategies(['tag']).grade).toBe('medium')
  })

  it('a positional generated selector grades low; an id-anchored one grades high', () => {
    const idSel = generateSelector(dom.productList, dom.body) // '#list'
    const nthSel = generateSelector(dom.card3, dom.body) // 'div.product-card:nth-of-type(3)'
    expect(idSel.grade).toBe('high')
    expect(nthSel.grade).toBe('low')
    expect(nthSel.score).toBeLessThan(idSel.score)
  })
})
