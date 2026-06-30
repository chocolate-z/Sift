//! 文本下载命令:把采集到的正文等文本写盘到系统下载目录下的 Sift 文件夹,返回真实路径。
//! 自有命令直接用 std::fs,无需 fs/dialog 插件(权限仅约束插件 API,不约束本壳命令)。

use std::path::PathBuf;

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

#[cfg(test)]
mod tests {
    use super::sanitize_filename;

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
