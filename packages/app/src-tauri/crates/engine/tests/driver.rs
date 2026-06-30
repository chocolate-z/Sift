//! 多步驱动端到端测试。形似七猫:search(keyword)→ chapters(fanout perItem,
//! book_id 穿线)。本地 wiremock,不触达真实站点。验证变量穿线、fanout、字段下沉、
//! 输出友好列装配。

use sift_engine::{run_rule, HttpClient, Rule, VarScope};
use std::collections::BTreeMap;
use wiremock::matchers::{method, path, query_param};
use wiremock::{Mock, MockServer, ResponseTemplate};

fn rule_json(base: &str) -> String {
    // 两步:search 产 [{book_id,title}];chapters 对每个 book_id 取章节列表。
    // 输出列:书名 ← search.title(下沉),章节 ← chapters.title。
    format!(
        r#"{{
        "irVersion": 1,
        "meta": {{ "id": "qm", "name": "示例", "origin": "book-source", "sourceType": "api" }},
        "entry": {{ "kind": "keyword", "param": "kw" }},
        "vars": [],
        "steps": [
            {{
                "id": "search",
                "name": "搜索",
                "request": {{ "url": {{ "kind": "template", "template": "{base}/search?kw=###kw###" }} }},
                "parse": {{
                    "shape": "list",
                    "list": {{ "container": {{ "engine": "jsonpath", "expr": "data.list" }} }},
                    "fields": {{
                        "book_id": {{ "selector": {{ "engine": "jsonpath", "expr": "key$$book_id" }} }},
                        "name": {{ "selector": {{ "engine": "jsonpath", "expr": "key$$title" }} }}
                    }}
                }},
                "fanout": {{ "kind": "once" }}
            }},
            {{
                "id": "chapters",
                "name": "章节",
                "request": {{ "url": {{ "kind": "template", "template": "{base}/chapters?book_id=###book_id###" }} }},
                "parse": {{
                    "shape": "list",
                    "list": {{ "container": {{ "engine": "jsonpath", "expr": "data.chapters" }} }},
                    "fields": {{
                        "title": {{ "selector": {{ "engine": "jsonpath", "expr": "key$$title" }} }},
                        "idx": {{ "selector": {{ "engine": "jsonpath", "expr": "key$$idx" }} }}
                    }}
                }},
                "fanout": {{ "kind": "perItem", "overStep": "search" }}
            }}
        ],
        "output": {{
            "format": "records",
            "columns": [
                {{ "name": "书名", "fromField": "name", "fromStep": "search" }},
                {{ "name": "章节", "fromField": "title", "fromStep": "chapters" }}
            ]
        }}
    }}"#
    )
}

async fn mount_mocks(server: &MockServer) {
    Mock::given(method("GET"))
        .and(path("/search"))
        .respond_with(ResponseTemplate::new(200).set_body_string(
            r#"{"data":{"list":[
                {"book_id":"111","title":"剑来"},
                {"book_id":"222","title":"大奉打更人"}
            ]}}"#,
        ))
        .mount(server)
        .await;
    Mock::given(method("GET"))
        .and(path("/chapters"))
        .and(query_param("book_id", "111"))
        .respond_with(ResponseTemplate::new(200).set_body_string(
            r#"{"data":{"chapters":[
                {"title":"第一章","idx":"1"},
                {"title":"第二章","idx":"2"}
            ]}}"#,
        ))
        .mount(server)
        .await;
    Mock::given(method("GET"))
        .and(path("/chapters"))
        .and(query_param("book_id", "222"))
        .respond_with(
            ResponseTemplate::new(200)
                .set_body_string(r#"{"data":{"chapters":[{"title":"楔子","idx":"0"}]}}"#),
        )
        .mount(server)
        .await;
}

