//! JSONPath 引擎 —— 书源 `key$$` 点号路径语义(line-B item 1/2)。
//! source-parser 已把 `key$$data.key$$search_list` 归一为 `data.search_list`;
//! 这里再防御性剥离残留 `key$$`,按 `.` 拆段遍历对象键 / 数组下标。

use serde_json::Value;

/// 归一化路径:剥离 `key$$` 前缀标记。
pub fn normalize_path(path: &str) -> String {
    path.replace("key$$", "")
}

/// 按点号路径解析到一个值。段为数字时按数组下标取。路径为空返回根。
pub fn resolve<'a>(root: &'a Value, path: &str) -> Option<&'a Value> {
    let norm = normalize_path(path);
    let mut cur = root;
    for seg in norm.split('.') {
        if seg.is_empty() {
            continue;
        }
        cur = match cur {
            Value::Object(map) => map.get(seg)?,
            Value::Array(arr) => {
                let idx: usize = seg.parse().ok()?;
                arr.get(idx)?
            }
            _ => return None,
        };
    }
    Some(cur)
}

/// 解析到数组(列表容器,如 `data.search_list`)。
pub fn resolve_array<'a>(root: &'a Value, path: &str) -> Option<&'a Vec<Value>> {
    resolve(root, path).and_then(Value::as_array)
}

/// 把 JSON 值转成字段字符串。null → None;标量直出;对象/数组 → 序列化文本。
pub fn value_to_string(v: &Value) -> Option<String> {
    match v {
        Value::Null => None,
        Value::String(s) => Some(s.clone()),
        Value::Bool(b) => Some(b.to_string()),
        Value::Number(n) => Some(n.to_string()),
        Value::Array(_) | Value::Object(_) => Some(v.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn sample() -> Value {
        json!({
            "data": {
                "search_list": [
                    { "book_id": "111", "title": "剑来", "author": "烽火戏诸侯" },
                    { "book_id": "222", "title": "大奉打更人", "author": "卖报小郎君" }
                ]
            }
        })
    }

    #[test]
    fn normalizes_key_prefix() {
        assert_eq!(
            normalize_path("key$$data.key$$search_list"),
            "data.search_list"
        );
        assert_eq!(normalize_path("key$$id"), "id");
    }

    #[test]
    fn resolves_array_with_key_prefix() {
        let v = sample();
        let arr = resolve_array(&v, "key$$data.key$$search_list").unwrap();
        assert_eq!(arr.len(), 2);
    }

    #[test]
    fn resolves_dotted_with_numeric_index() {
        let v = sample();
        let title = resolve(&v, "data.search_list.0.title").and_then(value_to_string);
        assert_eq!(title.as_deref(), Some("剑来"));
    }

    #[test]
    fn missing_path_is_none() {
        let v = sample();
        assert!(resolve(&v, "data.nope").is_none());
    }

    #[test]
    fn number_stringifies() {
        let v = json!({ "n": 42 });
        assert_eq!(
            resolve(&v, "n").and_then(value_to_string).as_deref(),
            Some("42")
        );
    }
}
