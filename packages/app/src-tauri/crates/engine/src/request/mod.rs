//! 请求层(core-ir §5.1 ①)。输入是一个**已解析**的请求(URL 模板/抽取、
//! 凭据引用都已在调度层解析为具体值),输出统一的 `FetchResponse`。
//!
//! 字段与 `@sift/core-ir` 的 `RequestConfig` 对齐(camelCase),便于 IR 直接反序列化。
//! 限速跨请求共享,挂在 `HttpClient` 上;`rateLimit` 由调度层据规则配置到 client。

mod client;
mod encoding;
mod rate_limit;

pub use client::{DownloadedFile, HttpClient};
pub use rate_limit::RateLimiter;

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

/// HTTP 方法。MVP 仅 GET/POST(书源搜索多为 GET,POST 表单/JSON 已建模待验证)。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Deserialize, Serialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum HttpMethod {
    #[default]
    Get,
    Post,
}

/// POST 请求体(core-ir RequestBody)。templated 值在调度层已展开。
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum RequestBody {
    /// 表单(application/x-www-form-urlencoded)。
    Form { fields: BTreeMap<String, String> },
    /// 预序列化 JSON 字符串。
    Json { json: String },
    /// 原始体 + 自定义 Content-Type。
    Raw {
        #[serde(rename = "contentType")]
        content_type: String,
        data: String,
    },
}

/// url_replace_rules 单条(`%%` 分隔,line-B item 9)。作用于请求 URL。
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct UrlReplaceRule {
    pub from: String,
    pub to: String,
}

/// 重试策略(core-ir RetryPolicy)。`max` 为额外重试次数,0 表示不重试。
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RetryPolicy {
    pub max: u32,
    #[serde(default = "default_backoff_ms")]
    pub backoff_ms: u64,
}

impl Default for RetryPolicy {
    fn default() -> Self {
        Self {
            max: 0,
            backoff_ms: default_backoff_ms(),
        }
    }
}

fn default_backoff_ms() -> u64 {
    300
}

fn default_follow_redirect() -> bool {
    true
}

fn default_timeout_ms() -> u64 {
    30_000
}

/// 已解析的单次请求。`url` 为具体地址(无 ###占位###);`cookie` 由 `credentialRef`
/// 在调度层从加密库解析而来,请求层不接触明文存储。
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchRequest {
    pub url: String,
    #[serde(default)]
    pub method: HttpMethod,
    #[serde(default)]
    pub headers: BTreeMap<String, String>,
    #[serde(default)]
    pub cookie: Option<String>,
    #[serde(default)]
    pub body: Option<RequestBody>,
    /// 响应解码,如 "gb2312"(line-B {{gb2312}})。缺省按 Content-Type / UTF-8。
    #[serde(default)]
    pub encoding: Option<String>,
    /// 是否跟随 30x(line-B {{302}})。缺省跟随。
    #[serde(default = "default_follow_redirect")]
    pub follow_redirect: bool,
    #[serde(default = "default_timeout_ms")]
    pub timeout_ms: u64,
    #[serde(default)]
    pub retry: RetryPolicy,
    #[serde(default)]
    pub url_replace_rules: Vec<UrlReplaceRule>,
}

impl FetchRequest {
    /// 便捷构造:对 `url` 发 GET,其余取默认。
    pub fn get(url: impl Into<String>) -> Self {
        Self {
            url: url.into(),
            method: HttpMethod::Get,
            headers: BTreeMap::new(),
            cookie: None,
            body: None,
            encoding: None,
            follow_redirect: true,
            timeout_ms: default_timeout_ms(),
            retry: RetryPolicy::default(),
            url_replace_rules: Vec::new(),
        }
    }
}

/// 统一响应。`body` 已按确定编码解码为文本;`encoding_used` 记录实际所用编码。
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchResponse {
    pub status: u16,
    /// 跟随重定向后的最终 URL。
    pub final_url: String,
    pub headers: BTreeMap<String, String>,
    pub body: String,
    pub encoding_used: String,
    pub elapsed_ms: u64,
}
