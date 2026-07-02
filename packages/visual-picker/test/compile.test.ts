import { describe, expect, it } from 'vitest'
import { isRule } from '@sift/core-ir'
import { compileVisualRule } from '../src/compile'

describe('compileVisualRule', () => {
  it('list spec → single list step, relative fields, attr + resolveUrl', () => {
    const rule = compileVisualRule({
      url: 'https://example.com/list',
      listSelector: '.product-card',
      fields: [
        { name: '标题', selector: '.title', type: 'string' },
        { name: '价格', selector: '.price', type: 'number' },
        { name: '封面', selector: 'img', attr: 'src', type: 'image' },
        { name: '链接', selector: 'a.title', attr: 'href', type: 'url' }
      ]
    })
    expect(isRule(rule)).toBe(true)
    expect(rule.meta.origin).toBe('visual-picker')
    expect(rule.steps).toHaveLength(1)
    const step = rule.steps[0]!
    expect(step.request.url).toEqual({ kind: 'static', url: 'https://example.com/list' })
    expect(step.parse.shape).toBe('list')
    expect(step.parse.list?.container.expr).toBe('.product-card')
    // 文本字段取 text 且无管线;图片/链接取属性 + resolveUrl 绝对化
    expect(step.parse.fields['标题']!.selector.extract).toEqual({ mode: 'text' })
    expect(step.parse.fields['标题']!.selector.pipeline).toBeUndefined()
    expect(step.parse.fields['封面']!.selector.extract).toEqual({ mode: 'attr', name: 'src' })
    expect(step.parse.fields['封面']!.selector.pipeline).toEqual([{ op: 'resolveUrl' }])
    const cols = Object.fromEntries(rule.output.columns.map((c) => [c.name, c.type]))
    expect(cols).toEqual({ 标题: 'string', 价格: 'number', 封面: 'image', 链接: 'url' })
  })

  it('no listSelector → single-page shape', () => {
    const rule = compileVisualRule({
      url: 'https://example.com/detail',
      fields: [{ name: '正文', selector: '.content', type: 'string' }]
    })
    expect(rule.steps[0]!.parse.shape).toBe('page')
    expect(rule.steps[0]!.parse.list).toBeUndefined()
  })

  it('skips empty name / empty selector fields', () => {
    const rule = compileVisualRule({
      url: 'https://x.com',
      listSelector: '.item',
      fields: [
        { name: '标题', selector: '.t' },
        { name: '', selector: '.no-name' },
        { name: '空选择器', selector: '  ' }
      ]
    })
    expect(Object.keys(rule.steps[0]!.parse.fields)).toEqual(['标题'])
    expect(rule.output.columns).toHaveLength(1)
  })
})
