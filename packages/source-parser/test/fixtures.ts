// ============================================================================
// Verification fixtures (line B). The two real book sources are taken verbatim
// from §6.3 of the development doc. NO network requests are made — these are
// static objects. The synthetic variants below exercise items 10 & 11.
// ============================================================================

import type { RawBookSource } from '../src/types'

/** Real source #1 — 七猫中文网 (API / JSON source, source_type "2"). */
export const qimao: RawBookSource = {
  source_name: '七猫中文网(免会员)',
  source_type: '2',
  source_url: 'https://www.qimao.com/',
  source_remark: '可直接阅读，无需会员无需登录无需设置cookie',
  time_out: 5000,
  book_name: 'none',
  book_menu: 'key$$data.key$$chapters',
  item_id: 'key$$id',
  item_name: 'key$$title',
  item_url: 'https://www.qimao.com/shuku/###book_id###-###item_id###/',
  chapter_title: '',
  chapter_content_type: '1',
  chapter_content: 'body',
  content_filter: [],
  search_url: 'https://www.qimao.com/qimaoapi/api/search/result?keyword=###keyword###&count=0&page=1&page_size=15',
  search_result: {
    limit: '7',
    list: 'key$$data.key$$search_list',
    book_id: 'key$$book_id',
    name: 'key$$title',
    author: 'key$$author',
    newest: 'key$$latest_chapter_title',
    remark: 'key$$intro',
    cover: 'key$$image_link',
    url: 'https://www.qimao.com/qimaoapi/api/book/chapter-list?book_id=###book_id###'
  }
}

/** Real source #2 — 旧钢笔文学 (web / HTML source, CSS selectors, jQuery pseudos). */
export const jiugangbi: RawBookSource = {
  source_name: '旧钢笔文学',
  source_url: 'http://www.jiugangbi.com/',
  time_out: 6000,
  book_name: '.currentnovelyfw .catalogyfw_info .novelname_author .novelname',
  book_remark: '.currentnovelyfw .catalogyfw_info .catalognovel_intro',
  book_author: '.currentnovelyfw .catalogyfw_info .novelname_author .novelauthor a',
  book_cover: '.currentnovelyfw .catalogyfw_pic img',
  book_menu: '.indexyfw_listbox .listchapter ul li:gt(8) a',
  book_menu_attr: 'href',
  chapter_title: '.currentlocationyfw > p:eq(6) a',
  chapter_content_type: '1',
  chapter_content: '.chapter_content > a:eq(1)',
  content_filter: [
    'd3d3LmppdWdhbmdiaS5jb23mj5DkvpvnmoQuK+mhtVwp',
    'LS0uK+acrOeroOacquWujO+8jOivt+eCueWHu+S4i+S4gOmhtee7p+e7remYheivuy4=',
    '44CQ6K+35pS26JePLivnmoTlsI/or7TjgJE='
  ],
  multi_page: true,
  next_btn: '.sytlet_footer_buttom ul li.buttom_next a',
  next_val: '下一页',
  search_url: '{{302}}{{gb2312}}http://www.jiugangbi.com/modules/article/search.php?searchkey=###keyword###&an=搜索',
  search_result: {
    limit: '6',
    list: '.toplist_list .list_ul li,.indexyfw_novel',
    name: "p.p1 a[href^='http://www.jiugangbi.com/'],.currentnovelyfw .catalogyfw_info .novelname_author .novelname",
    author: 'p.p3,.currentnovelyfw .catalogyfw_info .novelname_author .novelauthor a',
    newest: 'p.p2 a,.currentnovelyfw .catalogyfw_info .catalognovel_newest a',
    remark: 'p.p6,.currentnovelyfw .catalogyfw_info .catalognovel_intro',
    cover: '.currentnovelyfw .catalogyfw_pic img',
    cover_attr: 'src',
    url_type: '2',
    url_replace_rules: ['http://m%%http://www'],
    url: "p.p1 a[href^='http://www.jiugangbi.com/'],.currentlocationyfw .fr a",
    url_attr: 'href'
  }
}

/** Synthetic — qimao with source_type removed, to prove key$$ → API (item 1 case 3). */
export const qimaoNoType: RawBookSource = (() => {
  const clone: RawBookSource = JSON.parse(JSON.stringify(qimao))
  delete clone.source_type
  return clone
})()

/** Synthetic — carries unknown fields (top-level + inside search_result) for item 10. */
export const withUnknownFields: RawBookSource = {
  ...qimao,
  // unknown top-level keys
  custom_flag: true,
  extra_note: 'vendor specific',
  search_result: {
    ...qimao.search_result,
    // unknown nested key
    weird_field: 'xyz'
  }
}

/** Synthetic — yields zero collection steps, to prove the error status (item 11). */
export const brokenMissing: RawBookSource = {
  source_name: '残缺源',
  source_type: '2',
  // no search_url, no search_result, no chapter_content, no item_url, no book_menu
  book_name: 'none'
}

/**
 * Synthetic — search + book steps build, but chapter_content is missing, so the
 * source is usable-with-gaps → warning status (item 11).
 */
export const partialWarn: RawBookSource = {
  source_name: '部分源',
  source_type: '2',
  search_url: 'https://example.com/search?keyword=###keyword###',
  search_result: {
    list: 'key$$data.key$$list',
    book_id: 'key$$book_id',
    url: 'https://example.com/chapters?book_id=###book_id###'
  }
  // no chapter_content → a warning, not an error
}

/** A 15-item chapter list HTML fragment for the :gt(8) end-to-end test (item 7). */
export function makeChapterListHtml(count = 15): string {
  let lis = ''
  for (let i = 1; i <= count; i++) {
    lis += `<li><a href="/chapter/${i}">第${i}章</a></li>`
  }
  return `<div class="indexyfw_listbox"><div class="listchapter"><ul>${lis}</ul></div></div>`
}

/**
 * Two sibling <ul> lists, used to prove jQuery positional pseudos operate on the
 * GLOBAL matched set across parents (item 7), not per-parent. Each <li> carries
 * an <a> labelled `${prefix}${n}` (e.g. A1, A2, B1, ...).
 */
export function makeTwoListHtml(a = 3, b = 3): string {
  const ul = (prefix: string, n: number): string => {
    let lis = ''
    for (let i = 1; i <= n; i++) lis += `<li><a href="/${prefix}${i}">${prefix}${i}</a></li>`
    return `<ul>${lis}</ul>`
  }
  return `<div class="wrap">${ul('A', a)}${ul('B', b)}</div>`
}
