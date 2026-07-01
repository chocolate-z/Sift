mod credential_cmd;
mod download_cmd;
mod engine_cmd;
mod storage_cmd;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      // 本地库:应用数据目录下 sift.db。
      let dir = app.path().app_data_dir()?;
      std::fs::create_dir_all(&dir)?;
      let db = sift_storage::Db::open(dir.join("sift.db"))?;
      app.manage(db);
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      engine_cmd::engine_run_rule,
      engine_cmd::engine_version,
      storage_cmd::db_save_dataset,
      storage_cmd::db_list_datasets,
      storage_cmd::db_load_dataset,
      storage_cmd::db_delete_dataset,
      storage_cmd::db_save_completed,
      storage_cmd::db_list_completed,
      storage_cmd::db_delete_completed,
      storage_cmd::db_save_rule,
      storage_cmd::db_list_rules,
      storage_cmd::db_load_rule,
      storage_cmd::db_delete_rule,
      download_cmd::save_text_file,
      download_cmd::download_files_live,
      credential_cmd::cred_save,
      credential_cmd::cred_update,
      credential_cmd::cred_list,
      credential_cmd::cred_get,
      credential_cmd::cred_delete
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
