//! 本地持久化的 Tauri 命令。数据集的 columns/rows 由前端序列化为 JSON 字符串透明存取。
//! Db 在 setup 时按应用数据目录打开并 manage 进 State。

use sift_storage::{DatasetBlob, DatasetMeta, Db};
use tauri::State;

#[tauri::command]
pub fn db_save_dataset(
    db: State<Db>,
    name: String,
    source: String,
    columns: String,
    rows: String,
    count: i64,
) -> Result<i64, String> {
    db.save_dataset(&name, &source, &columns, &rows, count)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn db_list_datasets(db: State<Db>) -> Result<Vec<DatasetMeta>, String> {
    db.list_datasets().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn db_load_dataset(db: State<Db>, id: i64) -> Result<Option<DatasetBlob>, String> {
    db.load_dataset(id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn db_delete_dataset(db: State<Db>, id: i64) -> Result<bool, String> {
    db.delete_dataset(id).map_err(|e| e.to_string())
}
