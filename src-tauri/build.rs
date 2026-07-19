fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&["openmind_request", "stream_openmind_ask"]),
    ))
    .expect("failed to build Tauri application");
}
