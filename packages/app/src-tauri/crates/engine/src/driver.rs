//! 多步驱动:把请求/解析/管线/执行四层串成端到端的 `run_rule`。按 `steps` 顺序执行,
//! 处理跨步骤关切:变量穿线(inputs/produces + fanout 绑定上游项字段)、fanout
//! (once/perItem)、输出友好列装配。翻页(pagination)留待后续小步——非 None 给告警、
//! 仅取首页。`extracted` URL 经 fanout 把上游项字段绑入作用域后用模板引用。

use std::collections::BTreeMap;

use serde::Serialize;
use url::Url;

use crate::error::EngineResult;
use crate::exec::{lower_request, Credentials, RequestConfig, VarScope};
use crate::parse::{parse_document, select_first, Extraction, Record, SelectorExpr};
use crate::request::{FetchRequest, HttpClient};
use crate::rule::{
    CollectStep, EntryPoint, Fanout, OutputSpec, PageCombine, Pagination, Rule, StepInputFrom,
};

/// 翻页安全上限,防止失控。
const DEFAULT_MAX_PAGES: u32 = 50;

/// 一轮采集的产物。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
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

/// 执行单次步骤:降级请求,按翻页策略抓取并解析。base_url 用响应 final_url 供 resolveUrl。
async fn run_execution(
    client: &HttpClient,
    step: &CollectStep,
    scope: &VarScope,
    defaults: Option<&RequestConfig>,
    credentials: &Credentials,
) -> EngineResult<(Vec<Record>, Vec<String>)> {
    let request = lower_request(&step.request, scope, defaults, credentials)?;
    match &step.pagination {
        None | Some(Pagination::None) => {
            fetch_parse_once(client, &request, &step.parse, &step.id).await
        }
        Some(Pagination::PageParam {
            param,
            start,
            step: page_step,
            max_pages,
            combine,
        }) => {
            paginate_param(
                client,
                &request,
                &step.parse,
                &step.id,
                param,
                start.unwrap_or(1),
                page_step.unwrap_or(1),
                max_pages.unwrap_or(DEFAULT_MAX_PAGES),
                *combine,
            )
            .await
        }
        Some(Pagination::NextButton {
            next,
            stop_text,
            require_text,
            max_pages,
            combine,
        }) => {
            paginate_next(
                client,
                &request,
                &step.parse,
                &step.id,
                next,
                stop_text.as_deref(),
                require_text.as_deref(),
                max_pages.unwrap_or(DEFAULT_MAX_PAGES),
                *combine,
            )
            .await
        }
        Some(Pagination::Cursor { .. }) => {
            let (recs, mut warnings) =
                fetch_parse_once(client, &request, &step.parse, &step.id).await?;
            warnings.push(format!(
                "步骤 '{}' cursor 翻页待实现(phase-2),仅取首页",
                step.id
            ));
            Ok((recs, warnings))
        }
    }
}

/// 抓取一页并解析。
async fn fetch_parse_once(
    client: &HttpClient,
    request: &FetchRequest,
    parse: &crate::parse::ParseSpec,
    step_id: &str,
) -> EngineResult<(Vec<Record>, Vec<String>)> {
    let resp = client.fetch(request).await?;
    let parsed = parse_document(&resp.body, parse, Some(&resp.final_url))?;
    let warnings = parsed
        .warnings
        .into_iter()
        .map(|w| format!("[{step_id}] {w}"))
        .collect();
    Ok((parsed.records, warnings))
}

/// pageParam 翻页:递增查询参数,空页或达上限即止。
#[allow(clippy::too_many_arguments)]
async fn paginate_param(
    client: &HttpClient,
    base: &FetchRequest,
    parse: &crate::parse::ParseSpec,
    step_id: &str,
    param: &str,
    start: i64,
    page_step: i64,
    max_pages: u32,
    combine: Option<PageCombine>,
) -> EngineResult<(Vec<Record>, Vec<String>)> {
    let mut warnings = Vec::new();
    let mut pages: Vec<Vec<Record>> = Vec::new();
    let mut page = start;
    for _ in 0..max_pages {
        let url = set_query_param(&base.url, param, &page.to_string());
        let mut req = base.clone();
        req.url = url;
        let resp = client.fetch(&req).await?;
        let parsed = parse_document(&resp.body, parse, Some(&resp.final_url))?;
        warnings.extend(
            parsed
                .warnings
                .into_iter()
                .map(|w| format!("[{step_id}] {w}")),
        );
        let empty = parsed.records.is_empty();
        pages.push(parsed.records);
        if empty {
            break;
        }
        page += page_step;
    }
    Ok((combine_pages(pages, combine), warnings))
}

