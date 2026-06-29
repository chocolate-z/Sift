use encoding_rs::Encoding;

/// 将响应字节解码为文本。优先级:显式编码标签 > Content-Type 的 charset > UTF-8。
/// 返回 (文本, 实际所用编码名)。无法识别的标签回退到下一级。
///
/// 说明:WHATWG 把 `gb2312`/`gbk` 统一映射到 GBK,故 `encoding_used` 可能为 "GBK"。
/// HTML `<meta charset>` 嗅探属解析层职责,请求层不处理。
pub(crate) fn decode_body(
    bytes: &[u8],
    explicit: Option<&str>,
    content_type: Option<&str>,
) -> (String, String) {
    if let Some(enc) = explicit.and_then(label_to_encoding) {
        return decode_with(bytes, enc);
    }
    if let Some(enc) = content_type
        .and_then(charset_from_content_type)
        .as_deref()
        .and_then(label_to_encoding)
    {
        return decode_with(bytes, enc);
    }
    decode_with(bytes, encoding_rs::UTF_8)
}

fn decode_with(bytes: &[u8], enc: &'static Encoding) -> (String, String) {
    let (text, _, _) = enc.decode(bytes);
    (text.into_owned(), enc.name().to_string())
}

fn label_to_encoding(label: &str) -> Option<&'static Encoding> {
    let label = label.trim();
    if label.is_empty() {
        return None;
    }
    Encoding::for_label(label.as_bytes())
}

/// 从 `text/html; charset=gb2312` 提取 charset 值。
fn charset_from_content_type(ct: &str) -> Option<String> {
    ct.split(';').find_map(|part| {
        let part = part.trim();
        if part.len() >= 8 && part[..8].eq_ignore_ascii_case("charset=") {
            Some(part[8..].trim().trim_matches('"').to_string())
        } else {
            None
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn gbk_bytes(s: &str) -> Vec<u8> {
        let (bytes, _, had_errors) = encoding_rs::GBK.encode(s);
        assert!(!had_errors);
        bytes.into_owned()
    }

    #[test]
    fn explicit_gb2312_decodes() {
        let bytes = gbk_bytes("你好世界");
        let (text, used) = decode_body(&bytes, Some("gb2312"), None);
        assert_eq!(text, "你好世界");
        assert_eq!(used, "GBK");
    }

    #[test]
    fn content_type_charset_decodes() {
        let bytes = gbk_bytes("中文测试");
        let (text, used) = decode_body(&bytes, None, Some("text/html; charset=gbk"));
        assert_eq!(text, "中文测试");
        assert_eq!(used, "GBK");
    }

    #[test]
    fn defaults_to_utf8() {
        let bytes = "hello 你好".as_bytes();
        let (text, used) = decode_body(bytes, None, Some("text/html"));
        assert_eq!(text, "hello 你好");
        assert_eq!(used, "UTF-8");
    }

    #[test]
    fn unknown_label_falls_back() {
        let bytes = "plain".as_bytes();
        let (text, used) = decode_body(bytes, Some("not-a-real-charset"), None);
        assert_eq!(text, "plain");
        assert_eq!(used, "UTF-8");
    }

    #[test]
    fn explicit_overrides_content_type() {
        let bytes = gbk_bytes("优先级");
        // Content-Type 谎报 utf-8,显式 gb2312 应胜出。
        let (text, _) = decode_body(&bytes, Some("gb2312"), Some("text/html; charset=utf-8"));
        assert_eq!(text, "优先级");
    }
}