#[tokio::test]
async fn runs_two_step_chain_with_fanout_and_var_threading() {
    let server = MockServer::start().await;
    mount_mocks(&server).await;

    let rule: Rule = serde_json::from_str(&rule_json(&server.uri())).unwrap();
    let client = HttpClient::unlimited().unwrap();
    let mut inputs = VarScope::new();
    inputs.insert("kw".into(), "剑来".into());

    let out = run_rule(&client, &rule, inputs, &BTreeMap::new())
        .await
        .unwrap();

    // 2 本书 → 2+1 = 3 章节记录。
    assert_eq!(out.records.len(), 3, "warnings: {:?}", out.warnings);
    // 首行:剑来 / 第一章(书名经 fanout 字段下沉)。
    assert_eq!(out.records[0]["书名"].as_deref(), Some("剑来"));
    assert_eq!(out.records[0]["章节"].as_deref(), Some("第一章"));
    assert_eq!(out.records[1]["章节"].as_deref(), Some("第二章"));
    // 第三行来自第二本书。
    assert_eq!(out.records[2]["书名"].as_deref(), Some("大奉打更人"));
    assert_eq!(out.records[2]["章节"].as_deref(), Some("楔子"));

    // 原始每步记录可供调试。
    assert_eq!(out.step_records["search"].len(), 2);
    assert_eq!(out.step_records["chapters"].len(), 3);
}

#[tokio::test]
async fn missing_keyword_errors_clearly() {
    let server = MockServer::start().await;
    mount_mocks(&server).await;
    let rule: Rule = serde_json::from_str(&rule_json(&server.uri())).unwrap();
    let client = HttpClient::unlimited().unwrap();

    // 不提供 kw:搜索 URL 的 ###kw### 无法解析,run_rule 明确报错(而非带着字面占位符乱跑)。
    let err = run_rule(&client, &rule, VarScope::new(), &BTreeMap::new())
        .await
        .unwrap_err();
    assert!(err.to_string().contains("kw"), "{err}");
}