/// nextButton 翻页:跟随页内"下一页"链接;无链接 / 命中 stopText / 达上限即止。
#[allow(clippy::too_many_arguments)]
async fn paginate_next(
    client: &HttpClient,
    base: &FetchRequest,
    parse: &crate::parse::ParseSpec,
    step_id: &str,
    next_sel: &SelectorExpr,
    stop_text: Option<&str>,
    require_text: Option<&str>,
    max_pages: u32,
    combine: Option<PageCombine>,
) -> EngineResult<(Vec<Record>, Vec<String>)> {
    let mut warnings = Vec::new();
    let mut pages: Vec<Vec<Record>> = Vec::new();
    // 已抓 URL 集合:防止末页「下一页」指回自身/旧页时无限循环重复抓取。
    let mut visited: std::collections::HashSet<String> = std::collections::HashSet::new();
    let mut req = base.clone();
    for _ in 0..max_pages {
        if !visited.insert(req.url.clone()) {
            break; // 该 URL 已抓过 → 到底
        }
        let resp = client.fetch(&req).await?;
        let final_url = resp.final_url.clone();
        let parsed = parse_document(&resp.body, parse, Some(&final_url))?;
        warnings.extend(
            parsed
                .warnings
                .into_iter()
                .map(|w| format!("[{step_id}] {w}")),
        );
        pages.push(parsed.records);
        match next_link(&resp.body, next_sel, &final_url, stop_text, require_text) {
            Some(url) if !visited.contains(&url) => {
                let mut next_req = base.clone();
                next_req.url = url;
                req = next_req;
            }
            _ => break, // 无下一页 / 指回已抓页 → 到底
        }
    }
    Ok((combine_pages(pages, combine), warnings))
}

/// 从页面解析下一页链接。两类文本门控(任一不满足即视为到底返回 None):
/// `stop_text` 命中(next 元素文本含之)则停;`require_text` 设置但 next 元素文本**不含**之则停
/// (line-B next_val:正常页按钮文本为「下一页」才继续,末页文本变化即止)。
fn next_link(
    html: &str,
    next_sel: &SelectorExpr,
    base_url: &str,
    stop_text: Option<&str>,
    require_text: Option<&str>,
) -> Option<String> {
    if stop_text.is_some() || require_text.is_some() {
        let mut text_sel = next_sel.clone();
        text_sel.extract = Extraction::Text;
        text_sel.pipeline = Vec::new();
        let text = select_first(html, &text_sel, None).unwrap_or_default();
        if let Some(stop) = stop_text {
            if text.contains(stop) {
                return None;
            }
        }
        if let Some(req) = require_text {
            if !text.contains(req) {
                return None;
            }
        }
    }
    let href = select_first(html, next_sel, Some(base_url))?;
    if href.trim().is_empty() {
        return None;
    }
    Some(resolve_against(base_url, &href))
}

/// 相对地址按 base 解析为绝对;已是绝对则原样。
fn resolve_against(base: &str, href: &str) -> String {
    if let Ok(u) = Url::parse(href) {
        if u.has_host() {
            return href.to_string();
        }
    }
    match Url::parse(base).and_then(|b| b.join(href)) {
        Ok(joined) => joined.to_string(),
        Err(_) => href.to_string(),
    }
}

