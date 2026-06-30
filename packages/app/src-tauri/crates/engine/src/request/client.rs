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
        let follow = base_builder().redirect(Policy::limited(10)).build()?;
        let no_redirect = base_builder().redirect(Policy::none()).build()?;
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
        // 非 UTF-8 源(如旧钢笔 gb2312):查询里的非 ASCII(关键词、字面中文)需按目标
        // charset 百分号编码,否则 reqwest 会按 UTF-8 编码,网站收到乱码搜不到。
        let url = match &req.encoding {
            Some(enc) => encode_query_charset(&url, enc),
            None => url,
        };

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

    /// 下载一个 URL 的原始字节(图片/文件下载用,不解码为文本)。跟随重定向、走限速。
    /// 状态码不在此判定成败(返回 status,由调用方据 >=400 判失败),便于上层逐条记录。
    pub async fn download_bytes(&self, url: &str, timeout_ms: u64) -> EngineResult<DownloadedFile> {
        if url.trim().is_empty() {
            return Err(EngineError::InvalidRequest("URL 为空".into()));
        }
        self.limiter.acquire().await;
        let resp = self
            .follow
            .get(url)
            .timeout(Duration::from_millis(timeout_ms))
            .send()
            .await?;
        let status = resp.status().as_u16();
        let content_type = resp
            .headers()
            .get(CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .map(str::to_string);
        let bytes = resp.bytes().await?.to_vec();
        Ok(DownloadedFile {
            status,
            content_type,
            bytes,
        })
    }
}

/// 二进制下载结果(图片/文件;不解码为文本)。
#[derive(Debug, Clone)]
pub struct DownloadedFile {
    pub status: u16,
    pub content_type: Option<String>,
    pub bytes: Vec<u8>,
}

/// 默认 UA(部分站点拒绝无 UA 请求;书源未设 UA 时兜底,有自定义 UA 则覆盖)。
const DEFAULT_UA: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

/// reqwest 基础构造:对**响应头宽容**——真实站点(如七猫的 istio-envoy 网关)常发出
/// 不规范的合并头/多行头,hyper 严格解析会整条响应报错「invalid HTTP header parsed」;
/// curl 等宽容客户端能正常收。这里放开宽容选项,跳过坏头而非整体失败。
fn base_builder() -> reqwest::ClientBuilder {
    reqwest::Client::builder()
        .user_agent(DEFAULT_UA)
        .http1_allow_obsolete_multiline_headers_in_responses(true)
        .http1_allow_spaces_after_header_name_in_responses(true)
        .http1_ignore_invalid_headers_in_responses(true)
}

/// 按目标 charset 重编 URL 查询串里的非 ASCII 字符(百分号编码)。结构字符(& = ? %
/// 以及已有的 %XX)与 ASCII 原样保留;非 ASCII 用该 charset 的字节序列百分号编码。
/// 仅作用于查询(关键词所在);路径多为 ASCII,UTF-8 站点(encoding=None)不调用此函数。
fn encode_query_charset(url: &str, encoding_label: &str) -> String {
    let enc = match encoding_rs::Encoding::for_label(encoding_label.as_bytes()) {
        Some(e) if e != encoding_rs::UTF_8 => e,
        // UTF-8 或无法识别的标签:交给 reqwest 默认处理。
        _ => return url.to_string(),
    };
    let Some(qpos) = url.find('?') else {
        return url.to_string();
    };
    // 把 fragment(#...)从查询里分出来,不参与编码。
    let (head, rest) = url.split_at(qpos + 1);
    let (query, frag) = match rest.find('#') {
        Some(fpos) => (&rest[..fpos], &rest[fpos..]),
        None => (rest, ""),
    };

    let mut out = String::with_capacity(url.len());
    out.push_str(head);
    for ch in query.chars() {
        if ch.is_ascii() {
            out.push(ch);
        } else {
            let mut buf = [0u8; 4];
            let (bytes, _, _) = enc.encode(ch.encode_utf8(&mut buf));
            for b in bytes.iter() {
                out.push('%');
                out.push_str(&format!("{b:02X}"));
            }
        }
    }
    out.push_str(frag);
    out
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

    /// 把 %XX 序列按 GBK 解码回文本(校验编码正确,不硬编码字节)。
    fn percent_decode_gbk(s: &str) -> String {
        let mut bytes = Vec::new();
        let raw = s.as_bytes();
        let mut i = 0;
        while i < raw.len() {
            if raw[i] == b'%' && i + 2 < raw.len() {
                let hex = std::str::from_utf8(&raw[i + 1..i + 3]).unwrap();
                bytes.push(u8::from_str_radix(hex, 16).unwrap());
                i += 3;
            } else {
                bytes.push(raw[i]);
                i += 1;
            }
        }
        let (text, _, _) = encoding_rs::GBK.decode(&bytes);
        text.into_owned()
    }

    #[test]
    fn encodes_query_as_gb2312() {
        let out = encode_query_charset(
            "http://www.jiugangbi.com/modules/article/search.php?searchkey=剑来&an=搜索",
            "gb2312",
        );
        // 查询里不再有裸非 ASCII,结构字符保留。
        assert!(out.is_ascii());
        assert!(out.starts_with("http://www.jiugangbi.com/modules/article/search.php?searchkey="));
        assert!(out.contains("&an="));
        // %XX 按 GBK 解回应还原中文(关键词 + 字面「搜索」)。
        let decoded = percent_decode_gbk(&out);
        assert!(decoded.contains("剑来"), "decoded: {decoded}");
        assert!(decoded.contains("搜索"), "decoded: {decoded}");
    }

    #[test]
    fn utf8_and_unknown_labels_pass_through() {
        let url = "http://x.com/s?kw=剑来";
        assert_eq!(encode_query_charset(url, "utf-8"), url);
        assert_eq!(encode_query_charset(url, "not-a-charset"), url);
    }

    #[test]
    fn no_query_unchanged() {
        assert_eq!(
            encode_query_charset("http://x.com/path", "gb2312"),
            "http://x.com/path"
        );
    }

    #[test]
    fn ascii_query_unchanged_under_gb2312() {
        let url = "http://x.com/s?kw=hello&p=1";
        assert_eq!(encode_query_charset(url, "gb2312"), url);
    }
}
