//! 解析层端到端测试。用形似两个真实源(旧钢笔网页 / 七猫 API)的构造片段,
//! 不触达真实站点。覆盖:CSS 列表 + 字段、伪类 :gt/:eq、属性提取、fallback、
//! JSONPath 列表/页 + key$$ 归一、limit、必填告警。

use sift_engine::parse::{parse_document, parse_html, parse_json};
use sift_engine::{Extraction, FieldRule, ListSpec, ParseSpec, PipelineOp, SelectorExpr, Shape};
use std::collections::BTreeMap;

fn css(expr: &str) -> SelectorExpr {
    SelectorExpr {
        engine: "css".into(),
        expr: expr.into(),
        fallbacks: Vec::new(),
        extract: Extraction::Text,
        pipeline: Vec::new(),
    }
}

fn css_attr(expr: &str, name: &str) -> SelectorExpr {
    SelectorExpr {
        engine: "css".into(),
        expr: expr.into(),
        fallbacks: Vec::new(),
        extract: Extraction::Attr { name: name.into() },
        pipeline: Vec::new(),
    }
}

fn jpath(expr: &str) -> SelectorExpr {
    SelectorExpr {
        engine: "jsonpath".into(),
        expr: expr.into(),
        fallbacks: Vec::new(),
        extract: Extraction::Text,
        pipeline: Vec::new(),
    }
}

fn field(selector: SelectorExpr) -> FieldRule {
    FieldRule {
        selector,
        label: None,
        required: false,
    }
}

fn fields(pairs: Vec<(&str, FieldRule)>) -> BTreeMap<String, FieldRule> {
    pairs.into_iter().map(|(k, v)| (k.to_string(), v)).collect()
}

// 形似旧钢笔搜索结果列表。
const JIUGANGBI_SEARCH: &str = r#"
<html><body>
  <div class="toplist_list"><ul class="list_ul">
    <li><p class="p1"><a href="http://www.jiugangbi.com/book/1">剑来</a></p><p class="p3">烽火戏诸侯</p></li>
    <li><p class="p1"><a href="http://www.jiugangbi.com/book/2">大奉打更人</a></p><p class="p3">卖报小郎君</p></li>
    <li><p class="p1"><a href="http://www.jiugangbi.com/book/3">诡秘之主</a></p><p class="p3">爱潜水的乌贼</p></li>
  </ul></div>
</body></html>
"#;

#[test]
fn parses_jiugangbi_search_list() {
    let spec = ParseSpec {
        shape: Shape::List,
        list: Some(ListSpec {
            container: css(".toplist_list .list_ul li"),
            item: None,
        }),
        fields: fields(vec![
            ("name", field(css("p.p1 a"))),
            ("author", field(css("p.p3"))),
            ("url", field(css_attr("p.p1 a", "href"))),
        ]),
        limit: None,
        content_filters: Vec::new(),
    };
    let out = parse_html(JIUGANGBI_SEARCH, &spec, None).unwrap();
    assert_eq!(out.records.len(), 3);
    assert_eq!(out.records[0]["name"].as_deref(), Some("剑来"));
    assert_eq!(out.records[0]["author"].as_deref(), Some("烽火戏诸侯"));
    assert_eq!(
        out.records[0]["url"].as_deref(),
        Some("http://www.jiugangbi.com/book/1")
    );
    assert_eq!(out.records[2]["name"].as_deref(), Some("诡秘之主"));
    assert!(out.warnings.is_empty(), "warnings: {:?}", out.warnings);
}

#[test]
fn limit_truncates_list() {
    let spec = ParseSpec {
        shape: Shape::List,
        list: Some(ListSpec {
            container: css(".toplist_list .list_ul li"),
            item: None,
        }),
        fields: fields(vec![("name", field(css("p.p1 a")))]),
        limit: Some(2),
        content_filters: Vec::new(),
    };
    let out = parse_html(JIUGANGBI_SEARCH, &spec, None).unwrap();
    assert_eq!(out.records.len(), 2);
}

#[test]
fn fallback_picks_second_when_first_misses() {
    let spec = ParseSpec {
        shape: Shape::List,
        list: Some(ListSpec {
            container: css(".toplist_list .list_ul li"),
            item: None,
        }),
        fields: fields(vec![(
            "name",
            field(SelectorExpr {
                engine: "css".into(),
                // 顶层逗号 = fallback:第一个选择器在条目内匹配不到,落到第二个。
                expr: "p.does-not-exist a,p.p1 a".into(),
                fallbacks: Vec::new(),
                extract: Extraction::Text,
                pipeline: Vec::new(),
            }),
        )]),
        limit: None,
        content_filters: Vec::new(),
    };
    let out = parse_html(JIUGANGBI_SEARCH, &spec, None).unwrap();
    assert_eq!(out.records[0]["name"].as_deref(), Some("剑来"));
}