#[tokio::test]
async fn page_param_pagination_accumulates_rows() {
    let server = MockServer::start().await;
    for (pg, body) in [
        (1, r#"{"data":{"list":[{"title":"A"},{"title":"B"}]}}"#),
        (2, r#"{"data":{"list":[{"title":"C"}]}}"#),
        (3, r#"{"data":{"list":[]}}"#),
    ] {
        Mock::given(method("GET"))
            .and(path("/list"))
            .and(query_param("page", pg.to_string()))
            .respond_with(ResponseTemplate::new(200).set_body_string(body))
            .mount(&server)
            .await;
    }

    let rule_json = format!(
        r#"{{
        "irVersion": 1,
        "meta": {{ "id": "pg", "name": "翻页", "origin": "handwritten", "sourceType": "api" }},
        "entry": {{ "kind": "none" }},
        "steps": [{{
            "id": "list", "name": "列表",
            "request": {{ "url": {{ "kind": "template", "template": "{base}/list" }} }},
            "parse": {{
                "shape": "list",
                "list": {{ "container": {{ "engine": "jsonpath", "expr": "data.list" }} }},
                "fields": {{ "title": {{ "selector": {{ "engine": "jsonpath", "expr": "key$$title" }} }} }}
            }},
            "pagination": {{ "kind": "pageParam", "param": "page", "start": 1, "maxPages": 5 }}
        }}],
        "output": {{ "format": "records", "columns": [{{ "name": "标题", "fromField": "title", "fromStep": "list" }}] }}
    }}"#,
        base = server.uri()
    );
    let rule: Rule = serde_json::from_str(&rule_json).unwrap();
    let client = HttpClient::unlimited().unwrap();
    let out = run_rule(&client, &rule, VarScope::new(), &BTreeMap::new())
        .await
        .unwrap();
    // 第 1 页 2 行 + 第 2 页 1 行,第 3 页空 → 停;共 3 行。
    assert_eq!(out.records.len(), 3, "warnings: {:?}", out.warnings);
    assert_eq!(out.records[0]["标题"].as_deref(), Some("A"));
    assert_eq!(out.records[2]["标题"].as_deref(), Some("C"));
}

#[tokio::test]
async fn web_catalog_chain_extracts_chapters_via_self_selector() {
    // 旧钢笔形态:搜索(HTML 书单,抽 book_url)→ 目录(fanout,book_menu 直取章节链接)。
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/search"))
        .respond_with(ResponseTemplate::new(200).set_body_string(format!(
            r#"<html><body><div class="list">
                <div class="row"><span class="t">剑来</span><a class="bk" href="{base}/book/1">详情</a></div>
                <div class="row"><span class="t">大奉打更人</span><a class="bk" href="{base}/book/2">详情</a></div>
            </div></body></html>"#,
            base = server.uri()
        )))
        .mount(&server)
        .await;
    Mock::given(method("GET"))
        .and(path("/book/1"))
        .respond_with(ResponseTemplate::new(200).set_body_string(
            r#"<html><body><div class="menu"><a href="/ch/1">第一章</a><a href="/ch/2">第二章</a></div></body></html>"#,
        ))
        .mount(&server)
        .await;
    Mock::given(method("GET"))
        .and(path("/book/2"))
        .respond_with(ResponseTemplate::new(200).set_body_string(
            r#"<html><body><div class="menu"><a href="/ch/9">楔子</a></div></body></html>"#,
        ))
        .mount(&server)
        .await;

    let rule_json = format!(
        r####"{{
        "irVersion": 1,
        "meta": {{ "id": "jgb", "name": "网页源", "origin": "book-source", "sourceType": "web" }},
        "entry": {{ "kind": "keyword", "param": "kw" }},
        "steps": [
            {{
                "id": "search", "name": "搜索",
                "request": {{ "url": {{ "kind": "template", "template": "{base}/search?kw=###kw###" }} }},
                "parse": {{
                    "shape": "list",
                    "list": {{ "container": {{ "engine": "css", "expr": ".list .row" }} }},
                    "fields": {{
                        "name": {{ "selector": {{ "engine": "css", "expr": ".t" }} }},
                        "book_url": {{ "selector": {{ "engine": "css", "expr": "a.bk", "extract": {{ "mode": "attr", "name": "href" }} }} }}
                    }}
                }},
                "fanout": {{ "kind": "once" }}
            }},
            {{
                "id": "catalog", "name": "目录",
                "request": {{ "url": {{ "kind": "template", "template": "###book_url###" }} }},
                "parse": {{
                    "shape": "list",
                    "list": {{ "container": {{ "engine": "css", "expr": ".menu a" }} }},
                    "fields": {{
                        "chapter_name": {{ "selector": {{ "engine": "css", "expr": "" }} }},
                        "chapter_url": {{ "selector": {{ "engine": "css", "expr": "", "extract": {{ "mode": "attr", "name": "href" }}, "pipeline": [{{ "op": "resolveUrl" }}] }} }}
                    }}
                }},
                "fanout": {{ "kind": "perItem", "overStep": "search" }}
            }}
        ],
        "output": {{
            "format": "records",
            "columns": [
                {{ "name": "书名", "fromField": "name", "fromStep": "search" }},
                {{ "name": "章节", "fromField": "chapter_name", "fromStep": "catalog" }},
                {{ "name": "链接", "fromField": "chapter_url", "fromStep": "catalog" }}
            ]
        }}
    }}"####,
        base = server.uri()
    );
    let rule: Rule = serde_json::from_str(&rule_json).unwrap();
    let client = HttpClient::unlimited().unwrap();
    let mut inputs = VarScope::new();
    inputs.insert("kw".into(), "剑来".into());
    let out = run_rule(&client, &rule, inputs, &BTreeMap::new())
        .await
        .unwrap();

    // 书1 两章 + 书2 一章 = 3 行;书名经 fanout 下沉,章节经空选择器自取。
    assert_eq!(out.records.len(), 3, "warnings: {:?}", out.warnings);
    assert_eq!(out.records[0]["书名"].as_deref(), Some("剑来"));
    assert_eq!(out.records[0]["章节"].as_deref(), Some("第一章"));
    // 相对 href 经 resolveUrl 按目录页 final_url 解析为绝对。
    assert_eq!(
        out.records[0]["链接"].as_deref(),
        Some(format!("{}/ch/1", server.uri()).as_str())
    );
    assert_eq!(out.records[2]["书名"].as_deref(), Some("大奉打更人"));
    assert_eq!(out.records[2]["章节"].as_deref(), Some("楔子"));
}

