//! 打开 / 定位文件命令:已完成记录的「打开」用系统默认程序打开文件,「定位」在文件管理器中
//! 选中。自有壳命令直接用 std::process,无需 opener/shell 插件。

/// 用系统默认程序打开文件。
#[tauri::command]
pub fn open_path(path: String) -> Result<(), String> {
    open_target(&path, false)
}

/// 在系统文件管理器中定位(选中)文件。
#[tauri::command]
pub fn reveal_path(path: String) -> Result<(), String> {
    open_target(&path, true)
}

#[cfg(target_os = "windows")]
fn open_target(path: &str, reveal: bool) -> Result<(), String> {
    use std::process::Command;
    let spawned = if reveal {
        Command::new("explorer")
            .arg(format!("/select,{path}"))
            .spawn()
    } else {
        Command::new("cmd").args(["/C", "start", "", path]).spawn()
    };
    spawned.map(|_| ()).map_err(|e| e.to_string())
}

#[cfg(target_os = "macos")]
fn open_target(path: &str, reveal: bool) -> Result<(), String> {
    use std::process::Command;
    let mut cmd = Command::new("open");
    if reveal {
        cmd.arg("-R");
    }
    cmd.arg(path).spawn().map(|_| ()).map_err(|e| e.to_string())
}

#[cfg(all(unix, not(target_os = "macos")))]
fn open_target(path: &str, reveal: bool) -> Result<(), String> {
    use std::path::Path;
    use std::process::Command;
    // Linux 无标准「定位」语义;定位退化为打开父目录。
    let target = if reveal {
        Path::new(path)
            .parent()
            .and_then(|p| p.to_str())
            .unwrap_or(path)
    } else {
        path
    };
    Command::new("xdg-open")
        .arg(target)
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}
