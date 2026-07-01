//! 文本下载命令:把采集到的正文等文本写盘到系统下载目录下的 Sift 文件夹,返回真实路径。
//! 自有命令直接用 std::fs,无需 fs/dialog 插件(权限仅约束插件 API,不约束本壳命令)。

use std::path::PathBuf;

use futures_util::StreamExt;
use serde::Serialize;
use sift_engine::HttpClient;
use tauri::ipc::Channel;
use tauri::Manager;

/// 单文件下载并发上限(2a;限速/暂停/续传留 2b)。
const MAX_CONCURRENCY: usize = 4;

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

/// URL 路径最后一段(去查询/锚点、去两端空白)。
fn url_basename(url: &str) -> &str {
    url.split(['?', '#'])
        .next()
        .unwrap_or(url)
        .rsplit('/')
        .next()
        .unwrap_or("")
        .trim()
}

/// 在文件名扩展名前插入后缀(cover.jpg + "_1" → cover_1.jpg;无扩展名则直接追加)。
fn insert_suffix(name: &str, suffix: &str) -> String {
    match name.rfind('.') {
        Some(dot) if dot > 0 => format!("{}{}{}", &name[..dot], suffix, &name[dot..]),
        _ => format!("{name}{suffix}"),
    }
}

/// 为下载的文件取名:优先用 URL 路径基名(带扩展名);否则 file_{idx} + 由 Content-Type 推断扩展名。
fn file_name_for(url: &str, idx: usize, content_type: Option<&str>) -> String {
    let raw = url_basename(url);
    if raw.contains('.') && !raw.ends_with('.') {
        return sanitize_filename(raw);
    }
    let ext = content_type.and_then(ext_for_content_type).unwrap_or("bin");
    format!("file_{idx}.{ext}")
}

/// 下载进度事件(经 Tauri Channel 实时回传给前端下载队列)。
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum DlEvent {
    Queued {
        id: usize,
        name: String,
    },
    Progress {
        id: usize,
        downloaded: u64,
        total: Option<u64>,
    },
    Done {
        id: usize,
        path: String,
        size: u64,
    },
    Failed {
        id: usize,
        error: String,
    },
}

/// 列表里先用的展示名(URL 基名;无名则「文件 N」)。最终名完成时由路径更新。
fn provisional_name(url: &str, id: usize) -> String {
    let raw = url_basename(url);
    if raw.is_empty() {
        format!("文件 {}", id + 1)
    } else {
        sanitize_filename(raw)
    }
}

fn fail_result(url: &str, error: String) -> DownloadResult {
    DownloadResult {
        url: url.to_string(),
        ok: false,
        path: None,
        size: 0,
        error: Some(error),
    }
}