#[tokio::test]
async fn next_button_pagination_follows_links() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/p1"))
        .respond_with(ResponseTemplate::new(200).set_body_string(
            r#"<html><body>
                <div class="row"><span class="t">A</span></div>
                <div class="row"><span class="t">B</span></div>
                <a class="next" href="/p2">下一页</a>
            </body></html>"#,
        ))
        .mount(&server)
        .await;
    Mock::given(method("GET"))
        .and(path("/p2"))
        .respond_with(ResponseTemplate::new(200).set_body_string(
            r#"<html><body><div class="row"><span class="t">C</span></div></body></html>"#,
        ))
        .mount(&server)
        .await;

    let rule_json = format!(
        r#"{{
        "irVersion": 1,
        "meta": {{ "id": "nb", "name": "翻页", "origin": "book-source", "sourceType": "web" }},
        "entry": {{ "kind": "none" }},
        "steps": [{{
            "id": "pages", "name": "翻页",
            "request": {{ "url": {{ "kind": "static", "url": "{base}/p1" }} }},
            "parse": {{
                "shape": "list",
                "list": {{ "container": {{ "engine": "css", "expr": ".row" }} }},
                "fields": {{ "title": {{ "selector": {{ "engine": "css", "expr": ".t" }} }} }}
            }},
            "pagination": {{
                "kind": "nextButton",
                "next": {{ "engine": "css", "expr": ".next", "extract": {{ "mode": "attr", "name": "href" }} }},
                "maxPages": 5
            }}
        }}],
        "output": {{ "format": "records", "columns": [{{ "name": "标题", "fromField": "title", "fromStep": "pages" }}] }}
    }}"#,
        base = server.uri()
    );
    let rule: Rule = serde_json::from_str(&rule_json).unwrap();
    let client = HttpClient::unlimited().unwrap();
    let out = run_rule(&client, &rule, VarScope::new(), &BTreeMap::new())
        .await
        .unwrap();
    // p1 跟随 .next → p2,p2 无 .next → 停;共 A/B/C 三行。
    assert_eq!(out.records.len(), 3, "warnings: {:?}", out.warnings);
    assert_eq!(out.records[0]["标题"].as_deref(), Some("A"));
    assert_eq!(out.records[2]["标题"].as_deref(), Some("C"));
}

#[tokio::test]
async fn next_button_require_text_stops_when_text_changes() {
    // 正文翻页 next_val:正常页「下一页」按钮文本为「下一页」才继续;末页按钮变「下一章」
    // (指向下一章)→ requireText 不匹配即止,不把下一章正文误并进本章。
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/p1"))
        .respond_with(ResponseTemplate::new(200).set_body_string(
            r#"<html><body>
                <div class="row"><span class="t">A</span></div>
                <a class="next" href="/p2">下一页</a>
            </body></html>"#,
        ))
        .mount(&server)
        .await;
    Mock::given(method("GET"))
        .and(path("/p2"))
        .respond_with(ResponseTemplate::new(200).set_body_string(
            r#"<html><body>
                <div class="row"><span class="t">B</span></div>
                <a class="next" href="/p3">下一章</a>
            </body></html>"#,
        ))
        .mount(&server)
        .await;
    Mock::given(method("GET"))
        .and(path("/p3"))
        .respond_with(ResponseTemplate::new(200).set_body_string(
            r#"<html><body><div class="row"><span class="t">WRONG</span></div></body></html>"#,
        ))
        .mount(&server)
        .await;

    let rule_json = format!(
        r#"{{
        "irVersion": 1,
        "meta": {{ "id": "nb", "name": "翻页", "origin": "book-source", "sourceType": "web" }},
        "entry": {{ "kind": "none" }},
        "steps": [{{
            "id": "pages", "name": "翻页",
            "request": {{ "url": {{ "kind": "static", "url": "{base}/p1" }} }},
            "parse": {{
                "shape": "list",
                "list": {{ "container": {{ "engine": "css", "expr": ".row" }} }},
                "fields": {{ "title": {{ "selector": {{ "engine": "css", "expr": ".t" }} }} }}
            }},
            "pagination": {{
                "kind": "nextButton",
                "next": {{ "engine": "css", "expr": ".next", "extract": {{ "mode": "attr", "name": "href" }} }},
                "requireText": "下一页",
                "maxPages": 5
            }}
        }}],
        "output": {{ "format": "records", "columns": [{{ "name": "标题", "fromField": "title", "fromStep": "pages" }}] }}
    }}"#,
        base = server.uri()
    );
    let rule: Rule = serde_json::from_str(&rule_json).unwrap();
    let client = HttpClient::unlimited().unwrap();
    let out = run_rule(&client, &rule, VarScope::new(), &BTreeMap::new())
        .await
        .unwrap();
    // p1 文本「下一页」→ 跟随到 p2;p2 文本「下一章」≠ requireText → 止于 p2,不抓 p3。
    assert_eq!(out.records.len(), 2, "warnings: {:?}", out.warnings);
    assert_eq!(out.records[0]["标题"].as_deref(), Some("A"));
    assert_eq!(out.records[1]["标题"].as_deref(), Some("B"));
    assert!(out.records.iter().all(|r| r["标题"].as_deref() != Some("WRONG")));
}