/// 合并多页记录:appendRows 平铺所有行;appendContent 合并为单记录、各字段按 \n 拼接。
fn combine_pages(pages: Vec<Vec<Record>>, combine: Option<PageCombine>) -> Vec<Record> {
    match combine.unwrap_or(PageCombine::AppendRows) {
        PageCombine::AppendRows => pages.into_iter().flatten().collect(),
        PageCombine::AppendContent => {
            let all: Vec<Record> = pages.into_iter().flatten().collect();
            if all.is_empty() {
                return Vec::new();
            }
            let mut keys: Vec<String> = Vec::new();
            for record in &all {
                for key in record.keys() {
                    if !keys.contains(key) {
                        keys.push(key.clone());
                    }
                }
            }
            let mut merged = Record::new();
            for key in keys {
                let joined: Vec<String> = all
                    .iter()
                    .filter_map(|r| r.get(&key).cloned().flatten())
                    .collect();
                merged.insert(key, (!joined.is_empty()).then(|| joined.join("\n")));
            }
            vec![merged]
        }
    }
}

/// 设置/替换 URL 的查询参数。**纯文本替换**(不经 Url::parse 重建),以保留查询里的
/// 字面非 ASCII(如 gb2312 源的关键词),让请求层 fetch 的 charset 编码仍能正确生效;
/// 若先经 url 库重建,字面关键词会被 UTF-8 百分号编码,charset 编码便无从下手(bug)。
fn set_query_param(url_str: &str, key: &str, val: &str) -> String {
    let (head, rest) = match url_str.split_once('?') {
        Some((h, r)) => (h, r),
        None => return format!("{url_str}?{key}={val}"),
    };
    let (query, frag) = match rest.split_once('#') {
        Some((q, f)) => (q, Some(f)),
        None => (rest, None),
    };
    let mut parts: Vec<String> = Vec::new();
    let mut found = false;
    for seg in query.split('&') {
        if seg.is_empty() {
            continue;
        }
        if seg.split('=').next() == Some(key) {
            parts.push(format!("{key}={val}"));
            found = true;
        } else {
            parts.push(seg.to_string());
        }
    }
    if !found {
        parts.push(format!("{key}={val}"));
    }
    let mut out = format!("{head}?{}", parts.join("&"));
    if let Some(f) = frag {
        out.push('#');
        out.push_str(f);
    }
    out
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

    #[test]
    fn set_query_param_adds_and_replaces() {
        let added = set_query_param("http://x.com/list?kw=a", "page", "2");
        assert!(added.contains("kw=a"));
        assert!(added.contains("page=2"));
        let replaced = set_query_param("http://x.com/list?page=1&kw=a", "page", "3");
        assert!(replaced.contains("page=3"));
        assert!(!replaced.contains("page=1"));
    }

    #[test]
    fn set_query_param_preserves_literal_non_ascii() {
        // gb2312 源:字面关键词必须原样保留,交给 fetch 的 charset 编码处理(不被 UTF-8 化)。
        let out = set_query_param("http://x.com/s?searchkey=剑来&an=搜索", "page", "2");
        assert!(out.contains("searchkey=剑来"), "out: {out}");
        assert!(out.contains("an=搜索"));
        assert!(out.contains("page=2"));
    }

    #[test]
    fn set_query_param_no_query_appends() {
        assert_eq!(
            set_query_param("http://x.com/list", "page", "2"),
            "http://x.com/list?page=2"
        );
    }

    #[test]
    fn resolve_against_handles_relative_and_absolute() {
        assert_eq!(
            resolve_against("http://x.com/a/b", "c.html"),
            "http://x.com/a/c.html"
        );
        assert_eq!(
            resolve_against("http://x.com/a/", "http://y.com/z"),
            "http://y.com/z"
        );
    }

    #[test]
    fn combine_append_content_merges_into_one_record() {
        let pages = vec![
            vec![rec(&[("content", "第一页正文")])],
            vec![rec(&[("content", "第二页正文")])],
        ];
        let merged = combine_pages(pages, Some(PageCombine::AppendContent));
        assert_eq!(merged.len(), 1);
        assert_eq!(
            merged[0]["content"].as_deref(),
            Some("第一页正文\n第二页正文")
        );
    }

    #[test]
    fn combine_append_rows_flattens() {
        let pages = vec![
            vec![rec(&[("t", "a")]), rec(&[("t", "b")])],
            vec![rec(&[("t", "c")])],
        ];
        let rows = combine_pages(pages, Some(PageCombine::AppendRows));
        assert_eq!(rows.len(), 3);
    }
}
