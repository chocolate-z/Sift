import { describe, expect, it } from 'vitest'
import { CURRENT_IR_VERSION, isRule } from '../src/index'
import type { Rule } from '../src/index'

// These literals are TYPE-CHECKED against `Rule` — if the IR drifts so a real
// line-A / line-B rule can no longer be expressed, `tsc` fails here. They also
// exercise nearly every construct: all UrlSource kinds, list+page shapes, every
// Extraction mode, fallbacks, pipeline ops, contentFilters, fanout once+perItem,
// pagination none+nextButton, and the text-download capability.

// line A — visual-picker single-step list extraction (e-commerce pick)
const lineARule: Rule = {
  irVersion: 1,
  meta: { id: 'pick-1', name: '商品列表', origin: 'visual-picker', sourceType: 'web' },
  entry: { kind: 'url', url: 'https://shop.example/list' },
  vars: [],
  steps: [
    {
      id: 'page',
      name: '商品列表',
      request: { url: { kind: 'static', url: 'https://shop.example/list' } },
      parse: {
        shape: 'list',
        list: {
          container: { engine: 'css', expr: '#list' },
          item: { engine: 'css', expr: 'div.product-card' }
        },
        fields: {
          title: {
            selector: { engine: 'css', expr: 'a.title', extract: { mode: 'text' } },
            label: '标题'
          },
          price: { selector: { engine: 'css', expr: 'span.price' }, label: '价格' },
          cover: {
            selector: {
              engine: 'css',
              expr: 'img.cover',
              extract: { mode: 'attr', name: 'data-src' }
            },
            label: '封面'
          }
        }
      },
      fanout: { kind: 'once' },
      pagination: { kind: 'none' }
    }
  ],
  output: {
    format: 'records',
    columns: [
      { name: '标题', fromField: 'title', fromStep: 'page', type: 'string' },
      { name: '价格', fromField: 'price', fromStep: 'page', type: 'string' },
      { name: '封面', fromField: 'cover', fromStep: 'page', type: 'image' }
    ],
    formats: ['csv', 'json', 'xlsx']
  }
}

// line B (API/JSON) — qimao: search → book → chapter with variable passing
const lineBApiRule: Rule = {
  irVersion: 1,
  meta: { id: 'qimao', name: '七猫中文网', origin: 'book-source', sourceType: 'api', status: 'ok' },
  entry: { kind: 'keyword', param: 'keyword', example: '诡秘之主' },
  vars: [
    { name: 'keyword', origin: 'input', required: true },
    { name: 'book_id', origin: 'produced', producedBy: 'search' },
    { name: 'item_id', origin: 'produced', producedBy: 'book' }
  ],
  steps: [
    {
      id: 'search',
      name: '搜索',
      request: {
        url: {
          kind: 'template',
          template: 'https://www.qimao.com/qimaoapi/api/search/result?keyword=###keyword###&page_size=15',
          placeholders: [{ name: 'keyword', satisfiedBy: { kind: 'input' } }]
        }
      },
      parse: {
        shape: 'list',
        limit: 7,
        list: { container: { engine: 'jsonpath', expr: 'data.search_list' } },
        fields: {
          book_id: { selector: { engine: 'jsonpath', expr: 'book_id' } },
          name: { selector: { engine: 'jsonpath', expr: 'title' }, label: '书名' },
          author: { selector: { engine: 'jsonpath', expr: 'author' }, label: '作者' }
        }
      },
      inputs: [{ name: 'keyword', from: { kind: 'input' } }],
      produces: [{ name: 'book_id', from: 'book_id' }],
      fanout: { kind: 'once' }
    },
    {
      id: 'book',
      name: '目录',
      request: {
        url: {
          kind: 'template',
          template: 'https://www.qimao.com/qimaoapi/api/book/chapter-list?book_id=###book_id###',
          placeholders: [{ name: 'book_id', satisfiedBy: { kind: 'step', stepId: 'search' } }]
        }
      },
      parse: {
        shape: 'list',
        list: { container: { engine: 'jsonpath', expr: 'data.chapters' } },
        fields: {
          item_id: { selector: { engine: 'jsonpath', expr: 'id' } },
          item_name: { selector: { engine: 'jsonpath', expr: 'title' }, label: '章节名' }
        }
      },
      inputs: [{ name: 'book_id', from: { kind: 'step', stepId: 'search', field: 'book_id' } }],
      produces: [{ name: 'item_id', from: 'item_id' }],
      fanout: { kind: 'perItem', overStep: 'search' }
    },
    {
      id: 'chapter',
      name: '正文',
      request: {
        url: {
          kind: 'template',
          template: 'https://www.qimao.com/shuku/###book_id###-###item_id###/',
          placeholders: [
            { name: 'book_id', satisfiedBy: { kind: 'step', stepId: 'search' } },
            { name: 'item_id', satisfiedBy: { kind: 'step', stepId: 'book' } }
          ]
        },
        timeoutMs: 5000
      },
      parse: {
        shape: 'page',
        fields: { content: { selector: { engine: 'css', expr: 'body' }, label: '正文' } }
      },
      inputs: [
        { name: 'book_id', from: { kind: 'step', stepId: 'search', field: 'book_id' } },
        { name: 'item_id', from: { kind: 'step', stepId: 'book', field: 'item_id' } }
      ],
      fanout: { kind: 'perItem', overStep: 'book' }
    }
  ],
  output: {
    format: 'records',
    columns: [{ name: '正文', fromField: 'content', fromStep: 'chapter', type: 'text' }],
    formats: ['txt'],
    download: { kind: 'text', field: 'content', merge: true }
  }
}

