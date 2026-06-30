import { describe, expect, it } from 'vitest'
import { isRule } from '@sift/core-ir'
import { compileBookSource, compileCatalogRule, compileSearchRule } from '../src/compile'
import { jiugangbi, partialWarn, qimao } from './fixtures'

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

describe('compileCatalogRule — 网页源缺 search_result.url 优雅降级', () => {
  it('falls back to a search-only rule with no unresolvable ###book_url###', () => {
    const noUrl = JSON.parse(JSON.stringify(jiugangbi))
    delete noUrl.search_result.url
    delete noUrl.search_result.url_attr
    const rule = compileCatalogRule(noUrl)
    // 无法得到 book_url → 只保留搜索步骤,不发会失败的目录步骤
    expect(rule.steps.map((s) => s.id)).toEqual(['search'])
    const hasBookUrlTemplate = rule.steps.some(
      (s) => s.request.url.kind === 'template' && s.request.url.template.includes('###book_url###')
    )
    expect(hasBookUrlTemplate).toBe(false)
    // 仍输出书单列
    expect(rule.output.columns.some((c) => c.name === '书名')).toBe(true)
    expect(rule.output.columns.some((c) => c.name === '章节')).toBe(false)
  })
})

describe('compileBookSource — 七猫 (template-id 正文链路)', () => {
  const rule = compileBookSource(qimao)

  it('is a valid 3-step Rule (search → catalog → chapter)', () => {
    expect(isRule(rule)).toBe(true)
    expect(rule.steps.map((s) => s.id)).toEqual(['search', 'catalog', 'chapter'])
  })

  it('chapter step fanouts over catalog with item_url template (item_id→chapter_id)', () => {
    const chapter = rule.steps[2]!
    expect(chapter.fanout).toEqual({ kind: 'perItem', overStep: 'catalog' })
    const url = chapter.request.url
    expect(url.kind).toBe('template')
    if (url.kind === 'template') {
      expect(url.template).toBe('https://www.qimao.com/shuku/###book_id###-###chapter_id###/')
      expect(url.placeholders.map((p) => p.name)).toEqual(['book_id', 'chapter_id'])
    }
  })

  it('chapter parse is a page with chapter_content; 七猫 has no chapter_title', () => {
    const parse = rule.steps[2]!.parse
    expect(parse.shape).toBe('page')
    expect(parse.fields.chapter_content!.selector.expr).toBe('body')
    expect(parse.fields.chapter_title).toBeUndefined()
    // 七猫 content_filter 为空 → 无清洗管线
    expect(parse.fields.chapter_content!.selector.pipeline).toBeUndefined()
  })

  it('caps the catalog to a small chapter count for preview', () => {
    expect(rule.steps[1]!.parse.limit).toBe(3)
  })

  it('output adds 正文 column, no pagination (single-page chapter)', () => {
    expect(rule.output.columns.some((c) => c.name === '正文')).toBe(true)
    expect(rule.steps[2]!.pagination).toBeUndefined()
  })
})

describe('compileBookSource — 旧钢笔 (extracted-url 正文链路 + content_filter + 正文翻页)', () => {
  const rule = compileBookSource(jiugangbi)

  it('is a 3-step rule; chapter URL is the extracted chapter_url', () => {
    expect(rule.steps.map((s) => s.id)).toEqual(['search', 'catalog', 'chapter'])
    const url = rule.steps[2]!.request.url
    expect(url.kind).toBe('template')
    if (url.kind === 'template') {
      expect(url.template).toBe('###chapter_url###')
      expect(url.placeholders).toEqual([{ name: 'chapter_url', satisfiedBy: { kind: 'step', stepId: 'catalog' } }])
    }
  })

  it('chapter has title + content; site directives (gb2312/302) carried to chapter', () => {
    const chapter = rule.steps[2]!
    const parse = chapter.parse
    expect(parse.fields.chapter_title!.selector.expr).toBe('.currentlocationyfw > p:eq(6) a')
    expect(parse.fields.chapter_content!.selector.expr).toBe('.chapter_content > a:eq(1)')
    expect(chapter.request.encoding).toBe('gb2312')
    expect(chapter.request.followRedirect).toBe(true)
  })

  it('content_filter compiles to regex-clean pipeline ops (replace → empty)', () => {
    const pipeline = rule.steps[2]!.parse.fields.chapter_content!.selector.pipeline ?? []
    expect(pipeline).toHaveLength(3)
    expect(pipeline.every((op) => op.op === 'regex')).toBe(true)
    expect(pipeline.every((op) => (op as { replace?: string }).replace === '')).toBe(true)
    // 解码后的正则之一含「本章未完」(广告行)
    const patterns = pipeline.map((op) => (op as { pattern: string }).pattern)
    expect(patterns.some((p) => p.includes('本章未完'))).toBe(true)
  })

  it('正文翻页 via nextButton + appendContent, capped + requireText (not stopText)', () => {
    const pg = rule.steps[2]!.pagination
    expect(pg?.kind).toBe('nextButton')
    if (pg?.kind === 'nextButton') {
      expect(pg.next.expr).toBe('.sytlet_footer_buttom ul li.buttom_next a')
      expect(pg.next.extract).toEqual({ mode: 'attr', name: 'href' })
      // next_val「下一页」= 继续翻的文本门控(requireText),不是 stopText(语义相反)。
      expect(pg.requireText).toBe('下一页')
      expect(pg.stopText).toBeUndefined()
      expect(pg.combine).toBe('appendContent')
      expect(pg.maxPages).toBe(8)
    }
  })

  it('output columns: 书名 + 章节 + 章节标题 + 正文', () => {
    expect(rule.output.columns.map((c) => c.name)).toEqual(['书名', '章节', '章节标题', '正文'])
  })
})

describe('compileBookSource — 降级', () => {
  it('no chapter_content → returns the catalog rule unchanged (no chapter step)', () => {
    // partialWarn 有 search + 目录(book_id 模板)但无 chapter_content。
    const rule = compileBookSource(partialWarn)
    expect(rule.steps.map((s) => s.id)).toEqual(['search', 'catalog'])
    expect(rule.steps.some((s) => s.id === 'chapter')).toBe(false)
  })

  it('search-only source (no catalog) → no chapter step', () => {
    const noUrl = JSON.parse(JSON.stringify(jiugangbi))
    delete noUrl.search_result.url
    delete noUrl.search_result.url_attr
    const rule = compileBookSource(noUrl)
    expect(rule.steps.map((s) => s.id)).toEqual(['search'])
  })
})
