//! Rule IR 的 Rust 镜像(core-ir rule/step/vars/pagination/output)。引擎只认这个
//! 结构;点选 / 书源 / 手写三入口都编译到它。仅建模 MVP 驱动需要的字段;phase-2/3
//! facet(scripts/capabilities/download/proxy…)由 serde 默认忽略,向前兼容。

use serde::{Deserialize, Serialize};

use crate::exec::RequestConfig;
use crate::parse::{ParseSpec, SelectorExpr};

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Rule {
    #[serde(default = "default_ir_version")]
    pub ir_version: u32,
    pub meta: RuleMeta,
    pub entry: EntryPoint,
    #[serde(default)]
    pub vars: Vec<VarDecl>,
    pub steps: Vec<CollectStep>,
    pub output: OutputSpec,
    /// 规则级请求默认值,每步 request 浅覆盖。
    #[serde(default)]
    pub defaults: Option<RequestConfig>,
}

fn default_ir_version() -> u32 {
    1
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuleMeta {
    pub id: String,
    pub name: String,
    /// 产出该 IR 的翻译器:visual-picker | book-source | handwritten。
    pub origin: String,
    /// api | web。
    pub source_type: String,
    #[serde(default)]
    pub source_url: Option<String>,
    #[serde(default)]
    pub remark: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum EntryPoint {
    /// 自洽 URL,无参数。
    None,
    /// 线 A:打开一个页面。
    Url {
        url: String,
        #[serde(default)]
        example: Option<String>,
    },
    /// 线 B:###keyword### 搜索。
    Keyword {
        param: String,
        #[serde(default)]
        example: Option<String>,
    },
    /// 通用多输入。
    Params { params: Vec<ParamSpec> },
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ParamSpec {
    pub name: String,
    pub required: bool,
    #[serde(default)]
    pub example: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VarDecl {
    pub name: String,
    /// input = 用户种子;produced = 由某步绑定。
    pub origin: String,
    #[serde(default)]
    pub required: Option<bool>,
    #[serde(default)]
    pub produced_by: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CollectStep {
    pub id: String,
    pub name: String,
    pub request: RequestConfig,
    pub parse: ParseSpec,
    /// 本步消费的占位符,生产者已解析。
    #[serde(default)]
    pub inputs: Vec<StepInput>,
    /// 本步导出给下游的变量。
    #[serde(default)]
    pub produces: Vec<VarBinding>,
    #[serde(default)]
    pub fanout: Option<Fanout>,
    #[serde(default)]
    pub pagination: Option<Pagination>,
    /// 缺数据 ⇒ 告警,不让整轮失败(line-B item 11)。
    #[serde(default)]
    pub optional: bool,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StepInput {
    pub name: String,
    pub from: StepInputFrom,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "lowercase",
    rename_all_fields = "camelCase"
)]
pub enum StepInputFrom {
    /// 用户种子变量。
    Input,
    /// 上游某步的字段。
    Step { step_id: String, field: String },
    /// 生产者未解析。
    Unknown,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VarBinding {
    /// 导出的变量名(book_id / item_id)。
    pub name: String,
    /// 本步中供值的字段键。
    pub from: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum Fanout {
    /// 搜索 / 单页步骤。
    Once,
    /// 对上游列表逐项执行一次。
    PerItem {
        over_step: String,
        #[serde(default)]
        as_var: Option<String>,
    },
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum Pagination {
    None,
    NextButton {
        next: SelectorExpr,
        /// 下一页元素文本含此串 ⇒ 已到底,停止。
        #[serde(default)]
        stop_text: Option<String>,
        /// 仅当下一页元素文本含此串才继续翻(line-B next_val);否则视为到底。
        #[serde(default)]
        require_text: Option<String>,
        #[serde(default)]
        max_pages: Option<u32>,
        #[serde(default)]
        combine: Option<PageCombine>,
    },
    PageParam {
        param: String,
        #[serde(default)]
        start: Option<i64>,
        #[serde(default)]
        step: Option<i64>,
        #[serde(default)]
        max_pages: Option<u32>,
        #[serde(default)]
        combine: Option<PageCombine>,
    },
    /// API 游标(phase-2)。
    Cursor {
        field: String,
        param: String,
        #[serde(default)]
        max_pages: Option<u32>,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum PageCombine {
    /// 目录翻页 = 累加列表项。
    AppendRows,
    /// 正文翻页 = 拼接一行的文本。
    AppendContent,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OutputSpec {
    #[serde(default = "default_format")]
    pub format: String,
    pub columns: Vec<OutputColumn>,
    #[serde(default)]
    pub track_provenance: Option<bool>,
    #[serde(default)]
    pub formats: Vec<String>,
}

fn default_format() -> String {
    "records".to_string()
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OutputColumn {
    /// 友好显示名。
    pub name: String,
    /// 映射的原始字段键。
    pub from_field: String,
    /// 产出该字段的步骤(provenance / 消歧同名键)。
    pub from_step: String,
    #[serde(default, rename = "type")]
    pub col_type: Option<String>,
}
