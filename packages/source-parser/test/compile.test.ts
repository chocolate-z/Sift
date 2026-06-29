import { describe, expect, it } from 'vitest'
import { isRule } from '@sift/core-ir'
import { compileSearchRule } from '../src/compile'
import { jiugangbi, qimao } from './fixtures'

describe('compileSearchRule — 七猫 (API/JSON)', () => {
  const rule = compileSearchRule(qimao)

  it('produces a valid Rule envelope', () => {
    expect(isRule(rule)).toBe(true)
    expect(rule.meta.origin).toBe('book-source')
    expect(rule.meta.sourceType).toBe('api')
    expect(rule.meta.name).toBe('七猫中文网(免会员)')
  })

  it('entry is keyword + single search step', () => {
    expect(rule.entry).toEqual({ kind: 'keyword', param: 'keyword', example: '剑来' })
    expect(rule.steps).toHaveLength(1)
    expect(rule.steps[0]!.id).toBe('search')
    expect(rule.steps[0]!.fanout).toEqual({ kind: 'once' })
  })

  it('templates the search URL with the keyword placeholder', () => {
    const url = rule.steps[0]!.request.url
    expect(url.kind).toBe('template')
    if (url.kind === 'template') {
      expect(url.template).toBe(
        'https://www.qimao.com/qimaoapi/api/search/result?keyword=###keyword###&count=0&page=1&page_size=15'
      )
      expect(url.placeholders).toEqual([{ name: 'keyword', satisfiedBy: { kind: 'input' } }])
    }
    expect(rule.steps[0]!.request.timeoutMs).toBe(5000)
    expect(rule.steps[0]!.request.encoding).toBeUndefined()
  })

  it('maps the JSONPath list + fields (key$$ normalized)', () => {
    const parse = rule.steps[0]!.parse
    expect(parse.shape).toBe('list')
    expect(parse.list!.container.engine).toBe('jsonpath')
    expect(parse.list!.container.expr).toBe('data.search_list')
    expect(parse.fields.name!.selector.engine).toBe('jsonpath')
    expect(parse.fields.name!.selector.expr).toBe('title')
    expect(parse.fields.cover!.selector.expr).toBe('image_link')
    expect(parse.fields.cover!.selector.extract).toEqual({ mode: 'text' })
    expect(parse.limit).toBe(7)
  })

  it('output columns map friendly names ← raw fields', () => {
    const byField = Object.fromEntries(rule.output.columns.map((c) => [c.fromField, c]))
    expect(byField.name!.name).toBe('书名')
    expect(byField.cover!.type).toBe('image')
    expect(rule.output.columns.every((c) => c.fromStep === 'search')).toBe(true)
  })
})

describe('compileSearchRule — 旧钢笔 (web/CSS)', () => {
  const rule = compileSearchRule(jiugangbi)

  it('detects web source', () => {
    expect(rule.meta.sourceType).toBe('web')
  })

  it('strips {{302}}{{gb2312}} directives into request config', () => {
    const url = rule.steps[0]!.request.url
    expect(url.kind).toBe('template')
    if (url.kind === 'template') {
      expect(url.template).toBe('http://www.jiugangbi.com/modules/article/search.php?searchkey=###keyword###&an=搜索')
    }
    expect(rule.steps[0]!.request.encoding).toBe('gb2312')
    expect(rule.steps[0]!.request.followRedirect).toBe(true)
    expect(rule.steps[0]!.request.timeoutMs).toBe(6000)
  })

  it('maps CSS list with comma fallback + per-field fallbacks/attr', () => {
    const parse = rule.steps[0]!.parse
    expect(parse.list!.container.engine).toBe('css')
    expect(parse.list!.container.expr).toBe('.toplist_list .list_ul li')
    expect(parse.list!.container.fallbacks).toEqual(['.indexyfw_novel'])

    const name = parse.fields.name!.selector
    expect(name.engine).toBe('css')
    expect(name.expr).toBe("p.p1 a[href^='http://www.jiugangbi.com/']")
    expect(name.fallbacks).toEqual(['.currentnovelyfw .catalogyfw_info .novelname_author .novelname'])

    // cover_attr=src → attribute extraction
    expect(parse.fields.cover!.selector.extract).toEqual({ mode: 'attr', name: 'src' })
    expect(parse.limit).toBe(6)
  })

  it('keyword param taken from the search URL placeholder', () => {
    expect(rule.entry).toMatchObject({ kind: 'keyword', param: 'keyword' })
  })
})
