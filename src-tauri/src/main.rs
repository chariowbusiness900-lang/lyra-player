#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod db;
mod scanner;
mod watcher;

use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::Manager;

pub struct AppState {
    pub db: Arc<Mutex<db::Db>>,
    pub covers: PathBuf,
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let dir = app.path().app_data_dir().expect("répertoire de données");
            std::fs::create_dir_all(dir.join("covers")).ok();
            let db = db::Db::open(&dir.join("lyra.db")).expect("ouverture base de données");
            let state = Arc::new(AppState {
                db: Arc::new(Mutex::new(db)),
                covers: dir.join("covers"),
            });

            // Scan incrémental en arrière-plan au démarrage + surveillance live.
            {
                let st = state.clone();
                std::thread::spawn(move || {
                    let _ = scanner::scan(&st);
                });
            }
            watcher::spawn(state.clone());

            app.manage(state);

            // Adapte la fenêtre au bureau réel : sur un portable 1366x768 ou un
            // écran mis à l'échelle (1280x720 logiques), une fenêtre de 740 px
            // de haut sortirait de l'écran et masquerait la barre de lecture.
            if let Some(win) = app.get_webview_window("main") {
                if let Ok(Some(mon)) = win.current_monitor() {
                    let scale = mon.scale_factor();
                    let screen = mon.size().to_logical::<f64>(scale);
                    let w = (screen.width * 0.94).clamp(880.0, 1320.0);
                    let h = (screen.height * 0.88).clamp(520.0, 860.0);
                    let _ = win.set_size(tauri::LogicalSize::new(w, h));
                    let _ = win.center();
                }
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::scan_library,
            commands::list_folders,
            commands::add_folder,
            commands::remove_folder,
            commands::get_tracks,
            commands::get_albums,
            commands::get_artists,
            commands::toggle_fav,
            commands::record_play,
            commands::list_playlists,
            commands::create_playlist,
            commands::rename_playlist,
            commands::delete_playlist,
            commands::add_to_playlist,
            commands::remove_from_playlist,
            commands::get_playlist_tracks,
            commands::get_ignored,
            commands::force_add,
            commands::add_paths,
            commands::get_setting,
            commands::set_setting,
            commands::set_theme,
            commands::app_data_dir,
            commands::pick_folder,
        ])
        .run(tauri::generate_context!())
        .expect("erreur pendant l'exécution de Lyra");
}
