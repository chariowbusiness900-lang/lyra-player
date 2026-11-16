use crate::db::{Album, Artist, IgnoredFile, Playlist, Track};
use crate::AppState;
use std::hash::{Hash, Hasher};
use std::sync::Arc;
use tauri::{Manager, State, Theme, WebviewWindow};

type S<'a> = State<'a, Arc<AppState>>;

fn summary_to_json(s: &crate::scanner::ScanSummary) -> serde_json::Value {
    serde_json::json!({
        "added": s.added, "updated": s.updated, "removed": s.removed, "ignored": s.ignored
    })
}

#[tauri::command]
pub fn scan_library(state: S) -> serde_json::Value {
    summary_to_json(&crate::scanner::scan(&state))
}

#[tauri::command]
pub fn list_folders(state: S) -> Vec<String> {
    state.db.lock().unwrap().list_folders()
}

#[tauri::command]
pub fn add_folder(state: S, path: String) -> Vec<String> {
    let db = state.db.lock().unwrap();
    db.add_folder(&path);
    db.list_folders()
}

#[tauri::command]
pub fn remove_folder(state: S, path: String) -> Vec<String> {
    let db = state.db.lock().unwrap();
    db.remove_folder(&path);
    db.list_folders()
}

#[tauri::command]
pub fn get_tracks(state: S, filter: Option<String>, value: Option<String>, search: Option<String>) -> Vec<Track> {
    state
        .db
        .lock()
        .unwrap()
        .get_tracks(filter.as_deref().unwrap_or("all"), value, search)
}

#[tauri::command]
pub fn get_albums(state: S) -> Vec<Album> {
    state.db.lock().unwrap().get_albums()
}

#[tauri::command]
pub fn get_artists(state: S) -> Vec<Artist> {
    state.db.lock().unwrap().get_artists()
}

#[tauri::command]
pub fn toggle_fav(state: S, id: i64) -> bool {
    state.db.lock().unwrap().toggle_fav(id)
}

#[tauri::command]
pub fn record_play(state: S, id: i64) {
    state.db.lock().unwrap().record_play(id);
}

#[tauri::command]
pub fn list_playlists(state: S) -> Vec<Playlist> {
    state.db.lock().unwrap().list_playlists()
}

#[tauri::command]
pub fn create_playlist(state: S, name: String) -> Result<Playlist, String> {
    state.db.lock().unwrap().create_playlist(&name)
}

#[tauri::command]
pub fn rename_playlist(state: S, id: i64, name: String) {
    state.db.lock().unwrap().rename_playlist(id, &name);
}

#[tauri::command]
pub fn delete_playlist(state: S, id: i64) {
    state.db.lock().unwrap().delete_playlist(id);
}

#[tauri::command]
pub fn add_to_playlist(state: S, playlist_id: i64, track_id: i64) {
    state.db.lock().unwrap().add_to_playlist(playlist_id, track_id);
}

#[tauri::command]
pub fn remove_from_playlist(state: S, playlist_id: i64, track_id: i64) {
    state.db.lock().unwrap().remove_from_playlist(playlist_id, track_id);
}

#[tauri::command]
pub fn get_playlist_tracks(state: S, playlist_id: i64) -> Vec<Track> {
    state
        .db
        .lock()
        .unwrap()
        .get_tracks("playlist", Some(playlist_id.to_string()), None)
}

#[tauri::command]
pub fn get_ignored(state: S) -> Vec<IgnoredFile> {
    state.db.lock().unwrap().list_ignored()
}

/// Ajout forcé d'un fichier ignoré : il repasse le parse sans les seuils.
#[tauri::command]
pub fn force_add(state: S, path: String) -> Result<bool, String> {
    let p = std::path::Path::new(&path);
    if !p.is_file() {
        return Err("Fichier introuvable".into());
    }
    let size = std::fs::metadata(p).map_err(|e| e.to_string())?.len() as i64;
    let (t, cover_bytes) = crate::scanner::parse_track(p, size)?;
    let db = state.db.lock().unwrap();
    let cover = cover_bytes.and_then(|b| {
        let mut hasher = std::collections::hash_map::DefaultHasher::new();
        t.path.hash(&mut hasher);
        let name = format!("{:016x}.png", hasher.finish());
        let dest = state.covers.join(name);
        std::fs::write(&dest, b).ok().map(|_| dest.to_string_lossy().to_string())
    });
    db.upsert_track(&t, cover);
    db.remove_ignored(&path);
    Ok(true)
}

