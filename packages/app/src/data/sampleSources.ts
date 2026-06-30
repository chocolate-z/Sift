// 通用采集规则示例(中性模板,演示规则结构,不指向真实站点)。
// 规则导入「载入示例」与「查看原始 JSON」复用。
export const EXAMPLE_RULE: Record<string, unknown> = {
  source_name: '示例采集源',
  source_url: 'https://example.com/',
  time_out: 8000,
  search_url: 'https://example.com/search?q=###keyword###',
  search_result: {
    limit: '10',
    list: '.result-item',
    name: '.title',
    author: '.meta .by',
    remark: '.summary',
    cover: '.thumb img',
    cover_attr: 'src',
    url: '.title a',
    url_attr: 'href'
  }
}
