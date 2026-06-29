//! Sift 采集引擎。点选 / 书源 / 手写三入口统一编译为 core-ir 的 Rule,
//! 引擎按层执行:请求层 → 解析层 → 管线层,多步骤调度串联。
//!
//! 本模块当前覆盖【请求层】:静态 HTTP、自定义 header/Cookie、编码处理、
//! 302 重定向、超时/重试、限速、url_replace_rules。

pub mod error;
pub mod request;

pub use error::{EngineError, EngineResult};
pub use request::{
    FetchRequest, FetchResponse, HttpClient, HttpMethod, RateLimiter, RequestBody, RetryPolicy,
    UrlReplaceRule,
};