/// Ajout immédiat de fichiers audio (glisser-déposer, ou commande exposée au WebView).
/// Les dossiers déposés sont parcourus récursivement ; les fichiers ignorés par le
/// scan (trop courts / trop petits) sont acceptés ici, c'est un ajout explicite.
pub fn add_paths_impl(state: &AppState, paths: Vec<String>) -> usize {
    let mut files: Vec<std::path::PathBuf> = Vec::new();
    for path in paths {
        let root = std::path::PathBuf::from(&path);
        if root.is_dir() {
            let mut stack = vec![root];
            let mut seen = 0usize;
            while let Some(dir) = stack.pop() {
                seen += 1;
                if seen > 4000 {
                    break; // garde-fou contre une arborescence démesurée
                }
                if let Ok(entries) = std::fs::read_dir(&dir) {
                    for entry in entries.flatten() {
                        let p = entry.path();
                        if p.is_dir() {
                            stack.push(p);
                        } else {
                            files.push(p);
                        }
                    }
                }
            }
        } else if root.is_file() {
            files.push(root);
        }
    }

    let mut added = 0usize;
    for p in &files {
        let ext_ok = p
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| crate::scanner::AUDIO_EXTS.contains(&e.to_lowercase().as_str()))
            .unwrap_or(false);
        if !ext_ok {
            continue;
        }
        let path = p.to_string_lossy().to_string();
        if let Ok(size) = std::fs::metadata(p).map(|m| m.len() as i64) {
            if let Ok((t, cover_bytes)) = crate::scanner::parse_track(p, size) {
                let cover = cover_bytes.and_then(|b| {
                    let mut hasher = std::collections::hash_map::DefaultHasher::new();
                    t.path.hash(&mut hasher);
                    let name = format!("{:016x}.img", hasher.finish());
                    let dest = state.covers.join(name);
                    std::fs::write(&dest, b).ok().map(|_| dest.to_string_lossy().to_string())
                });
                let db = state.db.lock().unwrap();
                db.upsert_track(&t, cover);
                db.remove_ignored(&path);
                added += 1;
            }
        }
    }
    added
}

#[tauri::command]
pub fn add_paths(state: S, paths: Vec<String>) -> serde_json::Value {
    let added = add_paths_impl(&state, paths);
    serde_json::json!({ "added": added })
}

/// Dossier « Musique » de l'utilisateur, résolu par le système (API Tauri v2 : audio_dir).
#[tauri::command]
pub fn music_dir(app: tauri::AppHandle) -> Option<String> {
    let dir = app.path().audio_dir().ok()?;
    // Certains profils Windows n'ont pas encore de dossier Musique.
    std::fs::create_dir_all(&dir).ok();
    Some(dir.to_string_lossy().to_string())
}

#[tauri::command]
pub fn get_setting(state: S, key: String) -> Option<String> {
    state.db.lock().unwrap().get_setting(&key)
}

#[tauri::command]
pub fn set_setting(state: S, key: String, value: String) {
    state.db.lock().unwrap().set_setting(&key, &value);
}

/// Applique le thème natif de la fenêtre (barre de titre incluse).
#[tauri::command]
pub fn set_theme(window: WebviewWindow, theme: Option<String>) -> Result<(), String> {
    let t = match theme.as_deref() {
        Some("dark") => Some(Theme::Dark),
        Some("light") => Some(Theme::Light),
        _ => None, // suit le système
    };
    window.set_theme(t).map_err(|e| e.to_string())?;
    Ok(())
}

/// Renvoie le répertoire de données de l'app — diagnostic.
#[tauri::command]
pub fn app_data_dir(app: tauri::AppHandle) -> String {
    app.path()
        .app_data_dir()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default()
}

/// Sélection native d'un dossier de musique (côté Rust : aucune dépendance npm requise).
#[tauri::command]
pub async fn pick_folder(app: tauri::AppHandle) -> Option<String> {
    use tauri_plugin_dialog::DialogExt;
    app.dialog()
        .file()
        .set_title("Choisir un dossier de musique")
        .blocking_pick_folder()
        .and_then(|p| p.into_path().ok())
        .map(|p| p.to_string_lossy().to_string())
}