// 形似旧钢笔章节目录(含 :gt(8) 伪类,取第 9 项之后)。
fn chapter_menu_html() -> String {
    let mut lis = String::new();
    for i in 0..12 {
        lis.push_str(&format!("<li><a href=\"/c{i}\">第{i}章</a></li>"));
    }
    format!(
        "<html><body><div class=\"indexyfw_listbox\"><div class=\"listchapter\"><ul>{lis}</ul></div></div></body></html>"
    )
}

#[test]
fn gt_pseudo_skips_leading_chapters() {
    // 容器 li:gt(8) 取索引 9/10/11 共 3 项(12 项跳过前 9),各项内取 <a> 文本与 href。
    let html = chapter_menu_html();
    let spec = ParseSpec {
        shape: Shape::List,
        list: Some(ListSpec {
            container: css(".indexyfw_listbox .listchapter ul li:gt(8)"),
            item: None,
        }),
        fields: fields(vec![
            ("title", field(css("a"))),
            ("url", field(css_attr("a", "href"))),
        ]),
        limit: None,
        content_filters: Vec::new(),
    };
    let out = parse_html(&html, &spec, None).unwrap();
    assert_eq!(out.records.len(), 3);
    assert_eq!(out.records[0]["title"].as_deref(), Some("第9章"));
    assert_eq!(out.records[0]["url"].as_deref(), Some("/c9"));
    assert_eq!(out.records[2]["url"].as_deref(), Some("/c11"));
}

#[test]
fn eq_pseudo_selects_single() {
    let html = r#"<html><body><div class="loc">
      <p><a href="/a">一</a></p>
      <p><a href="/b">二</a></p>
      <p><a href="/c">三</a></p>
    </div></body></html>"#;
    // .loc > p:eq(1) a → 第二个 p 内的 a。
    let spec = ParseSpec {
        shape: Shape::Page,
        list: None,
        fields: fields(vec![("title", field(css(".loc > p:eq(1) a")))]),
        limit: None,
        content_filters: Vec::new(),
    };
    let out = parse_html(html, &spec, None).unwrap();
    assert_eq!(out.records[0]["title"].as_deref(), Some("二"));
}

#[test]
fn required_missing_emits_warning() {
    let spec = ParseSpec {
        shape: Shape::Page,
        list: None,
        fields: fields(vec![(
            "title",
            FieldRule {
                selector: css(".nonexistent"),
                label: None,
                required: true,
            },
        )]),
        limit: None,
        content_filters: Vec::new(),
    };
    let out = parse_html("<html><body></body></html>", &spec, None).unwrap();
    assert_eq!(out.warnings.len(), 1);
    assert!(out.warnings[0].contains("title"));
}

// 形似七猫搜索 API 响应。
const QIMAO_SEARCH: &str = r#"{
  "data": {
    "search_list": [
      { "book_id": "111", "title": "剑来", "author": "烽火戏诸侯", "image_link": "http://x/1.jpg" },
      { "book_id": "222", "title": "大奉打更人", "author": "卖报小郎君", "image_link": "http://x/2.jpg" }
    ]
  }
}"#;

#[test]
fn parses_qimao_json_list_with_key_prefix() {
    let spec = ParseSpec {
        shape: Shape::List,
        list: Some(ListSpec {
            // 原始 key$$ 语法应被归一。
            container: jpath("key$$data.key$$search_list"),
            item: None,
        }),
        fields: fields(vec![
            ("name", field(jpath("key$$title"))),
            ("author", field(jpath("key$$author"))),
            ("book_id", field(jpath("key$$book_id"))),
            ("cover", field(jpath("key$$image_link"))),
        ]),
        limit: None,
        content_filters: Vec::new(),
    };
    let out = parse_json(QIMAO_SEARCH, &spec, None).unwrap();
    assert_eq!(out.records.len(), 2);
    assert_eq!(out.records[0]["name"].as_deref(), Some("剑来"));
    assert_eq!(out.records[0]["book_id"].as_deref(), Some("111"));
    assert_eq!(out.records[1]["name"].as_deref(), Some("大奉打更人"));
    assert!(out.warnings.is_empty());
}

#[test]
fn parses_json_page_with_dotted_index() {
    let spec = ParseSpec {
        shape: Shape::Page,
        list: None,
        fields: fields(vec![(
            "first_title",
            field(jpath("data.search_list.0.title")),
        )]),
        limit: None,
        content_filters: Vec::new(),
    };
    let out = parse_json(QIMAO_SEARCH, &spec, None).unwrap();
    assert_eq!(out.records[0]["first_title"].as_deref(), Some("剑来"));
}

