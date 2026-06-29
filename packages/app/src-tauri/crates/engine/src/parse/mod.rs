//! 解析层(core-ir §5.1 ②、§5.2②)。按每个 `SelectorExpr` 的 `engine` 标签分派
//! 到对应引擎(parser-plugin 接缝)。本步覆盖 **CSS(含伪类)+ JSONPath**;
//! XPath 两个真实源均未使用,作为解析层后续小步实现(见 `parse_document`)。
//!
//! 字段与 `@sift/core-ir` 的 `ParseSpec` 对齐(camelCase)。`SelectorExpr.pipeline`
//! 属管线层职责,本层不建模(serde 默认忽略未知字段)。

mod css;
pub mod json;
pub mod pseudo;

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::error::{EngineError, EngineResult};

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
    /// 已 Base64 解码的模式(应用归管线层 / 正文清洗,本层仅保留以兼容 IR)。
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

/// 按主引擎自动分派 HTML / JSON。
pub fn parse_document(body: &str, spec: &ParseSpec) -> EngineResult<ParseOutput> {
    match dominant_engine(spec) {
        "jsonpath" => parse_json(body, spec),
        "xpath" => Ok(ParseOutput {
            records: Vec::new(),
            warnings: vec!["XPath 引擎待实现(解析层后续步骤),本步覆盖 CSS + JSONPath".to_string()],
        }),
        _ => parse_html(body, spec),
    }
}

// ---------------------------------------------------------------------------
// 必填校验(页/列表统一,构建后一次性统计,避免逐项刷屏)
// ---------------------------------------------------------------------------

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

pub fn parse_html(html: &str, spec: &ParseSpec) -> EngineResult<ParseOutput> {
    use scraper::Html;
    let doc = Html::parse_document(html);
    let root = doc.root_element();
    let mut warnings = Vec::new();
    let mut records: Vec<Record> = Vec::new();

    match spec.shape {
        Shape::Page => {
            let mut record = Record::new();
            for (key, field) in &spec.fields {
                let matched = css::select_field(root, &field.selector, &mut warnings);
                let value = matched
                    .first()
                    .and_then(|el| css::extract(*el, &field.selector.extract));
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
                    let matched = css::select_field(*item, &field.selector, &mut warnings);
                    let value = matched
                        .first()
                        .and_then(|el| css::extract(*el, &field.selector.extract));
                    record.insert(key.clone(), value);
                }
                records.push(record);
            }
        }
    }

    check_required(spec, &records, &mut warnings);
    Ok(ParseOutput { records, warnings })
}

// ---------------------------------------------------------------------------
// JSONPath / JSON
// ---------------------------------------------------------------------------

pub fn parse_json(body: &str, spec: &ParseSpec) -> EngineResult<ParseOutput> {
    let root: Value =
        serde_json::from_str(body).map_err(|e| EngineError::Parse(format!("JSON 非法: {e}")))?;
    let mut warnings = Vec::new();
    let mut records: Vec<Record> = Vec::new();

    let build = |scope: &Value| -> Record {
        let mut record = Record::new();
        for (key, field) in &spec.fields {
            let value = json::resolve(scope, &field.selector.expr).and_then(json::value_to_string);
            record.insert(key.clone(), value);
        }
        record
    };

    match spec.shape {
        Shape::Page => records.push(build(&root)),
        Shape::List => {
            let list = spec
                .list
                .as_ref()
                .ok_or_else(|| EngineError::Parse("shape=list 但缺少 list 容器规格".to_string()))?;
            match json::resolve_array(&root, &list.container.expr) {
                Some(arr) => {
                    let take = spec.limit.unwrap_or(arr.len()).min(arr.len());
                    for el in &arr[..take] {
                        records.push(build(el));
                    }
                }
                None => warnings.push(format!("列表容器路径未解析到数组: {}", list.container.expr)),
            }
        }
    }

    check_required(spec, &records, &mut warnings);
    Ok(ParseOutput { records, warnings })
}
