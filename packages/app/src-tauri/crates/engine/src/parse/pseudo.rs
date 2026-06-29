//! jQuery 位置伪类转译(line-B item 7/8)。标准 CSS 不支持 `:gt/:lt/:eq`,
//! 故把携带伪类的选择器拆成 (标准 CSS 段, 位置算子) 链 + 末段 rest,
//! 由 CSS 引擎逐段在全局匹配集上执行算子再下钻(jQuery 语义)。算子的应用是
//! 与 DOM 库无关的可测核心。逻辑与 `@sift/source-parser` 的 pseudo.ts 对齐。

use regex::Regex;
use std::sync::OnceLock;

/// 位置算子:
///   :gt(N) → slice(N+1)   (索引 N 之后的元素)
///   :lt(N) → slice(0, N)  (索引 N 之前的元素)
///   :eq(N) → 第 N 个(支持负索引,从末尾计)
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PositionalOp {
    Gt(i64),
    Lt(i64),
    Eq(i64),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Segment {
    /// 该段前的标准 CSS 选择器(已剥离前导 `>` 组合符)。
    pub selector: String,
    pub op: PositionalOp,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Translated {
    pub segments: Vec<Segment>,
    /// 最后一个伪类之后剩余的标准 CSS。
    pub rest: String,
    pub had_pseudo: bool,
}

fn pseudo_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r":(gt|lt|eq)\(\s*(-?\d+)\s*\)").unwrap())
}

pub fn has_jquery_pseudo(selector: &str) -> bool {
    pseudo_re().is_match(selector)
}

fn strip_leading_combinator(s: &str) -> String {
    let t = s.trim_start();
    let t = t.strip_prefix('>').unwrap_or(t);
    t.trim().to_string()
}

/// 把可能含位置伪类的选择器转译为段链 + rest。
/// 例:`.a .b ul li:gt(8) a` → segments=[{`.a .b ul li`, gt(8)}], rest=`a`。
pub fn translate_pseudo(selector: &str) -> Translated {
    let re = pseudo_re();
    let mut segments = Vec::new();
    let mut last = 0usize;
    let mut had = false;
    for cap in re.captures_iter(selector) {
        had = true;
        let whole = cap.get(0).unwrap();
        let chunk = &selector[last..whole.start()];
        let n: i64 = cap[2].parse().unwrap_or(0);
        let op = match &cap[1] {
            "gt" => PositionalOp::Gt(n),
            "lt" => PositionalOp::Lt(n),
            _ => PositionalOp::Eq(n),
        };
        segments.push(Segment {
            selector: strip_leading_combinator(chunk),
            op,
        });
        last = whole.end();
    }
    if !had {
        return Translated {
            segments: Vec::new(),
            rest: selector.to_string(),
            had_pseudo: false,
        };
    }
    Translated {
        segments,
        rest: strip_leading_combinator(&selector[last..]),
        had_pseudo: true,
    }
}

/// 对元素数组应用位置算子 —— 与 DOM 库无关的可验证核心。
pub fn apply_positional<T: Clone>(items: &[T], op: &PositionalOp) -> Vec<T> {
    match *op {
        PositionalOp::Gt(n) => {
            let start = (n + 1).max(0) as usize;
            if start >= items.len() {
                Vec::new()
            } else {
                items[start..].to_vec()
            }
        }
        PositionalOp::Lt(n) => {
            let end = (n.max(0) as usize).min(items.len());
            items[..end].to_vec()
        }
        PositionalOp::Eq(n) => {
            let idx = if n < 0 { items.len() as i64 + n } else { n };
            if idx < 0 {
                Vec::new()
            } else {
                items.get(idx as usize).cloned().into_iter().collect()
            }
        }
    }
}

/// 顶层逗号切分(line-B item 8):括号 `[...]`/`(...)`、引号内的逗号保留。
/// 用于把逗号分隔的选择器列拆成 fallback 备选(首个命中即止,非 CSS 并集)。
pub fn split_selector_list(selector: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut bracket = 0i32;
    let mut paren = 0i32;
    let mut quote: Option<char> = None;
    let mut buf = String::new();
    let chars: Vec<char> = selector.chars().collect();
    for i in 0..chars.len() {
        let ch = chars[i];
        if let Some(q) = quote {
            buf.push(ch);
            if ch == q && (i == 0 || chars[i - 1] != '\\') {
                quote = None;
            }
            continue;
        }
        match ch {
            '"' | '\'' => {
                quote = Some(ch);
                buf.push(ch);
                continue;
            }
            '[' => bracket += 1,
            ']' => bracket = (bracket - 1).max(0),
            '(' => paren += 1,
            ')' => paren = (paren - 1).max(0),
            _ => {}
        }
        if ch == ',' && bracket == 0 && paren == 0 {
            let t = buf.trim();
            if !t.is_empty() {
                out.push(t.to_string());
            }
            buf.clear();
            continue;
        }
        buf.push(ch);
    }
    let last = buf.trim();
    if !last.is_empty() {
        out.push(last.to_string());
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn gt_returns_elements_after_index() {
        // §6.3 item 7:15 元素 :gt(8) 返回后 6 个。
        let items: Vec<i32> = (0..15).collect();
        let got = apply_positional(&items, &PositionalOp::Gt(8));
        assert_eq!(got, vec![9, 10, 11, 12, 13, 14]);
    }

    #[test]
    fn lt_returns_elements_before_index() {
        let items: Vec<i32> = (0..15).collect();
        let got = apply_positional(&items, &PositionalOp::Lt(3));
        assert_eq!(got, vec![0, 1, 2]);
    }

    #[test]
    fn eq_returns_single_at_index() {
        let items: Vec<i32> = (0..15).collect();
        assert_eq!(apply_positional(&items, &PositionalOp::Eq(6)), vec![6]);
        assert_eq!(apply_positional(&items, &PositionalOp::Eq(-1)), vec![14]);
        assert_eq!(
            apply_positional(&items, &PositionalOp::Eq(99)),
            Vec::<i32>::new()
        );
    }

    #[test]
    fn translates_chapter_list_selector() {
        let t = translate_pseudo(".indexyfw_listbox .listchapter ul li:gt(8) a");
        assert!(t.had_pseudo);
        assert_eq!(t.segments.len(), 1);
        assert_eq!(
            t.segments[0].selector,
            ".indexyfw_listbox .listchapter ul li"
        );
        assert_eq!(t.segments[0].op, PositionalOp::Gt(8));
        assert_eq!(t.rest, "a");
    }

    #[test]
    fn translates_eq_with_child_combinator() {
        let t = translate_pseudo(".currentlocationyfw > p:eq(6) a");
        assert!(t.had_pseudo);
        assert_eq!(t.segments[0].selector, ".currentlocationyfw > p");
        assert_eq!(t.segments[0].op, PositionalOp::Eq(6));
        assert_eq!(t.rest, "a");
    }

    #[test]
    fn no_pseudo_keeps_selector() {
        let t = translate_pseudo(".a .b");
        assert!(!t.had_pseudo);
        assert_eq!(t.rest, ".a .b");
        assert!(t.segments.is_empty());
    }

    #[test]
    fn splits_top_level_commas_only() {
        let got = split_selector_list("p.p1 a[href^='http://www.x.com/,y'],.indexyfw_novel");
        assert_eq!(
            got,
            vec!["p.p1 a[href^='http://www.x.com/,y']", ".indexyfw_novel"]
        );
    }
}
