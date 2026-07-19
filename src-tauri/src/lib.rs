mod openmind;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(openmind::ClientState::new())
        .invoke_handler(tauri::generate_handler![
            openmind::openmind_request,
            openmind::openmind_image_preview,
            openmind::stream_openmind_ask,
        ])
        .run(tauri::generate_context!())
        .expect("error while running the application");
}