// line B (web/CSS) — jiugangbi: directives, extracted urls, pseudo, pagination,
// fallbacks, urlReplace, content filters, regex pipeline
const lineBWebRule: Rule = {
  irVersion: 1,
  meta: {
    id: 'jiugangbi',
    name: '旧钢笔文学',
    origin: 'book-source',
    sourceType: 'web',
    sourceUrl: 'http://www.jiugangbi.com/'
  },
  entry: { kind: 'keyword', param: 'keyword' },
  vars: [{ name: 'keyword', origin: 'input' }],
  steps: [
    {
      id: 'search',
      name: '搜索',
      request: {
        url: {
          kind: 'template',
          template: 'http://www.jiugangbi.com/modules/article/search.php?searchkey=###keyword###&an=搜索',
          placeholders: [{ name: 'keyword', satisfiedBy: { kind: 'input' } }]
        },
        encoding: 'gb2312',
        followRedirect: true,
        urlReplaceRules: [{ from: 'http://m', to: 'http://www' }]
      },
      parse: {
        shape: 'list',
        limit: 6,
        list: {
          container: {
            engine: 'css',
            expr: '.toplist_list .list_ul li',
            fallbacks: ['.indexyfw_novel']
          }
        },
        fields: {
          name: {
            selector: {
              engine: 'css',
              expr: "p.p1 a[href^='http://www.jiugangbi.com/']",
              fallbacks: ['.novelname']
            },
            label: '书名'
          },
          url: {
            selector: { engine: 'css', expr: 'p.p1 a', extract: { mode: 'attr', name: 'href' } }
          }
        }
      },
      fanout: { kind: 'once' }
    },
    {
      id: 'book',
      name: '目录',
      request: {
        url: {
          kind: 'extracted',
          from: { engine: 'css', expr: 'p.p1 a', extract: { mode: 'attr', name: 'href' } }
        }
      },
      parse: {
        shape: 'list',
        list: {
          container: { engine: 'css', expr: '.indexyfw_listbox .listchapter ul li:gt(8) a' }
        },
        fields: {
          chapter_url: {
            selector: { engine: 'css', expr: 'a', extract: { mode: 'attr', name: 'href' } }
          }
        }
      },
      fanout: { kind: 'perItem', overStep: 'search' }
    },
    {
      id: 'chapter',
      name: '正文',
      request: {
        url: {
          kind: 'extracted',
          from: { engine: 'css', expr: 'a', extract: { mode: 'attr', name: 'href' } }
        },
        encoding: 'gb2312'
      },
      parse: {
        shape: 'page',
        contentFilters: [
          { pattern: '【请收藏.+的小说】', isRegex: true },
          { pattern: '--.+本章未完，请点击下一页继续阅读.', isRegex: true }
        ],
        fields: {
          content: {
            selector: {
              engine: 'css',
              expr: '.chapter_content > a:eq(1)',
              pipeline: [{ op: 'regex', pattern: '【请收藏.+的小说】', replace: '' }, { op: 'trim' }]
            },
            label: '正文'
          }
        }
      },
      pagination: {
        kind: 'nextButton',
        next: { engine: 'css', expr: '.sytlet_footer_buttom ul li.buttom_next a' },
        stopText: '下一页',
        combine: 'appendContent'
      },
      fanout: { kind: 'perItem', overStep: 'book' }
    }
  ],
  output: {
    format: 'records',
    columns: [{ name: '正文', fromField: 'content', fromStep: 'chapter', type: 'text' }]
  }
}

describe('Rule IR — type-checked fixtures', () => {
  it('exposes the current schema version', () => {
    expect(CURRENT_IR_VERSION).toBe(1)
  })

  it('a line-A pick compiles to a single-step Rule', () => {
    expect(isRule(lineARule)).toBe(true)
    expect(lineARule.steps).toHaveLength(1)
    expect(lineARule.steps[0]!.parse.shape).toBe('list')
  })

  it('a line-B API source compiles to a 3-step chain with variable passing', () => {
    expect(isRule(lineBApiRule)).toBe(true)
    expect(lineBApiRule.steps.map((s) => s.id)).toEqual(['search', 'book', 'chapter'])
    expect(lineBApiRule.steps[1]!.fanout).toEqual({ kind: 'perItem', overStep: 'search' })
    expect(lineBApiRule.steps[0]!.produces).toEqual([{ name: 'book_id', from: 'book_id' }])
  })

  it('a line-B web source carries directives, extracted urls and pagination', () => {
    expect(isRule(lineBWebRule)).toBe(true)
    const search = lineBWebRule.steps[0]!
    expect(search.request.encoding).toBe('gb2312')
    expect(search.request.followRedirect).toBe(true)
    expect(lineBWebRule.steps[1]!.request.url.kind).toBe('extracted')
    expect(lineBWebRule.steps[2]!.pagination?.kind).toBe('nextButton')
  })

  it('all three rules are engine-indistinguishable by origin (same Rule shape)', () => {
    for (const r of [lineARule, lineBApiRule, lineBWebRule]) {
      expect(isRule(r)).toBe(true)
      expect(r.irVersion).toBe(CURRENT_IR_VERSION)
    }
  })

  it('isRule rejects malformed envelopes without throwing', () => {
    expect(isRule(null)).toBe(false)
    expect(isRule({})).toBe(false)
    expect(isRule({ irVersion: 1 })).toBe(false) // missing meta/steps/entry
    expect(isRule({ irVersion: 99, meta: {}, steps: [], entry: {} })).toBe(false) // wrong version
  })
})
