//! 本地持久化的 Tauri 命令。数据集的 columns/rows 由前端序列化为 JSON 字符串透明存取。
//! Db 在 setup 时按应用数据目录打开并 manage 进 State。

use serde::Deserialize;
use sift_storage::{CompletedRow, DatasetBlob, DatasetMeta, Db, RuleMeta};
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

/// 已完成记录入参(单结构,避开多词命令参数坑;字段 camelCase 对齐前端)。
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompletedInput {
    pub name: String,
    pub file_type: String,
    pub icon: String,
    pub path: String,
    pub size: String,
    pub count: String,
    pub source: String,
}

#[tauri::command]
pub fn db_save_completed(db: State<Db>, rec: CompletedInput) -> Result<i64, String> {
    db.save_completed(
        &rec.name,
        &rec.file_type,
        &rec.icon,
        &rec.path,
        &rec.size,
        &rec.count,
        &rec.source,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn db_list_completed(db: State<Db>) -> Result<Vec<CompletedRow>, String> {
    db.list_completed().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn db_delete_completed(db: State<Db>, id: i64) -> Result<bool, String> {
    db.delete_completed(id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn db_save_rule(db: State<Db>, name: String, json: String) -> Result<i64, String> {
    db.save_rule(&name, &json).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn db_list_rules(db: State<Db>) -> Result<Vec<RuleMeta>, String> {
    db.list_rules().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn db_load_rule(db: State<Db>, id: i64) -> Result<Option<String>, String> {
    db.load_rule(id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn db_delete_rule(db: State<Db>, id: i64) -> Result<bool, String> {
    db.delete_rule(id).map_err(|e| e.to_string())
}
