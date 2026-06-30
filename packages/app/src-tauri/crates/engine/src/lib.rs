//! Sift 采集引擎。点选 / 书源 / 手写三入口统一编译为 core-ir 的 Rule,
//! 引擎按层执行:请求层 → 解析层 → 管线层,多步骤调度串联。
//!
//! 本模块当前覆盖:
//! - 【请求层】静态 HTTP、自定义 header/Cookie、编码处理、302 重定向、超时/重试、
//!   限速、url_replace_rules。
//! - 【解析层】CSS(含 :gt/:lt/:eq 伪类转译)+ JSONPath(书源 key$$ 点号路径);
//!   列表/单页、fallback 备选、文本/属性/html 取值。XPath 待后续小步。
//! - 【管线层】值后处理:regex 清洗/抽取、base64 解码、urlReplace、resolveUrl、
//!   trim、join;脚本 op 留待 phase-3 沙箱。
//! - 【执行层】RequestConfig 降级:占位符模板替换、defaults 合并、凭据→Cookie。
//! - 【多步驱动】run_rule:按 steps 顺序串四层,变量穿线(inputs/produces + fanout
//!   绑定上游项)、fanout(once/perItem)、输出友好列装配。翻页留待后续小步。

pub mod driver;
pub mod error;
pub mod exec;
pub mod parse;
pub mod pipeline;
pub mod request;
pub mod rule;

pub use driver::{run_rule, RunOutput};
pub use error::{EngineError, EngineResult};
pub use exec::{lower_request, substitute, Credentials, RequestConfig, UrlSource, VarScope};
pub use parse::{
    ContentFilter, Extraction, FieldRule, ListSpec, ParseOutput, ParseSpec, Record, SelectorExpr,
    Shape,
};
pub use pipeline::{apply_pipeline, apply_pipeline_str, PipelineContext, PipelineOp};
pub use request::{
    DownloadedFile, FetchRequest, FetchResponse, HttpClient, HttpMethod, RateLimiter, RequestBody,
    RetryPolicy, UrlReplaceRule,
};
pub use rule::{
    CollectStep, EntryPoint, Fanout, OutputColumn, OutputSpec, Pagination, Rule, RuleMeta,
};
