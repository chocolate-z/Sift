//! 请求层端到端测试:在本地起一个 mock HTTP 服务,验证 header/Cookie 透传、
//! GB2312 解码、302 跟随、5xx 重试、超时。不触达任何真实站点。

use std::collections::BTreeMap;
use std::time::Duration;

use sift_engine::{FetchRequest, HttpClient, HttpMethod, RetryPolicy};
use wiremock::matchers::{header, method, path};
use wiremock::{Mock, MockServer, ResponseTemplate};

fn gbk_bytes(s: &str) -> Vec<u8> {
    let (bytes, _, had_errors) = encoding_rs::GBK.encode(s);
    assert!(!had_errors);
    bytes.into_owned()
}

#[tokio::test]
async fn sends_custom_headers_and_cookie() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/p"))
        .and(header("x-test", "1"))
        .and(header("cookie", "sid=abc"))
        .respond_with(ResponseTemplate::new(200).set_body_string("ok"))
        .expect(1)
        .mount(&server)
        .await;

    let client = HttpClient::unlimited().unwrap();
    let mut headers = BTreeMap::new();
    headers.insert("X-Test".to_string(), "1".to_string());
    let req = FetchRequest {
        url: format!("{}/p", server.uri()),
        headers,
        cookie: Some("sid=abc".to_string()),
        ..FetchRequest::get("")
    };

    let resp = client.fetch(&req).await.unwrap();
    assert_eq!(resp.status, 200);
    assert_eq!(resp.body, "ok");
}

#[tokio::test]
async fn decodes_gb2312_from_content_type() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/gb"))
        .respond_with(
            ResponseTemplate::new(200)
                .set_body_raw(gbk_bytes("你好世界"), "text/html; charset=gb2312"),
        )
        .mount(&server)
        .await;

    let client = HttpClient::unlimited().unwrap();
    let resp = client
        .fetch(&FetchRequest::get(format!("{}/gb", server.uri())))
        .await
        .unwrap();
    assert_eq!(resp.body, "你好世界");
    assert_eq!(resp.encoding_used, "GBK");
}

#[tokio::test]
async fn explicit_encoding_decodes_unlabeled_gb2312() {
    let server = MockServer::start().await;
    // 服务端不声明 charset,靠规则里的 {{gb2312}} 显式指定。
    Mock::given(method("GET"))
        .and(path("/raw"))
        .respond_with(ResponseTemplate::new(200).set_body_raw(gbk_bytes("旧钢笔文学"), "text/html"))
        .mount(&server)
        .await;

    let client = HttpClient::unlimited().unwrap();
    let req = FetchRequest {
        encoding: Some("gb2312".to_string()),
        ..FetchRequest::get(format!("{}/raw", server.uri()))
    };
    let resp = client.fetch(&req).await.unwrap();
    assert_eq!(resp.body, "旧钢笔文学");
}

#[tokio::test]
async fn follows_redirect_when_enabled() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/from"))
        .respond_with(
            ResponseTemplate::new(302).insert_header("Location", format!("{}/to", server.uri())),
        )
        .mount(&server)
        .await;
    Mock::given(method("GET"))
        .and(path("/to"))
        .respond_with(ResponseTemplate::new(200).set_body_string("arrived"))
        .mount(&server)
        .await;

    let client = HttpClient::unlimited().unwrap();
    let resp = client
        .fetch(&FetchRequest::get(format!("{}/from", server.uri())))
        .await
        .unwrap();
    assert_eq!(resp.status, 200);
    assert_eq!(resp.body, "arrived");
    assert!(resp.final_url.ends_with("/to"));
}

#[tokio::test]
async fn does_not_follow_redirect_when_disabled() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/from"))
        .respond_with(
            ResponseTemplate::new(302).insert_header("Location", format!("{}/to", server.uri())),
        )
        .mount(&server)
        .await;

    let client = HttpClient::unlimited().unwrap();
    let req = FetchRequest {
        follow_redirect: false,
        ..FetchRequest::get(format!("{}/from", server.uri()))
    };
    let resp = client.fetch(&req).await.unwrap();
    assert_eq!(resp.status, 302);
    assert_eq!(
        resp.headers.get("location"),
        Some(&format!("{}/to", server.uri()))
    );
}

#[tokio::test]
async fn retries_on_500_then_succeeds() {
    let server = MockServer::start().await;
    // 首个匹配(高优先级)只命中一次返回 500,之后落到 200 兜底。
    Mock::given(method("GET"))
        .and(path("/retry"))
        .respond_with(ResponseTemplate::new(500))
        .up_to_n_times(1)
        .with_priority(1)
        .mount(&server)
        .await;
    Mock::given(method("GET"))
        .and(path("/retry"))
        .respond_with(ResponseTemplate::new(200).set_body_string("recovered"))
        .with_priority(2)
        .mount(&server)
        .await;

    let client = HttpClient::unlimited().unwrap();
    let req = FetchRequest {
        retry: RetryPolicy {
            max: 2,
            backoff_ms: 0,
        },
        ..FetchRequest::get(format!("{}/retry", server.uri()))
    };
    let resp = client.fetch(&req).await.unwrap();
    assert_eq!(resp.status, 200);
    assert_eq!(resp.body, "recovered");
}

#[tokio::test]
async fn gives_up_after_max_retries() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/always500"))
        .respond_with(ResponseTemplate::new(500))
        .mount(&server)
        .await;

    let client = HttpClient::unlimited().unwrap();
    let req = FetchRequest {
        retry: RetryPolicy {
            max: 2,
            backoff_ms: 0,
        },
        ..FetchRequest::get(format!("{}/always500", server.uri()))
    };
    let resp = client.fetch(&req).await.unwrap();
    assert_eq!(resp.status, 500);
}

#[tokio::test]
async fn times_out_on_slow_response() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/slow"))
        .respond_with(ResponseTemplate::new(200).set_delay(Duration::from_millis(800)))
        .mount(&server)
        .await;

    let client = HttpClient::unlimited().unwrap();
    let req = FetchRequest {
        timeout_ms: 100,
        ..FetchRequest::get(format!("{}/slow", server.uri()))
    };
    let err = client.fetch(&req).await.unwrap_err();
    assert!(err.is_retryable(), "超时应判定为可重试: {err}");
}

#[tokio::test]
async fn empty_url_is_invalid() {
    let client = HttpClient::unlimited().unwrap();
    let err = client.fetch(&FetchRequest::get("   ")).await.unwrap_err();
    assert!(!err.is_retryable());
}

#[test]
fn deserializes_camel_case_ir_shape() {
    // 证明 IR(core-ir RequestConfig 的已解析形态)能直接 serde 反序列化进 FetchRequest。
    let json = r#"{
        "url": "https://example.com/s?kw=x",
        "method": "POST",
        "headers": { "User-Agent": "Sift/0.1" },
        "encoding": "gb2312",
        "followRedirect": true,
        "timeoutMs": 6000,
        "retry": { "max": 3, "backoffMs": 200 },
        "urlReplaceRules": [{ "from": "http://m", "to": "http://www" }],
        "body": { "kind": "form", "fields": { "searchkey": "剑来" } }
    }"#;
    let req: FetchRequest = serde_json::from_str(json).unwrap();
    assert_eq!(req.method, HttpMethod::Post);
    assert_eq!(req.timeout_ms, 6000);
    assert_eq!(req.retry.max, 3);
    assert_eq!(req.retry.backoff_ms, 200);
    assert_eq!(req.url_replace_rules.len(), 1);
    assert_eq!(req.encoding.as_deref(), Some("gb2312"));
}
