//! 文本下载命令:把采集到的正文等文本写盘到系统下载目录下的 Sift 文件夹,返回真实路径。
//! 自有命令直接用 std::fs,无需 fs/dialog 插件(权限仅约束插件 API,不约束本壳命令)。

use std::path::PathBuf;

use serde::Serialize;
use sift_engine::HttpClient;
use tauri::Manager;

/// 清洗文件名:路径分隔符与非法字符替为下划线,去首尾空白与点,截断超长,空则给默认名。
fn sanitize_filename(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| {
            if "\\/:*?\"<>|\r\n\t".contains(c) {
                '_'
            } else {
                c
            }
        })
        .collect();
    let trimmed = cleaned.trim().trim_matches('.').trim();
    let base = if trimmed.is_empty() {
        "sift-download"
    } else {
        trimmed
    };
    base.chars().take(120).collect()
}

/// 下载根目录:系统下载目录(取不到则回退应用数据目录)下的 Sift 子目录,确保存在。
fn download_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let base = app
        .path()
        .download_dir()
        .or_else(|_| app.path().app_data_dir())
        .map_err(|e| e.to_string())?;
    let dir = base.join("Sift");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// 写一段文本到下载目录,返回写入的绝对路径。
#[tauri::command]
pub fn save_text_file(
    app: tauri::AppHandle,
    name: String,
    content: String,
) -> Result<String, String> {
    let path = download_root(&app)?.join(sanitize_filename(&name));
    std::fs::write(&path, content).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}

/// 单个文件的下载结果。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadResult {
    pub url: String,
    pub ok: bool,
    pub path: Option<String>,
    pub size: u64,
    pub error: Option<String>,
}

/// 一批下载的产物:落盘子目录 + 逐条结果。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadBatch {
    pub dir: String,
    pub results: Vec<DownloadResult>,
}

/// 由 Content-Type 推断扩展名(URL 基名无扩展名时兜底)。
fn ext_for_content_type(ct: &str) -> Option<&'static str> {
    Some(match ct.split(';').next().unwrap_or("").trim() {
        "image/jpeg" => "jpg",
        "image/png" => "png",
        "image/gif" => "gif",
        "image/webp" => "webp",
        "image/svg+xml" => "svg",
        "image/bmp" => "bmp",
        "application/pdf" => "pdf",
        "text/plain" => "txt",
        "application/zip" => "zip",
        _ => return None,
    })
}

/// 为下载的文件取名:优先用 URL 路径基名(带扩展名);否则 file_{idx} + 由 Content-Type 推断扩展名。
fn file_name_for(url: &str, idx: usize, content_type: Option<&str>) -> String {
    let raw = url
        .split(['?', '#'])
        .next()
        .unwrap_or(url)
        .rsplit('/')
        .next()
        .unwrap_or("")
        .trim();
    if raw.contains('.') && !raw.ends_with('.') {
        return sanitize_filename(raw);
    }
    let ext = content_type.and_then(ext_for_content_type).unwrap_or("bin");
    format!("file_{idx}.{ext}")
}

/// 批量下载文件(图片/文件链接)到下载目录下的 `Sift/<subdir>/`,逐条返回结果。
/// 顺序下载(温和),走引擎 client(宽容头);状态码 >=400 记为失败。
#[tauri::command]
pub async fn download_files(
    app: tauri::AppHandle,
    urls: Vec<String>,
    subdir: String,
) -> Result<DownloadBatch, String> {
    let dir = download_root(&app)?.join(sanitize_filename(&subdir));
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let client = HttpClient::unlimited().map_err(|e| e.to_string())?;

    let mut results = Vec::with_capacity(urls.len());
    for (idx, url) in urls.iter().enumerate() {
        let fail = |error: String| DownloadResult {
            url: url.clone(),
            ok: false,
            path: None,
            size: 0,
            error: Some(error),
        };
        let r = match client.download_bytes(url, 30_000).await {
            Ok(f) if f.status < 400 => {
                let path = dir.join(file_name_for(url, idx, f.content_type.as_deref()));
                match std::fs::write(&path, &f.bytes) {
                    Ok(()) => DownloadResult {
                        url: url.clone(),
                        ok: true,
                        path: Some(path.to_string_lossy().into_owned()),
                        size: f.bytes.len() as u64,
                        error: None,
                    },
                    Err(e) => fail(e.to_string()),
                }
            }
            Ok(f) => fail(format!("HTTP {}", f.status)),
            Err(e) => fail(e.to_string()),
        };
        results.push(r);
    }
    Ok(DownloadBatch {
        dir: dir.to_string_lossy().into_owned(),
        results,
    })
}

#[cfg(test)]
mod tests {
    use super::{file_name_for, sanitize_filename};

    #[test]
    fn file_name_uses_url_basename_with_extension() {
        assert_eq!(file_name_for("https://x.com/a/cover.jpg", 0, None), "cover.jpg");
        assert_eq!(
            file_name_for("https://x.com/img/p.png?v=2#f", 3, Some("image/png")),
            "p.png"
        );
    }

    #[test]
    fn file_name_falls_back_to_index_and_content_type() {
        assert_eq!(file_name_for("https://x.com/img/", 2, Some("image/jpeg")), "file_2.jpg");
        assert_eq!(file_name_for("https://x.com/download?id=9", 0, Some("application/pdf")), "file_0.pdf");
        assert_eq!(file_name_for("https://x.com/x", 1, None), "file_1.bin");
    }

    #[test]
    fn sanitize_replaces_path_and_illegal_chars() {
        assert_eq!(sanitize_filename("a/b\\c:d.txt"), "a_b_c_d.txt");
        assert_eq!(sanitize_filename("书名?<>|.txt"), "书名____.txt");
    }

    #[test]
    fn sanitize_trims_and_defaults_empty() {
        assert_eq!(sanitize_filename("  ..全本..  "), "全本");
        assert_eq!(sanitize_filename(""), "sift-download");
        assert_eq!(sanitize_filename("   "), "sift-download");
    }
}
