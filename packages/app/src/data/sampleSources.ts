// 技术验证用的两个真实书源(七猫 API 源 / 旧钢笔 网页源)。
// 供规则导入「查看原始 JSON」与「粘贴规则」现场解析复用。
export const SAMPLE_SOURCES: Record<'qimao' | 'jgb', Record<string, unknown>> = {
  qimao: {
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
  },
  jgb: {
    source_name: '旧钢笔文学',
    source_url: 'http://www.jiugangbi.com/',
    time_out: 6000,
    book_name: '.currentnovelyfw .catalogyfw_info .novelname_author .novelname',
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
      name: '.currentnovelyfw .catalogyfw_info .novelname_author .novelname',
      author: 'p.p3,.currentnovelyfw .catalogyfw_info .novelname_author .novelauthor a',
      cover_attr: 'src',
      url_type: '2',
      url_replace_rules: ['http://m%%http://www'],
      url_attr: 'href'
    }
  }
}