/// 批量下载文件(图片/文件链接)到下载目录下的 `Sift/<subdir>/`,流式回传实时进度。
/// 并发上限 MAX_CONCURRENCY;走引擎 client(宽容头);状态码 >=400 记为失败。
#[tauri::command]
pub async fn download_files_live(
    app: tauri::AppHandle,
    urls: Vec<String>,
    subdir: String,
    channel: Channel<DlEvent>,
) -> Result<DownloadBatch, String> {
    let dir = download_root(&app)?.join(sanitize_filename(&subdir));
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let client = std::sync::Arc::new(HttpClient::unlimited().map_err(|e| e.to_string())?);

    // 串行预分配唯一文件名:基名带扩展名的先定名去重(同批 cover.jpg×N → cover.jpg/cover_1.jpg…),
    // 避免并发 std::fs::write 写同一路径互相覆盖静默丢文件;无扩展名的留待下载后按 Content-Type
    // 定(file_{id} 天然唯一)。
    let mut used: std::collections::HashSet<String> = std::collections::HashSet::new();
    let planned: Vec<(usize, String, Option<String>)> = urls
        .into_iter()
        .enumerate()
        .map(|(id, url)| {
            let raw = url_basename(&url);
            let reserved = if raw.contains('.') && !raw.ends_with('.') {
                let base = sanitize_filename(raw);
                let mut name = base.clone();
                let mut k = 1;
                while used.contains(&name) {
                    name = insert_suffix(&base, &format!("_{k}"));
                    k += 1;
                }
                used.insert(name.clone());
                Some(name)
            } else {
                None
            };
            (id, url, reserved)
        })
        .collect();

    // 各 future 持有 owned 克隆(Arc client / clone dir+channel / owned url),避免并发借用
    // 引用带来的生命周期纠缠("FnOnce not general enough")。
    let mut indexed: Vec<(usize, DownloadResult)> = futures_util::stream::iter(planned)
        .map(|(id, url, reserved)| {
            let client = client.clone();
            let dir = dir.clone();
            let channel = channel.clone();
            async move {
                let _ = channel.send(DlEvent::Queued {
                    id,
                    name: provisional_name(&url, id),
                });
                let mut last = 0u64;
                let result = match client
                    .download_streamed(&url, 60_000, |downloaded, total| {
                        // 限频:每 ~64KB 或起始时回传一次,避免刷屏。
                        if downloaded == 0 || downloaded.saturating_sub(last) >= 65_536 {
                            last = downloaded;
                            let _ = channel.send(DlEvent::Progress {
                                id,
                                downloaded,
                                total,
                            });
                        }
                    })
                    .await
                {
                    Ok(f) if f.status < 400 => {
                        let name = reserved
                            .clone()
                            .unwrap_or_else(|| file_name_for(&url, id, f.content_type.as_deref()));
                        let path = dir.join(name);
                        match std::fs::write(&path, &f.bytes) {
                            Ok(()) => {
                                let p = path.to_string_lossy().into_owned();
                                let size = f.bytes.len() as u64;
                                let _ = channel.send(DlEvent::Done {
                                    id,
                                    path: p.clone(),
                                    size,
                                });
                                DownloadResult {
                                    url,
                                    ok: true,
                                    path: Some(p),
                                    size,
                                    error: None,
                                }
                            }
                            Err(e) => {
                                let _ = channel.send(DlEvent::Failed {
                                    id,
                                    error: e.to_string(),
                                });
                                fail_result(&url, e.to_string())
                            }
                        }
                    }
                    Ok(f) => {
                        let err = format!("HTTP {}", f.status);
                        let _ = channel.send(DlEvent::Failed {
                            id,
                            error: err.clone(),
                        });
                        fail_result(&url, err)
                    }
                    Err(e) => {
                        let _ = channel.send(DlEvent::Failed {
                            id,
                            error: e.to_string(),
                        });
                        fail_result(&url, e.to_string())
                    }
                };
                (id, result)
            }
        })
        .buffer_unordered(MAX_CONCURRENCY)
        .collect()
        .await;

    indexed.sort_by_key(|(id, _)| *id);
    Ok(DownloadBatch {
        dir: dir.to_string_lossy().into_owned(),
        results: indexed.into_iter().map(|(_, r)| r).collect(),
    })
}

#[cfg(test)]
mod tests {
    use super::{file_name_for, insert_suffix, sanitize_filename};

    #[test]
    fn insert_suffix_goes_before_extension() {
        assert_eq!(insert_suffix("cover.jpg", "_1"), "cover_1.jpg");
        assert_eq!(insert_suffix("archive.tar.gz", "_2"), "archive.tar_2.gz");
        assert_eq!(insert_suffix("noext", "_3"), "noext_3");
    }

    #[test]
    fn file_name_uses_url_basename_with_extension() {
        assert_eq!(
            file_name_for("https://x.com/a/cover.jpg", 0, None),
            "cover.jpg"
        );
        assert_eq!(
            file_name_for("https://x.com/img/p.png?v=2#f", 3, Some("image/png")),
            "p.png"
        );
    }

    #[test]
    fn file_name_falls_back_to_index_and_content_type() {
        assert_eq!(
            file_name_for("https://x.com/img/", 2, Some("image/jpeg")),
            "file_2.jpg"
        );
        assert_eq!(
            file_name_for("https://x.com/download?id=9", 0, Some("application/pdf")),
            "file_0.pdf"
        );
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
