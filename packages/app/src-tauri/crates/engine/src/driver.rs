//! 多步驱动:把请求/解析/管线/执行四层串成端到端的 `run_rule`。按 `steps` 顺序执行,
//! 处理跨步骤关切:变量穿线(inputs/produces + fanout 绑定上游项字段)、fanout
//! (once/perItem)、输出友好列装配。翻页(pagination)留待后续小步——非 None 给告警、
//! 仅取首页。`extracted` URL 经 fanout 把上游项字段绑入作用域后用模板引用。

use std::collections::BTreeMap;

use serde::Serialize;

use crate::error::EngineResult;
use crate::exec::{lower_request, Credentials, VarScope};
use crate::parse::{parse_document, Record};
use crate::request::HttpClient;
use crate::rule::{CollectStep, EntryPoint, Fanout, OutputSpec, Pagination, Rule, StepInputFrom};

/// 一轮采集的产物。
#[derive(Debug, Clone, Serialize)]
pub struct RunOutput {
    /// 友好列装配后的数据集行(供 UI 表格 / 导出)。
    pub records: Vec<BTreeMap<String, Option<String>>>,
    /// 每步原始记录(调试 / provenance)。
    pub step_records: BTreeMap<String, Vec<Record>>,
    pub warnings: Vec<String>,
}

/// 执行整条规则。`inputs` 为用户种子变量(keyword 等),`credentials` 由加密库填充。
pub async fn run_rule(
    client: &HttpClient,
    rule: &Rule,
    inputs: VarScope,
    credentials: &Credentials,
) -> EngineResult<RunOutput> {
    let mut warnings = Vec::new();
    let mut scope = inputs;

    if let EntryPoint::Keyword { param, .. } = &rule.entry {
        if !scope.contains_key(param) {
            warnings.push(format!("入口关键词 '{param}' 未提供"));
        }
    }

    let defaults = rule.defaults.as_ref();
    let mut step_records: BTreeMap<String, Vec<Record>> = BTreeMap::new();
    let mut last_step_id = String::new();

    for step in &rule.steps {
        last_step_id = step.id.clone();
        let executions = plan_executions(step, &scope, &step_records, &mut warnings);

        let mut produced: Vec<Record> = Vec::new();
        for (exec_scope, parent) in executions {
            match run_execution(client, step, &exec_scope, defaults, credentials).await {
                Ok((mut recs, exec_warnings)) => {
                    warnings.extend(exec_warnings);
                    if let Some(parent) = &parent {
                        inherit(parent, &mut recs);
                    }
                    produced.extend(recs);
                }
                Err(e) => {
                    if step.optional {
                        warnings.push(format!("步骤 '{}' 跳过: {e}", step.id));
                    } else {
                        return Err(e);
                    }
                }
            }
        }

        // produces:单记录生产者把字段导出为下游变量(取首条,最常见于单页步骤)。
        if let Some(first) = produced.first() {
            for binding in &step.produces {
                if let Some(Some(value)) = first.get(&binding.from) {
                    scope.insert(binding.name.clone(), value.clone());
                }
            }
        }
        step_records.insert(step.id.clone(), produced);
    }

    let final_recs = step_records.get(&last_step_id).cloned().unwrap_or_default();
    let records = assemble_output(&rule.output, &final_recs);
    Ok(RunOutput {
        records,
        step_records,
        warnings,
    })
}

/// 规划一步的执行清单:once → 单次;perItem → 上游每条记录一次,并把该项字段绑入作用域。
fn plan_executions(
    step: &CollectStep,
    scope: &VarScope,
    step_records: &BTreeMap<String, Vec<Record>>,
    warnings: &mut Vec<String>,
) -> Vec<(VarScope, Option<Record>)> {
    match &step.fanout {
        Some(Fanout::PerItem { over_step, .. }) => {
            let upstream = step_records.get(over_step).cloned().unwrap_or_default();
            if upstream.is_empty() {
                warnings.push(format!(
                    "步骤 '{}' fanout 上游 '{over_step}' 无记录",
                    step.id
                ));
            }
            upstream
                .into_iter()
                .map(|record| {
                    let mut exec_scope = scope.clone();
                    bind_record(&mut exec_scope, &record);
                    apply_inputs(&mut exec_scope, step, &record, step_records);
                    (exec_scope, Some(record))
                })
                .collect()
        }
        _ => {
            let mut exec_scope = scope.clone();
            apply_inputs(&mut exec_scope, step, &Record::new(), step_records);
            vec![(exec_scope, None)]
        }
    }
}

/// 执行单次:降级 → 抓取 → 解析(+管线)。base_url 用响应 final_url 供 resolveUrl。
async fn run_execution(
    client: &HttpClient,
    step: &CollectStep,
    scope: &VarScope,
    defaults: Option<&crate::exec::RequestConfig>,
    credentials: &Credentials,
) -> EngineResult<(Vec<Record>, Vec<String>)> {
    let mut warnings = Vec::new();
    let request = lower_request(&step.request, scope, defaults, credentials)?;
    let resp = client.fetch(&request).await?;

    if let Some(pagination) = &step.pagination {
        if !matches!(pagination, Pagination::None) {
            warnings.push(format!("步骤 '{}' 翻页待实现(后续小步),仅取首页", step.id));
        }
    }

    let parsed = parse_document(&resp.body, &step.parse, Some(&resp.final_url))?;
    warnings.extend(
        parsed
            .warnings
            .into_iter()
            .map(|w| format!("[{}] {w}", step.id)),
    );
    Ok((parsed.records, warnings))
}

