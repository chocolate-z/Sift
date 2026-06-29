//! CSS 引擎(scraper + 自实现伪类层,§5.4 选型)。标准 CSS 由 scraper/selectors
//! 解析;`:gt/:lt/:eq` 经 pseudo 层逐段执行。无效的单个选择器记为 warning 跳过,
//! 不中断整体解析。

use scraper::{ElementRef, Selector};

use super::pseudo::{apply_positional, split_selector_list, translate_pseudo};
use super::{Extraction, SelectorExpr};

fn parse_selector(expr: &str, warnings: &mut Vec<String>) -> Option<Selector> {
    match Selector::parse(expr) {
        Ok(sel) => Some(sel),
        Err(_) => {
            warnings.push(format!("无效 CSS 选择器,已跳过: {expr}"));
            None
        }
    }
}

/// 在 `scope` 子树内执行单个(可含伪类的)选择器,返回匹配元素。
fn select_with_pseudo<'a>(
    scope: ElementRef<'a>,
    expr: &str,
    warnings: &mut Vec<String>,
) -> Vec<ElementRef<'a>> {
    let t = translate_pseudo(expr);
    if !t.had_pseudo {
        return match parse_selector(expr, warnings) {
            Some(sel) => scope.select(&sel).collect(),
            None => Vec::new(),
        };
    }

    let mut current: Vec<ElementRef<'a>> = Vec::new();
    for (i, seg) in t.segments.iter().enumerate() {
        if !seg.selector.is_empty() {
            if let Some(sel) = parse_selector(&seg.selector, warnings) {
                current = if i == 0 {
                    scope.select(&sel).collect()
                } else {
                    current.iter().flat_map(|el| el.select(&sel)).collect()
                };
            } else {
                return Vec::new();
            }
        }
        current = apply_positional(&current, &seg.op);
    }
    if !t.rest.is_empty() {
        if let Some(sel) = parse_selector(&t.rest, warnings) {
            current = current.iter().flat_map(|el| el.select(&sel)).collect();
        }
    }
    current
}

/// 在 `scope` 内解析一个字段选择器:展开顶层逗号 + fallback 备选,首个命中即止。
pub(super) fn select_field<'a>(
    scope: ElementRef<'a>,
    sel: &SelectorExpr,
    warnings: &mut Vec<String>,
) -> Vec<ElementRef<'a>> {
    let mut alts = split_selector_list(&sel.expr);
    for fb in &sel.fallbacks {
        alts.extend(split_selector_list(fb));
    }
    for alt in &alts {
        let matched = select_with_pseudo(scope, alt, warnings);
        if !matched.is_empty() {
            return matched;
        }
    }
    Vec::new()
}

/// 从元素取值:文本 / 属性 / inner_html。
pub(super) fn extract(el: ElementRef, ex: &Extraction) -> Option<String> {
    match ex {
        Extraction::Text => Some(el.text().collect::<String>().trim().to_string()),
        Extraction::Attr { name } => el.value().attr(name).map(str::to_string),
        Extraction::Html => Some(el.inner_html()),
    }
}

/// 在 `scope` 内解析字段选择器,对全部命中元素取值(供管线后处理 / join)。
pub(super) fn select_values(
    scope: ElementRef,
    sel: &SelectorExpr,
    warnings: &mut Vec<String>,
) -> Vec<String> {
    select_field(scope, sel, warnings)
        .iter()
        .filter_map(|el| extract(*el, &sel.extract))
        .collect()
}
