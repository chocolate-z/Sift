import { describe, expect, it } from 'vitest'
import { isRule } from '@sift/core-ir'
import { compileCatalogRule, compileSearchRule } from '../src/compile'
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

describe('compileCatalogRule — 七猫 (template-id 链路)', () => {
  const rule = compileCatalogRule(qimao)

  it('is a valid 2-step Rule (search → catalog)', () => {
    expect(isRule(rule)).toBe(true)
    expect(rule.steps.map((s) => s.id)).toEqual(['search', 'catalog'])
  })

  it('search step extracts book_id for the catalog URL template', () => {
    const f = rule.steps[0]!.parse.fields.book_id
    expect(f).toBeTruthy()
    expect(f!.selector.engine).toBe('jsonpath')
    expect(f!.selector.expr).toBe('book_id')
  })

  it('catalog URL is the chapter-list template threaded by book_id', () => {
    const catalog = rule.steps[1]!
    expect(catalog.fanout).toEqual({ kind: 'perItem', overStep: 'search' })
    const url = catalog.request.url
    expect(url.kind).toBe('template')
    if (url.kind === 'template') {
      expect(url.template).toBe('https://www.qimao.com/qimaoapi/api/book/chapter-list?book_id=###book_id###')
      expect(url.placeholders).toEqual([{ name: 'book_id', satisfiedBy: { kind: 'step', stepId: 'search' } }])
    }
  })

  it('catalog parses the JSON chapter list (item_name/item_id)', () => {
    const parse = rule.steps[1]!.parse
    expect(parse.list!.container.engine).toBe('jsonpath')
    expect(parse.list!.container.expr).toBe('data.chapters')
    expect(parse.fields.chapter_name!.selector.expr).toBe('title')
    expect(parse.fields.chapter_id!.selector.expr).toBe('id')
  })

  it('output columns: 书名 + 章节 + 章节ID', () => {
    const names = rule.output.columns.map((c) => c.name)
    expect(names).toContain('书名')
    expect(names).toContain('章节')
    expect(names).toContain('章节ID')
  })
})

describe('compileCatalogRule — 旧钢笔 (extracted-url + self-extract 链路)', () => {
  const rule = compileCatalogRule(jiugangbi)

  it('search step extracts book_url with url_replace + resolveUrl pipeline', () => {
    const f = rule.steps[0]!.parse.fields.book_url
    expect(f).toBeTruthy()
    expect(f!.selector.engine).toBe('css')
    expect(f!.selector.extract).toEqual({ mode: 'attr', name: 'href' })
    const ops = (f!.selector.pipeline ?? []).map((p) => p.op)
    expect(ops).toEqual(['urlReplace', 'resolveUrl'])
    // 无 book_id(网页源走 url 抽取)
    expect(rule.steps[0]!.parse.fields.book_id).toBeUndefined()
  })

  it('site directives (gb2312) apply to both steps', () => {
    expect(rule.steps[0]!.request.encoding).toBe('gb2312')
    expect(rule.steps[1]!.request.encoding).toBe('gb2312')
    expect(rule.steps[0]!.request.followRedirect).toBe(true)
  })

  it('catalog URL is the extracted book_url template', () => {
    const url = rule.steps[1]!.request.url
    expect(url.kind).toBe('template')
    if (url.kind === 'template') {
      expect(url.template).toBe('###book_url###')
      expect(url.placeholders).toEqual([{ name: 'book_url', satisfiedBy: { kind: 'step', stepId: 'search' } }])
    }
  })

  it('catalog uses book_menu container + self-extract chapter fields', () => {
    const parse = rule.steps[1]!.parse
    expect(parse.list!.container.engine).toBe('css')
    expect(parse.list!.container.expr).toBe('.indexyfw_listbox .listchapter ul li:gt(8) a')
    // 空选择器 = 取列表项(<a>)自身
    expect(parse.fields.chapter_name!.selector.expr).toBe('')
    expect(parse.fields.chapter_url!.selector.expr).toBe('')
    expect(parse.fields.chapter_url!.selector.extract).toEqual({ mode: 'attr', name: 'href' })
    expect((parse.fields.chapter_url!.selector.pipeline ?? []).map((p) => p.op)).toEqual(['resolveUrl'])
  })
})