#[test]
fn dispatch_routes_by_engine() {
    let json_spec = ParseSpec {
        shape: Shape::List,
        list: Some(ListSpec {
            container: jpath("data.search_list"),
            item: None,
        }),
        fields: fields(vec![("name", field(jpath("title")))]),
        limit: None,
        content_filters: Vec::new(),
    };
    let out = parse_document(QIMAO_SEARCH, &json_spec, None).unwrap();
    assert_eq!(out.records.len(), 2);

    let css_spec = ParseSpec {
        shape: Shape::List,
        list: Some(ListSpec {
            container: css(".toplist_list .list_ul li"),
            item: None,
        }),
        fields: fields(vec![("name", field(css("p.p1 a")))]),
        limit: None,
        content_filters: Vec::new(),
    };
    let out = parse_document(JIUGANGBI_SEARCH, &css_spec, None).unwrap();
    assert_eq!(out.records.len(), 3);
}

#[test]
fn deserializes_camel_case_parse_spec() {
    let json = r#"{
        "shape": "list",
        "list": { "container": { "engine": "css", "expr": ".list li" } },
        "fields": {
            "title": { "selector": { "engine": "css", "expr": "a", "extract": { "mode": "text" } }, "required": true },
            "url": { "selector": { "engine": "css", "expr": "a", "extract": { "mode": "attr", "name": "href" } } }
        },
        "limit": 7
    }"#;
    let spec: ParseSpec = serde_json::from_str(json).unwrap();
    assert_eq!(spec.shape, Shape::List);
    assert_eq!(spec.limit, Some(7));
    assert!(spec.list.is_some());
    assert_eq!(spec.fields.len(), 2);
    assert!(spec.fields["title"].required);
    match &spec.fields["url"].selector.extract {
        Extraction::Attr { name } => assert_eq!(name, "href"),
        _ => panic!("expected attr extraction"),
    }
}

#[test]
fn field_pipeline_resolves_relative_url_with_base() {
    // 抽取相对 href,经字段管线 resolveUrl + 解析层 base_url 转绝对。
    let html = r#"<html><body><div class="m"><a href="ch/1.html">章一</a></div></body></html>"#;
    let mut selector = css_attr(".m a", "href");
    selector.pipeline = vec![PipelineOp::ResolveUrl { base: None }];
    let spec = ParseSpec {
        shape: Shape::Page,
        list: None,
        fields: fields(vec![("url", field(selector))]),
        limit: None,
        content_filters: Vec::new(),
    };
    let out = parse_html(html, &spec, Some("http://www.jiugangbi.com/book/9/")).unwrap();
    assert_eq!(
        out.records[0]["url"].as_deref(),
        Some("http://www.jiugangbi.com/book/9/ch/1.html")
    );
}

#[test]
fn empty_selector_extracts_list_item_itself() {
    // 容器直接选到 <a>(旧钢笔 book_menu 形态),字段用空选择器取每项自身的 href/text。
    let html = r#"<html><body><div class="menu">
        <a href="/c1">第一章</a>
        <a href="/c2">第二章</a>
    </div></body></html>"#;
    let spec = ParseSpec {
        shape: Shape::List,
        list: Some(ListSpec {
            container: css(".menu a"),
            item: None,
        }),
        fields: fields(vec![
            ("url", field(css_attr("", "href"))),
            ("title", field(css(""))),
        ]),
        limit: None,
        content_filters: Vec::new(),
    };
    let out = parse_html(html, &spec, None).unwrap();
    assert_eq!(out.records.len(), 2);
    assert_eq!(out.records[0]["url"].as_deref(), Some("/c1"));
    assert_eq!(out.records[0]["title"].as_deref(), Some("第一章"));
    assert_eq!(out.records[1]["url"].as_deref(), Some("/c2"));
}

#[test]
fn field_pipeline_regex_cleans_text() {
    // 正文字段经字段管线 regex 清洗广告。
    let html = r#"<html><body><p class="t">正文(广告)结束</p></body></html>"#;
    let mut selector = css("p.t");
    selector.pipeline = vec![PipelineOp::Regex {
        pattern: r"\(.+?\)".into(),
        replace: Some(String::new()),
        flags: None,
        group: None,
    }];
    let spec = ParseSpec {
        shape: Shape::Page,
        list: None,
        fields: fields(vec![("body", field(selector))]),
        limit: None,
        content_filters: Vec::new(),
    };
    let out = parse_html(html, &spec, None).unwrap();
    assert_eq!(out.records[0]["body"].as_deref(), Some("正文结束"));
}
