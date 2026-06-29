//! 解析层(core-ir §5.1 ②、§5.2②)。按每个 `SelectorExpr` 的 `engine` 标签分派
//! 到对应引擎(parser-plugin 接缝)。本步覆盖 **CSS(含伪类)+ JSONPath**;
//! XPath 两个真实源均未使用,作为解析层后续小步实现(见 `parse_document`)。
//!
//! 字段抽取后按 `SelectorExpr.pipeline` 跑管线层(regex/base64/resolveUrl…),
//! 故解析产出的是**最终值**;`resolveUrl` 的基址由 `base_url`(响应 final_url)给入。
//! 字段与 `@sift/core-ir` 的 `ParseSpec` 对齐(camelCase)。

mod css;
pub mod json;
pub mod pseudo;

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::error::{EngineError, EngineResult};
use crate::pipeline::{apply_pipeline, PipelineContext, PipelineOp};

/// 一条记录:友好字段名 → 值(None 表示未命中)。
pub type Record = BTreeMap<String, Option<String>>;

/// 解析输出:记录集 + 非致命告警(无效选择器、必填缺失等)。
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct ParseOutput {
    pub records: Vec<Record>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Shape {
    /// 单记录(书详情 / 正文)。
    Page,
    /// 重复列集(line-A 重复结构 / line-B 结果列表)。
    List,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ParseSpec {
    pub shape: Shape,
    #[serde(default)]
    pub list: Option<ListSpec>,
    pub fields: BTreeMap<String, FieldRule>,
    #[serde(default)]
    pub limit: Option<usize>,
    #[serde(default)]
    pub content_filters: Vec<ContentFilter>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ListSpec {
    /// 列表容器(line-B `list` 直接匹配各项时即各项选择器)。
    pub container: SelectorExpr,
    /// 相对容器匹配单个项的选择器;缺省则容器选择器直接产出各项。
    #[serde(default)]
    pub item: Option<SelectorExpr>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SelectorExpr {
    /// 分派键:css | xpath | jsonpath。
    pub engine: String,
    /// CSS(可含 :gt/:lt/:eq)/ XPath / 点号 JSONPath。
    pub expr: String,
    /// 备选(line-B item 8,逗号切分),首个命中即止。
    #[serde(default)]
    pub fallbacks: Vec<String>,
    /// 取值方式:文本(默认)/ 属性 / html。
    #[serde(default)]
    pub extract: Extraction,
    /// 取值后处理管线(regex/base64/resolveUrl…)。多值经 join 可折叠为一串。
    #[serde(default)]
    pub pipeline: Vec<PipelineOp>,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(tag = "mode", rename_all = "lowercase")]
pub enum Extraction {
    #[default]
    Text,
    Attr {
        name: String,
    },
    Html,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FieldRule {
    pub selector: SelectorExpr,
    #[serde(default)]
    pub label: Option<String>,
    #[serde(default)]
    pub required: bool,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContentFilter {
    /// 已 Base64 解码的模式(由翻译器转为字段管线的 regex op;本层仅保留以兼容 IR)。
    pub pattern: String,
    #[serde(default)]
    pub is_regex: bool,
}

// ---------------------------------------------------------------------------
// 分派
// ---------------------------------------------------------------------------

/// 取规格的主引擎:有列表看容器,否则看任一字段的引擎,缺省 css。
fn dominant_engine(spec: &ParseSpec) -> &str {
    if let Some(list) = &spec.list {
        return &list.container.engine;
    }
    spec.fields
        .values()
        .next()
        .map(|f| f.selector.engine.as_str())
        .unwrap_or("css")
}

/// 按主引擎自动分派 HTML / JSON。`base_url` 供管线 resolveUrl 作基址。
pub fn parse_document(
    body: &str,
    spec: &ParseSpec,
    base_url: Option<&str>,
) -> EngineResult<ParseOutput> {
    match dominant_engine(spec) {
        "jsonpath" => parse_json(body, spec, base_url),
        "xpath" => Ok(ParseOutput {
            records: Vec::new(),
            warnings: vec!["XPath 引擎待实现(解析层后续步骤),本步覆盖 CSS + JSONPath".to_string()],
        }),
        _ => parse_html(body, spec, base_url),
    }
}

// ---------------------------------------------------------------------------
// 公共:跑管线、必填校验
// ---------------------------------------------------------------------------

/// 原始多值 → 跑管线 → 取首项。空集视为字段缺失(None)。
fn finalize(
    raw: Vec<String>,
    pipeline: &[PipelineOp],
    ctx: &PipelineContext,
    warnings: &mut Vec<String>,
) -> Option<String> {
    if raw.is_empty() {
        return None;
    }
    apply_pipeline(raw, pipeline, ctx, warnings)
        .into_iter()
        .next()
}

fn check_required(spec: &ParseSpec, records: &[Record], warnings: &mut Vec<String>) {
    for (key, field) in &spec.fields {
        if !field.required {
            continue;
        }
        let missing = records
            .iter()
            .filter(|r| {
                r.get(key)
                    .and_then(|v| v.as_deref())
                    .map_or(true, |s| s.is_empty())
            })
            .count();
        if missing > 0 {
            warnings.push(format!(
                "必填字段 '{key}' 在 {missing}/{} 条记录中缺失",
                records.len()
            ));
        }
    }
}

// ---------------------------------------------------------------------------
// CSS / HTML
// ---------------------------------------------------------------------------

pub fn parse_html(
    html: &str,
    spec: &ParseSpec,
    base_url: Option<&str>,
) -> EngineResult<ParseOutput> {
    use scraper::Html;
    let doc = Html::parse_document(html);
    let root = doc.root_element();
    let ctx = PipelineContext {
        base_url: base_url.map(str::to_string),
    };
    let mut warnings = Vec::new();
    let mut records: Vec<Record> = Vec::new();

    match spec.shape {
        Shape::Page => {
            let mut record = Record::new();
            for (key, field) in &spec.fields {
                let raw = css::select_values(root, &field.selector, &mut warnings);
                let value = finalize(raw, &field.selector.pipeline, &ctx, &mut warnings);
                record.insert(key.clone(), value);
            }
            records.push(record);
        }
        Shape::List => {
            let list = spec
                .list
                .as_ref()
                .ok_or_else(|| EngineError::Parse("shape=list 但缺少 list 容器规格".to_string()))?;
            let containers = css::select_field(root, &list.container, &mut warnings);
            let mut items: Vec<_> = match &list.item {
                Some(item_sel) => containers
                    .iter()
                    .flat_map(|c| css::select_field(*c, item_sel, &mut warnings))
                    .collect(),
                None => containers,
            };
            if let Some(limit) = spec.limit {
                items.truncate(limit);
            }
            for item in &items {
                let mut record = Record::new();
                for (key, field) in &spec.fields {
                    let raw = css::select_values(*item, &field.selector, &mut warnings);
                    let value = finalize(raw, &field.selector.pipeline, &ctx, &mut warnings);
                    record.insert(key.clone(), value);
                }
                records.push(record);
            }
        }
    }

    check_required(spec, &records, &mut warnings);
    Ok(ParseOutput { records, warnings })
}

/// 在 HTML 中按选择器取首个匹配值(extract + pipeline 后)。供翻页等取单值。
pub fn select_first(html: &str, selector: &SelectorExpr, base_url: Option<&str>) -> Option<String> {
    use scraper::Html;
    let doc = Html::parse_document(html);
    let root = doc.root_element();
    let ctx = PipelineContext {
        base_url: base_url.map(str::to_string),
    };
    let mut warnings = Vec::new();
    let raw = css::select_values(root, selector, &mut warnings);
    finalize(raw, &selector.pipeline, &ctx, &mut warnings)
}

// ---------------------------------------------------------------------------
// JSONPath / JSON
// ---------------------------------------------------------------------------

pub fn parse_json(
    body: &str,
    spec: &ParseSpec,
    base_url: Option<&str>,
) -> EngineResult<ParseOutput> {
    let root: Value =
        serde_json::from_str(body).map_err(|e| EngineError::Parse(format!("JSON 非法: {e}")))?;
    let ctx = PipelineContext {
        base_url: base_url.map(str::to_string),
    };
    let mut warnings = Vec::new();
    let mut records: Vec<Record> = Vec::new();

    match spec.shape {
        Shape::Page => records.push(json_record(&root, spec, &ctx, &mut warnings)),
        Shape::List => {
            let list = spec
                .list
                .as_ref()
                .ok_or_else(|| EngineError::Parse("shape=list 但缺少 list 容器规格".to_string()))?;
            match json::resolve_array(&root, &list.container.expr) {
                Some(arr) => {
                    let take = spec.limit.unwrap_or(arr.len()).min(arr.len());
                    for el in &arr[..take] {
                        records.push(json_record(el, spec, &ctx, &mut warnings));
                    }
                }
                None => warnings.push(format!("列表容器路径未解析到数组: {}", list.container.expr)),
            }
        }
    }

    check_required(spec, &records, &mut warnings);
    Ok(ParseOutput { records, warnings })
}

fn json_record(
    scope: &Value,
    spec: &ParseSpec,
    ctx: &PipelineContext,
    warnings: &mut Vec<String>,
) -> Record {
    let mut record = Record::new();
    for (key, field) in &spec.fields {
        let raw: Vec<String> = json::resolve(scope, &field.selector.expr)
            .and_then(json::value_to_string)
            .into_iter()
            .collect();
        let value = finalize(raw, &field.selector.pipeline, ctx, warnings);
        record.insert(key.clone(), value);
    }
    record
}
