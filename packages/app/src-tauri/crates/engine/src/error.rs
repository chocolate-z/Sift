use std::fmt;

pub type EngineResult<T> = Result<T, EngineError>;

/// 引擎错误。请求层目前只产生 HTTP / 参数两类;解析、管线层后续扩展变体。
#[derive(Debug)]
pub enum EngineError {
    /// 底层 HTTP 失败(连接、超时、协议、读取响应体等)。
    Http(reqwest::Error),
    /// 请求构造非法(空 URL、不合法的头等)。
    InvalidRequest(String),
}

impl fmt::Display for EngineError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            EngineError::Http(e) => write!(f, "HTTP 请求失败: {e}"),
            EngineError::InvalidRequest(m) => write!(f, "请求非法: {m}"),
        }
    }
}

impl std::error::Error for EngineError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            EngineError::Http(e) => Some(e),
            EngineError::InvalidRequest(_) => None,
        }
    }
}

impl From<reqwest::Error> for EngineError {
    fn from(e: reqwest::Error) -> Self {
        EngineError::Http(e)
    }
}

impl EngineError {
    /// 是否值得重试:连接失败、超时、发送阶段错误属瞬时故障,可重试;
    /// 参数非法不可重试。响应状态码(5xx/429)的重试判定在请求层另行处理。
    pub fn is_retryable(&self) -> bool {
        match self {
            EngineError::Http(e) => e.is_timeout() || e.is_connect() || e.is_request(),
            EngineError::InvalidRequest(_) => false,
        }
    }
}
