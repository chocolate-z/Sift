use std::time::{Duration, Instant};

use reqwest::header::{HeaderMap, CONTENT_TYPE, COOKIE};
use reqwest::redirect::Policy;

use super::encoding::decode_body;
use super::{FetchRequest, FetchResponse, HttpMethod, RateLimiter, RequestBody, UrlReplaceRule};
use crate::error::{EngineError, EngineResult};

/// 请求层入口。内部维护两个 reqwest client(跟随重定向 / 不跟随,redirect 策略
/// 只能在 client 级设置),共享一个限速器。超时为 per-request 设置。
pub struct HttpClient {
    follow: reqwest::Client,
    no_redirect: reqwest::Client,
    limiter: RateLimiter,
}

impl HttpClient {
    /// 以给定限速器构造。重定向上限 10 跳。
    pub fn new(limiter: RateLimiter) -> EngineResult<Self> {
        let follow = reqwest::Client::builder()
            .redirect(Policy::limited(10))
            .build()?;
        let no_redirect = reqwest::Client::builder()
            .redirect(Policy::none())
            .build()?;
        Ok(Self {
            follow,
            no_redirect,
            limiter,
        })
    }

    /// 不限速的 client(测试 / 单发请求)。
    pub fn unlimited() -> EngineResult<Self> {
        Self::new(RateLimiter::disabled())
    }

    /// 执行一次请求,含限速、重试、编码解码。重试覆盖 5xx/429 与瞬时网络错误。
    pub async fn fetch(&self, req: &FetchRequest) -> EngineResult<FetchResponse> {
        if req.url.trim().is_empty() {
            return Err(EngineError::InvalidRequest("URL 为空".into()));
        }
        let url = apply_url_replace(&req.url, &req.url_replace_rules);

        let mut attempt = 0u32;
        loop {
            self.limiter.acquire().await;
            match self.try_once(&url, req).await {
                Ok(resp) => {
                    if should_retry_status(resp.status) && attempt < req.retry.max {
                        attempt += 1;
                        backoff(req.retry.backoff_ms, attempt).await;
                        continue;
                    }
                    return Ok(resp);
                }
                Err(e) => {
                    if e.is_retryable() && attempt < req.retry.max {
                        attempt += 1;
                        backoff(req.retry.backoff_ms, attempt).await;
                        continue;
                    }
                    return Err(e);
                }
            }
        }
    }

    async fn try_once(&self, url: &str, req: &FetchRequest) -> EngineResult<FetchResponse> {
        let client = if req.follow_redirect {
            &self.follow
        } else {
            &self.no_redirect
        };
        let mut builder = match req.method {
            HttpMethod::Get => client.get(url),
            HttpMethod::Post => client.post(url),
        };
        builder = builder.timeout(Duration::from_millis(req.timeout_ms));
        for (name, value) in &req.headers {
            builder = builder.header(name, value);
        }
        if let Some(cookie) = &req.cookie {
            builder = builder.header(COOKIE, cookie);
        }
        if let Some(body) = &req.body {
            builder = apply_body(builder, body);
        }

        let started = Instant::now();
        let resp = builder.send().await?;
        let status = resp.status().as_u16();
        let final_url = resp.url().to_string();
        let content_type = resp
            .headers()
            .get(CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .map(str::to_string);
        let headers = collect_headers(resp.headers());
        let bytes = resp.bytes().await?;
        let (body, encoding_used) =
            decode_body(&bytes, req.encoding.as_deref(), content_type.as_deref());

        Ok(FetchResponse {
            status,
            final_url,
            headers,
            body,
            encoding_used,
            elapsed_ms: started.elapsed().as_millis() as u64,
        })
    }
}

/// 依次套用替换规则到 URL(line-B url_replace_rules)。
fn apply_url_replace(url: &str, rules: &[UrlReplaceRule]) -> String {
    let mut out = url.to_string();
    for rule in rules {
        out = out.replace(&rule.from, &rule.to);
    }
    out
}

/// 哪些响应状态码值得重试:429(限流)与 5xx(服务端错误)。
fn should_retry_status(status: u16) -> bool {
    status == 429 || (500..=599).contains(&status)
}

/// 线性退避:第 n 次重试等待 base * n 毫秒。base 为 0 不等待。
async fn backoff(base_ms: u64, attempt: u32) {
    if base_ms == 0 {
        return;
    }
    let delay = base_ms.saturating_mul(attempt as u64);
    tokio::time::sleep(Duration::from_millis(delay)).await;
}

fn apply_body(builder: reqwest::RequestBuilder, body: &RequestBody) -> reqwest::RequestBuilder {
    match body {
        RequestBody::Form { fields } => builder.form(fields),
        RequestBody::Json { json } => builder
            .header(CONTENT_TYPE, "application/json")
            .body(json.clone()),
        RequestBody::Raw { content_type, data } => builder
            .header(CONTENT_TYPE, content_type.clone())
            .body(data.clone()),
    }
}

fn collect_headers(headers: &HeaderMap) -> std::collections::BTreeMap<String, String> {
    headers
        .iter()
        .filter_map(|(k, v)| {
            v.to_str()
                .ok()
                .map(|v| (k.as_str().to_string(), v.to_string()))
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn url_replace_applies_in_order() {
        let rules = vec![UrlReplaceRule {
            from: "http://m".into(),
            to: "http://www".into(),
        }];
        let out = apply_url_replace("http://m.jiugangbi.com/x", &rules);
        assert_eq!(out, "http://www.jiugangbi.com/x");
    }

    #[test]
    fn url_replace_noop_without_rules() {
        let out = apply_url_replace("http://example.com", &[]);
        assert_eq!(out, "http://example.com");
    }

    #[test]
    fn retry_status_matches_5xx_and_429() {
        assert!(should_retry_status(500));
        assert!(should_retry_status(503));
        assert!(should_retry_status(429));
        assert!(!should_retry_status(404));
        assert!(!should_retry_status(200));
    }
}
