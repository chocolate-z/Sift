//! 管线层(core-ir §5.1 ③)。声明式、有序、按 `op` 标签分派的值后处理。
//! 操作对象是字符串列表(选择器可命中多个值):元素级算子(regex/base64/
//! urlReplace/resolveUrl/trim)逐元素变换,`join` 折叠为单值。无闭包:用户 JS
//! 以 id 引用,留待 phase-3 沙箱。字段与 `@sift/core-ir` 的 PipelineOp 对齐。

use base64::prelude::*;
use regex::{Regex, RegexBuilder};
use serde::{Deserialize, Serialize};
use url::Url;

use crate::request::UrlReplaceRule;

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(tag = "op", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum PipelineOp {
    /// 正则:有 replace 则全局替换(清洗);否则抽取首个匹配(group 缺省取整段)。
    Regex {
        pattern: String,
        #[serde(default)]
        replace: Option<String>,
        #[serde(default)]
        flags: Option<String>,
        #[serde(default)]
        group: Option<usize>,
    },
    /// base64 解码为文本(失败原样保留并告警)。
    Base64Decode,
    /// 对值套用 %% 替换规则(line-B item 9)。
    UrlReplace {
        rules: Vec<UrlReplaceRule>,
    },
    /// 相对 URL → 绝对(op 内 base 优先,否则用上下文页面 URL)。
    ResolveUrl {
        #[serde(default)]
        base: Option<String>,
    },
    Trim,
    /// 列表 → 单串。
    Join {
        sep: String,
    },
    /// phase-3 沙箱用户脚本,按 id 引用,绝不内联(§5.2④)。当前跳过。
    Script {
        script_id: String,
        #[serde(default)]
        lang: Option<String>,
    },
}

/// 管线执行上下文:resolveUrl 的页面基址(由调度层用响应 final_url 填充)。
#[derive(Debug, Clone, Default)]
pub struct PipelineContext {
    pub base_url: Option<String>,
}

/// 顺序套用所有 op,返回变换后的值列表。非致命问题(正则非法、base64 失败、
/// 无 base 等)记入 warnings 并保留原值。
pub fn apply_pipeline(
    values: Vec<String>,
    ops: &[PipelineOp],
    ctx: &PipelineContext,
    warnings: &mut Vec<String>,
) -> Vec<String> {
    let mut values = values;
    for op in ops {
        values = apply_op(values, op, ctx, warnings);
    }
    values
}

/// 单值便捷封装:把单串过一遍管线,取结果首项(无则空串)。
pub fn apply_pipeline_str(
    value: String,
    ops: &[PipelineOp],
    ctx: &PipelineContext,
    warnings: &mut Vec<String>,
) -> String {
    apply_pipeline(vec![value], ops, ctx, warnings)
        .into_iter()
        .next()
        .unwrap_or_default()
}

fn apply_op(
    values: Vec<String>,
    op: &PipelineOp,
    ctx: &PipelineContext,
    warnings: &mut Vec<String>,
) -> Vec<String> {
    match op {
        PipelineOp::Regex {
            pattern,
            replace,
            flags,
            group,
        } => match build_regex(pattern, flags.as_deref()) {
            Ok(re) => values
                .into_iter()
                .map(|v| apply_regex(&re, &v, replace.as_deref(), *group))
                .collect(),
            Err(e) => {
                warnings.push(format!("正则非法 '{pattern}': {e}"));
                values
            }
        },
        PipelineOp::Base64Decode => values
            .into_iter()
            .map(|v| decode_base64(&v, warnings))
            .collect(),
        PipelineOp::UrlReplace { rules } => values
            .into_iter()
            .map(|v| apply_url_replace(&v, rules))
            .collect(),
        PipelineOp::ResolveUrl { base } => {
            let base = base.as_deref().or(ctx.base_url.as_deref());
            values
                .into_iter()
                .map(|v| resolve_url(&v, base, warnings))
                .collect()
        }
        PipelineOp::Trim => values.into_iter().map(|v| v.trim().to_string()).collect(),
        PipelineOp::Join { sep } => vec![values.join(sep)],
        PipelineOp::Script { script_id, .. } => {
            warnings.push(format!("脚本管线 '{script_id}' 待 phase-3 沙箱实现,已跳过"));
            values
        }
    }
}

fn build_regex(pattern: &str, flags: Option<&str>) -> Result<Regex, regex::Error> {
    let f = flags.unwrap_or("");
    RegexBuilder::new(pattern)
        .case_insensitive(f.contains('i'))
        .multi_line(f.contains('m'))
        .dot_matches_new_line(f.contains('s'))
        .build()
}

fn apply_regex(re: &Regex, value: &str, replace: Option<&str>, group: Option<usize>) -> String {
    match replace {
        Some(rep) => re.replace_all(value, rep).into_owned(),
        None => match re.captures(value) {
            Some(caps) => caps
                .get(group.unwrap_or(0))
                .map(|m| m.as_str().to_string())
                .unwrap_or_else(|| value.to_string()),
            None => value.to_string(),
        },
    }
}

fn decode_base64(value: &str, warnings: &mut Vec<String>) -> String {
    match BASE64_STANDARD.decode(value.trim()) {
        Ok(bytes) => String::from_utf8_lossy(&bytes).into_owned(),
        Err(_) => {
            warnings.push(format!("base64 解码失败,原样保留: {value}"));
            value.to_string()
        }
    }
}

fn apply_url_replace(value: &str, rules: &[UrlReplaceRule]) -> String {
    let mut out = value.to_string();
    for rule in rules {
        out = out.replace(&rule.from, &rule.to);
    }
    out
}

fn resolve_url(value: &str, base: Option<&str>, warnings: &mut Vec<String>) -> String {
    if let Ok(u) = Url::parse(value) {
        if u.has_host() {
            return value.to_string();
        }
    }
    match base {
        Some(b) => match Url::parse(b).and_then(|bu| bu.join(value)) {
            Ok(joined) => joined.to_string(),
            Err(e) => {
                warnings.push(format!("URL 解析失败 base={b} rel={value}: {e}"));
                value.to_string()
            }
        },
        None => {
            warnings.push(format!("resolveUrl 无 base,原样保留: {value}"));
            value.to_string()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn run(values: Vec<&str>, ops: &[PipelineOp]) -> (Vec<String>, Vec<String>) {
        let mut warnings = Vec::new();
        let ctx = PipelineContext::default();
        let out = apply_pipeline(
            values.into_iter().map(String::from).collect(),
            ops,
            &ctx,
            &mut warnings,
        );
        (out, warnings)
    }

    #[test]
    fn regex_replace_removes_pattern() {
        let (out, _) = run(
            vec!["正文【请收藏】小说网内容继续"],
            &[PipelineOp::Regex {
                pattern: "【请收藏】.+?网".into(),
                replace: Some("".into()),
                flags: None,
                group: None,
            }],
        );
        assert_eq!(out[0], "正文内容继续");
    }

    #[test]
    fn regex_extract_group() {
        let (out, _) = run(
            vec!["book_id=12345&x=1"],
            &[PipelineOp::Regex {
                pattern: r"book_id=(\d+)".into(),
                replace: None,
                flags: None,
                group: Some(1),
            }],
        );
        assert_eq!(out[0], "12345");
    }

    #[test]
    fn regex_case_insensitive_flag() {
        let (out, _) = run(
            vec!["Hello WORLD"],
            &[PipelineOp::Regex {
                pattern: "world".into(),
                replace: Some("Rust".into()),
                flags: Some("i".into()),
                group: None,
            }],
        );
        assert_eq!(out[0], "Hello Rust");
    }

    #[test]
    fn base64_decode_roundtrip() {
        let encoded = BASE64_STANDARD.encode("你好世界");
        let (out, warns) = run(vec![&encoded], &[PipelineOp::Base64Decode]);
        assert_eq!(out[0], "你好世界");
        assert!(warns.is_empty());
    }

    #[test]
    fn base64_invalid_keeps_value_with_warning() {
        let (out, warns) = run(vec!["@@not-base64@@"], &[PipelineOp::Base64Decode]);
        assert_eq!(out[0], "@@not-base64@@");
        assert_eq!(warns.len(), 1);
    }

    #[test]
    fn url_replace_on_value() {
        let (out, _) = run(
            vec!["http://m.jiugangbi.com/x"],
            &[PipelineOp::UrlReplace {
                rules: vec![UrlReplaceRule {
                    from: "http://m".into(),
                    to: "http://www".into(),
                }],
            }],
        );
        assert_eq!(out[0], "http://www.jiugangbi.com/x");
    }

    #[test]
    fn resolve_url_relative_against_base() {
        let mut warnings = Vec::new();
        let ctx = PipelineContext {
            base_url: Some("http://www.jiugangbi.com/book/1/".into()),
        };
        let out = apply_pipeline(
            vec!["chapter-3.html".into()],
            &[PipelineOp::ResolveUrl { base: None }],
            &ctx,
            &mut warnings,
        );
        assert_eq!(out[0], "http://www.jiugangbi.com/book/1/chapter-3.html");
        assert!(warnings.is_empty());
    }

    #[test]
    fn resolve_url_absolute_passthrough() {
        let (out, _) = run(
            vec!["http://x.com/a"],
            &[PipelineOp::ResolveUrl {
                base: Some("http://y.com/".into()),
            }],
        );
        assert_eq!(out[0], "http://x.com/a");
    }

    #[test]
    fn resolve_url_without_base_warns() {
        let (out, warns) = run(vec!["/rel"], &[PipelineOp::ResolveUrl { base: None }]);
        assert_eq!(out[0], "/rel");
        assert_eq!(warns.len(), 1);
    }

    #[test]
    fn trim_and_join_collapse_list() {
        let (out, _) = run(
            vec![" 第一段 ", " 第二段 "],
            &[PipelineOp::Trim, PipelineOp::Join { sep: "\n".into() }],
        );
        assert_eq!(out, vec!["第一段\n第二段"]);
    }

    #[test]
    fn script_op_is_skipped_with_warning() {
        let (out, warns) = run(
            vec!["keep"],
            &[PipelineOp::Script {
                script_id: "clean1".into(),
                lang: None,
            }],
        );
        assert_eq!(out[0], "keep");
        assert_eq!(warns.len(), 1);
    }

    #[test]
    fn chained_ops_run_in_order() {
        // base64 解码出一段含广告的正文,再用正则清洗。
        let encoded = BASE64_STANDARD.encode("章节正文(广告)结束");
        let (out, warns) = run(
            vec![&encoded],
            &[
                PipelineOp::Base64Decode,
                PipelineOp::Regex {
                    pattern: r"\(.+?\)".into(),
                    replace: Some("".into()),
                    flags: None,
                    group: None,
                },
            ],
        );
        assert_eq!(out[0], "章节正文结束");
        assert!(warns.is_empty());
    }

    #[test]
    fn deserializes_camel_case_pipeline_ops() {
        let json = r#"[
            { "op": "base64Decode" },
            { "op": "regex", "pattern": "ad", "replace": "", "flags": "i" },
            { "op": "urlReplace", "rules": [{ "from": "http://m", "to": "http://www" }] },
            { "op": "resolveUrl", "base": "http://x.com/" },
            { "op": "trim" },
            { "op": "join", "sep": "\n" },
            { "op": "script", "scriptId": "s1", "lang": "js" }
        ]"#;
        let ops: Vec<PipelineOp> = serde_json::from_str(json).unwrap();
        assert_eq!(ops.len(), 7);
        assert!(matches!(ops[0], PipelineOp::Base64Decode));
        assert!(matches!(ops[6], PipelineOp::Script { .. }));
    }
}