/// 把记录的非空字段按键绑入作用域(供下游 ###field### 解析)。
fn bind_record(scope: &mut VarScope, record: &Record) {
    for (key, value) in record {
        if let Some(value) = value {
            scope.insert(key.clone(), value.clone());
        }
    }
}

/// 解析 step.inputs:从用户种子或上游某步字段取值,以 input.name 写入作用域。
fn apply_inputs(
    scope: &mut VarScope,
    step: &CollectStep,
    current: &Record,
    step_records: &BTreeMap<String, Vec<Record>>,
) {
    for input in &step.inputs {
        match &input.from {
            StepInputFrom::Input | StepInputFrom::Unknown => {}
            StepInputFrom::Step { step_id, field } => {
                let value = current.get(field).cloned().flatten().or_else(|| {
                    step_records
                        .get(step_id)
                        .and_then(|recs| recs.first())
                        .and_then(|r| r.get(field).cloned().flatten())
                });
                if let Some(value) = value {
                    scope.insert(input.name.clone(), value);
                }
            }
        }
    }
}

/// 把上游父记录的字段下沉到本步每条记录(本步同名字段优先,不被覆盖)。
fn inherit(parent: &Record, records: &mut [Record]) {
    for record in records.iter_mut() {
        for (key, value) in parent {
            record.entry(key.clone()).or_insert_with(|| value.clone());
        }
    }
}

/// 按 OutputSpec 把记录映射为友好列行(列名 ← from_field)。
fn assemble_output(spec: &OutputSpec, records: &[Record]) -> Vec<BTreeMap<String, Option<String>>> {
    records
        .iter()
        .map(|record| {
            spec.columns
                .iter()
                .map(|col| {
                    (
                        col.name.clone(),
                        record.get(&col.from_field).cloned().flatten(),
                    )
                })
                .collect()
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::rule::{OutputColumn, OutputSpec, StepInput};

    fn rec(pairs: &[(&str, &str)]) -> Record {
        pairs
            .iter()
            .map(|(k, v)| (k.to_string(), Some(v.to_string())))
            .collect()
    }

    #[test]
    fn inherit_does_not_overwrite_own_fields() {
        let parent = rec(&[("name", "剑来"), ("book_id", "111")]);
        let mut records = vec![rec(&[("title", "第一章"), ("name", "章节自有")])];
        inherit(&parent, &mut records);
        // 本步自有 name 不被父覆盖,缺失的 book_id 下沉。
        assert_eq!(records[0]["name"].as_deref(), Some("章节自有"));
        assert_eq!(records[0]["book_id"].as_deref(), Some("111"));
    }

    #[test]
    fn assemble_output_maps_columns_by_field() {
        let spec = OutputSpec {
            format: "records".into(),
            columns: vec![
                OutputColumn {
                    name: "书名".into(),
                    from_field: "name".into(),
                    from_step: "search".into(),
                    col_type: None,
                },
                OutputColumn {
                    name: "章节".into(),
                    from_field: "title".into(),
                    from_step: "chapter".into(),
                    col_type: None,
                },
            ],
            track_provenance: None,
            formats: Vec::new(),
        };
        let records = vec![rec(&[("name", "剑来"), ("title", "第一章")])];
        let out = assemble_output(&spec, &records);
        assert_eq!(out[0]["书名"].as_deref(), Some("剑来"));
        assert_eq!(out[0]["章节"].as_deref(), Some("第一章"));
    }

    #[test]
    fn apply_inputs_renames_from_current_item() {
        let step = CollectStep {
            id: "chapter".into(),
            name: "章节".into(),
            request: crate::exec::RequestConfig {
                url: crate::exec::UrlSource::Static {
                    url: "http://x/".into(),
                },
                method: Default::default(),
                headers: BTreeMap::new(),
                body: None,
                credential_ref: None,
                user_agent: None,
                encoding: None,
                follow_redirect: None,
                timeout_ms: None,
                retry: None,
                url_replace_rules: Vec::new(),
            },
            parse: empty_parse(),
            inputs: vec![StepInput {
                name: "bid".into(),
                from: StepInputFrom::Step {
                    step_id: "search".into(),
                    field: "book_id".into(),
                },
            }],
            produces: Vec::new(),
            fanout: None,
            pagination: None,
            optional: false,
        };
        let mut scope = VarScope::new();
        let current = rec(&[("book_id", "111")]);
        apply_inputs(&mut scope, &step, &current, &BTreeMap::new());
        assert_eq!(scope.get("bid").map(String::as_str), Some("111"));
    }

    fn empty_parse() -> crate::parse::ParseSpec {
        crate::parse::ParseSpec {
            shape: crate::parse::Shape::Page,
            list: None,
            fields: BTreeMap::new(),
            limit: None,
            content_filters: Vec::new(),
        }
    }
}