#[tokio::test]
async fn run_rule_emits_step_traces() {
    // 调试台用:每步轨迹带请求 URL / HTTP 状态 / 产出条数 / 执行次数。
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/list"))
        .respond_with(ResponseTemplate::new(200).set_body_string(
            r#"<html><body>
                <div class="row"><span class="t">甲</span></div>
                <div class="row"><span class="t">乙</span></div>
            </body></html>"#,
        ))
        .mount(&server)
        .await;

    let rule_json = format!(
        r#"{{
        "irVersion": 1,
        "meta": {{ "id": "t", "name": "轨迹", "origin": "handwritten", "sourceType": "web" }},
        "entry": {{ "kind": "none" }},
        "steps": [{{
            "id": "list", "name": "列表",
            "request": {{ "url": {{ "kind": "static", "url": "{base}/list" }} }},
            "parse": {{
                "shape": "list",
                "list": {{ "container": {{ "engine": "css", "expr": ".row" }} }},
                "fields": {{ "title": {{ "selector": {{ "engine": "css", "expr": ".t" }} }} }}
            }}
        }}],
        "output": {{ "format": "records", "columns": [{{ "name": "标题", "fromField": "title", "fromStep": "list" }}] }}
    }}"#,
        base = server.uri()
    );
    let rule: Rule = serde_json::from_str(&rule_json).unwrap();
    let client = HttpClient::unlimited().unwrap();
    let out = run_rule(&client, &rule, VarScope::new(), &BTreeMap::new())
        .await
        .unwrap();

    assert_eq!(out.traces.len(), 1);
    let tr = &out.traces[0];
    assert_eq!(tr.step_id, "list");
    assert_eq!(tr.label, "列表");
    assert_eq!(tr.http_status, 200);
    assert_eq!(tr.record_count, 2);
    assert_eq!(tr.exec_count, 1);
    assert!(tr.request_url.ends_with("/list"), "url: {}", tr.request_url);
}

#[tokio::test]
async fn download_streamed_fetches_raw_file_with_progress() {
    let server = MockServer::start().await;
    let body: Vec<u8> = vec![0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]; // 伪 PNG 头 + 数据
    Mock::given(method("GET"))
        .and(path("/cover.png"))
        .respond_with(
            ResponseTemplate::new(200)
                .insert_header("content-type", "image/png")
                .set_body_bytes(body.clone()),
        )
        .mount(&server)
        .await;

    let client = HttpClient::unlimited().unwrap();
    let mut last_downloaded = 0u64;
    let mut total_seen: Option<u64> = None;
    let f = client
        .download_streamed(&format!("{}/cover.png", server.uri()), 10_000, |d, t| {
            last_downloaded = d;
            total_seen = t;
        })
        .await
        .unwrap();
    assert_eq!(f.status, 200);
    assert_eq!(f.bytes, body);
    assert_eq!(f.content_type.as_deref(), Some("image/png"));
    // 进度回调跑过:最终 downloaded == 文件大小,total 来自 Content-Length。
    assert_eq!(last_downloaded, body.len() as u64);
    assert_eq!(total_seen, Some(body.len() as u64));
}
