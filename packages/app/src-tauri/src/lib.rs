mod engine_cmd;

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
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      engine_cmd::engine_run_rule,
      engine_cmd::engine_version
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
