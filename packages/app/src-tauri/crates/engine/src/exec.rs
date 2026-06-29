//! 执行层(调度器基础)。把 core-ir 的 `RequestConfig`(含 UrlSource 模板 / 凭据
//! 引用 / 指令)**降级**为请求层可执行的 `FetchRequest`:解析占位符 `###name###`、
//! 合并规则级 defaults、由 credentialRef 取出 Cookie。多步驱动(变量穿线 / fanout /
//! 翻页 / 输出装配)在此基础上构建(后续小步)。
//!
//! 占位符值的 URL/charset 编码(尤其 gb2312 查询)留待驱动按 `encoding` 处理。

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use crate::error::{EngineError, EngineResult};
use crate::parse::SelectorExpr;
use crate::request::{FetchRequest, HttpMethod, RequestBody, RetryPolicy, UrlReplaceRule};

/// 变量作用域:占位符名 → 值(keyword / book_id / item_id…)。
pub type VarScope = BTreeMap<String, String>;
/// 凭据表:credentialRef → 已解密的 Cookie 串(由加密库在调度层填充)。
pub type Credentials = BTreeMap<String, String>;

/// core-ir RequestConfig 的镜像(已解析形态)。phase-2 facet(proxy/render/sniff)
/// 与 rateLimit 此处不建模:前者后置,后者属 client 级,serde 默认忽略。
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RequestConfig {
    pub url: UrlSource,
    #[serde(default)]
    pub method: HttpMethod,
    #[serde(default)]
    pub headers: BTreeMap<String, String>,
    #[serde(default)]
    pub body: Option<RequestBody>,
    /// 加密库引用,绝不明文(§2 凭据原则)。降级时解析为 Cookie 头。
    #[serde(default)]
    pub credential_ref: Option<String>,
    #[serde(default)]
    pub user_agent: Option<String>,
    #[serde(default)]
    pub encoding: Option<String>,
    #[serde(default)]
    pub follow_redirect: Option<bool>,
    #[serde(default)]
    pub timeout_ms: Option<u64>,
    #[serde(default)]
    pub retry: Option<RetryPolicy>,
    #[serde(default)]
    pub url_replace_rules: Vec<UrlReplaceRule>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum UrlSource {
    /// 含 ###placeholder### 的模板(搜索 / 线 A 种子)。
    Template { template: String },
    /// 从上游响应字段抽取的 URL(book_menu)。由驱动解析,不能直接降级。
    Extracted { from: SelectorExpr },
    /// 固定 URL(线 A 点选页 / 静态源)。
    Static { url: String },
}

/// 替换字符串中的 `###name###` 占位符;未提供的变量原样保留。
pub fn substitute(template: &str, scope: &VarScope) -> String {
    use regex::Regex;
    use std::sync::OnceLock;
    static RE: OnceLock<Regex> = OnceLock::new();
    let re = RE.get_or_init(|| Regex::new(r"###([A-Za-z0-9_]+)###").unwrap());
    re.replace_all(template, |caps: &regex::Captures| {
        scope
            .get(&caps[1])
            .cloned()
            .unwrap_or_else(|| caps[0].to_string())
    })
    .into_owned()
}

fn substitute_body(body: &RequestBody, scope: &VarScope) -> RequestBody {
    match body {
        RequestBody::Form { fields } => RequestBody::Form {
            fields: fields
                .iter()
                .map(|(k, v)| (k.clone(), substitute(v, scope)))
                .collect(),
        },
        RequestBody::Json { json } => RequestBody::Json {
            json: substitute(json, scope),
        },
        RequestBody::Raw { content_type, data } => RequestBody::Raw {
            content_type: content_type.clone(),
            data: substitute(data, scope),
        },
    }
}

/// 把 IR `RequestConfig` 降级为可执行 `FetchRequest`:解析模板 URL/头/体的占位符、
/// 合并规则级 `defaults`(cfg 覆盖 defaults)、由 credentialRef 取 Cookie。
/// `extracted` 形态需驱动先从上游记录解析,直接降级报错。
pub fn lower_request(
    cfg: &RequestConfig,
    scope: &VarScope,
    defaults: Option<&RequestConfig>,
    credentials: &Credentials,
) -> EngineResult<FetchRequest> {
    let url = match &cfg.url {
        UrlSource::Static { url } => substitute(url, scope),
        UrlSource::Template { template } => substitute(template, scope),
        UrlSource::Extracted { .. } => {
            return Err(EngineError::InvalidRequest(
                "extracted URL 需调度器从上游记录解析,不能直接降级".to_string(),
            ))
        }
    };

    // 头:defaults 先铺底,cfg 覆盖;值做占位符替换。
    let mut headers = BTreeMap::new();
    if let Some(d) = defaults {
        for (k, v) in &d.headers {
            headers.insert(k.clone(), substitute(v, scope));
        }
    }
    for (k, v) in &cfg.headers {
        headers.insert(k.clone(), substitute(v, scope));
    }
    // userAgent → User-Agent 头(不覆盖已显式给的同名头)。
    if let Some(ua) = cfg
        .user_agent
        .as_ref()
        .or_else(|| defaults.and_then(|d| d.user_agent.as_ref()))
    {
        headers
            .entry("User-Agent".to_string())
            .or_insert_with(|| ua.clone());
    }

    let cookie = cfg
        .credential_ref
        .as_ref()
        .or_else(|| defaults.and_then(|d| d.credential_ref.as_ref()))
        .and_then(|r| credentials.get(r).cloned());

    let body = cfg.body.as_ref().map(|b| substitute_body(b, scope));

    let encoding = cfg
        .encoding
        .clone()
        .or_else(|| defaults.and_then(|d| d.encoding.clone()));
    let follow_redirect = cfg
        .follow_redirect
        .or_else(|| defaults.and_then(|d| d.follow_redirect))
        .unwrap_or(true);
    let timeout_ms = cfg
        .timeout_ms
        .or_else(|| defaults.and_then(|d| d.timeout_ms))
        .unwrap_or(30_000);
    let retry = cfg
        .retry
        .clone()
        .or_else(|| defaults.and_then(|d| d.retry.clone()))
        .unwrap_or_default();

    let mut url_replace_rules = defaults
        .map(|d| d.url_replace_rules.clone())
        .unwrap_or_default();
    url_replace_rules.extend(cfg.url_replace_rules.clone());

    Ok(FetchRequest {
        url,
        method: cfg.method,
        headers,
        cookie,
        body,
        encoding,
        follow_redirect,
        timeout_ms,
        retry,
        url_replace_rules,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scope(pairs: &[(&str, &str)]) -> VarScope {
        pairs
            .iter()
            .map(|(k, v)| (k.to_string(), v.to_string()))
            .collect()
    }

    fn template_cfg(template: &str) -> RequestConfig {
        RequestConfig {
            url: UrlSource::Template {
                template: template.to_string(),
            },
            method: HttpMethod::Get,
            headers: BTreeMap::new(),
            body: None,
            credential_ref: None,
            user_agent: None,
            encoding: None,
            follow_redirect: None,
            timeout_ms: None,
            retry: None,
            url_replace_rules: Vec::new(),
        }
    }

    #[test]
    fn substitute_replaces_known_keeps_unknown() {
        let s = scope(&[("keyword", "剑来")]);
        assert_eq!(
            substitute("?kw=###keyword###&p=###page###", &s),
            "?kw=剑来&p=###page###"
        );
    }

    #[test]
    fn lowers_qimao_search_template() {
        let cfg = template_cfg(
            "https://www.qimao.com/qimaoapi/api/search/result?keyword=###keyword###&page_size=15",
        );
        let req = lower_request(
            &cfg,
            &scope(&[("keyword", "剑来")]),
            None,
            &Credentials::new(),
        )
        .unwrap();
        assert_eq!(
            req.url,
            "https://www.qimao.com/qimaoapi/api/search/result?keyword=剑来&page_size=15"
        );
        assert_eq!(req.method, HttpMethod::Get);
        assert_eq!(req.timeout_ms, 30_000);
        assert!(req.follow_redirect);
    }

    #[test]
    fn lowers_jiugangbi_directives() {
        // {{gb2312}}{{302}} 已被翻译器解析进 IR 的 encoding/followRedirect。
        let mut cfg = template_cfg(
            "http://www.jiugangbi.com/modules/article/search.php?searchkey=###keyword###",
        );
        cfg.encoding = Some("gb2312".to_string());
        cfg.follow_redirect = Some(true);
        let req =
            lower_request(&cfg, &scope(&[("keyword", "x")]), None, &Credentials::new()).unwrap();
        assert_eq!(req.encoding.as_deref(), Some("gb2312"));
        assert!(req.follow_redirect);
    }

    #[test]
    fn credential_ref_resolves_to_cookie() {
        let mut cfg = template_cfg("http://x.com/");
        cfg.credential_ref = Some("cred1".to_string());
        let mut creds = Credentials::new();
        creds.insert("cred1".to_string(), "sid=abc".to_string());
        let req = lower_request(&cfg, &scope(&[]), None, &creds).unwrap();
        assert_eq!(req.cookie.as_deref(), Some("sid=abc"));
    }

    #[test]
    fn user_agent_becomes_header() {
        let mut cfg = template_cfg("http://x.com/");
        cfg.user_agent = Some("Sift/0.1".to_string());
        let req = lower_request(&cfg, &scope(&[]), None, &Credentials::new()).unwrap();
        assert_eq!(
            req.headers.get("User-Agent").map(String::as_str),
            Some("Sift/0.1")
        );
    }

    #[test]
    fn defaults_merge_then_cfg_overrides() {
        let mut defaults = template_cfg("");
        defaults.headers.insert("Accept".into(), "*/*".into());
        defaults.headers.insert("X-Env".into(), "base".into());
        defaults.timeout_ms = Some(5000);
        let mut cfg = template_cfg("http://x.com/");
        cfg.headers.insert("X-Env".into(), "override".into());
        let req = lower_request(&cfg, &scope(&[]), Some(&defaults), &Credentials::new()).unwrap();
        assert_eq!(req.headers.get("Accept").map(String::as_str), Some("*/*"));
        assert_eq!(
            req.headers.get("X-Env").map(String::as_str),
            Some("override")
        );
        assert_eq!(req.timeout_ms, 5000);
    }

    #[test]
    fn extracted_url_cannot_lower_directly() {
        let cfg = RequestConfig {
            url: UrlSource::Extracted {
                from: SelectorExpr {
                    engine: "css".into(),
                    expr: "a".into(),
                    fallbacks: Vec::new(),
                    extract: crate::parse::Extraction::Attr {
                        name: "href".into(),
                    },
                    pipeline: Vec::new(),
                },
            },
            ..template_cfg("")
        };
        assert!(lower_request(&cfg, &scope(&[]), None, &Credentials::new()).is_err());
    }

    #[test]
    fn body_placeholders_substituted() {
        let mut cfg = template_cfg("http://x.com/");
        let mut fields = BTreeMap::new();
        fields.insert("searchkey".to_string(), "###keyword###".to_string());
        cfg.body = Some(RequestBody::Form { fields });
        let req = lower_request(
            &cfg,
            &scope(&[("keyword", "剑来")]),
            None,
            &Credentials::new(),
        )
        .unwrap();
        match req.body {
            Some(RequestBody::Form { fields }) => {
                assert_eq!(fields.get("searchkey").map(String::as_str), Some("剑来"))
            }
            _ => panic!("expected form body"),
        }
    }

    #[test]
    fn deserializes_camel_case_request_config() {
        let json = r#"{
            "url": { "kind": "template", "template": "http://x/?k=###keyword###", "placeholders": [] },
            "method": "POST",
            "credentialRef": "cred-1",
            "userAgent": "Sift/0.1",
            "encoding": "gb2312",
            "followRedirect": true,
            "timeoutMs": 6000,
            "urlReplaceRules": [{ "from": "http://m", "to": "http://www" }]
        }"#;
        let cfg: RequestConfig = serde_json::from_str(json).unwrap();
        assert!(matches!(cfg.url, UrlSource::Template { .. }));
        assert_eq!(cfg.method, HttpMethod::Post);
        assert_eq!(cfg.credential_ref.as_deref(), Some("cred-1"));
        assert_eq!(cfg.timeout_ms, Some(6000));
        assert_eq!(cfg.url_replace_rules.len(), 1);
    }
}
