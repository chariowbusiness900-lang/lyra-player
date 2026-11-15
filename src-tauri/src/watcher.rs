use notify::{RecursiveMode, Watcher};
use std::path::Path;
use std::sync::mpsc::RecvTimeoutError;
use std::time::Duration;

/// Surveillance en arrière-plan des dossiers suivis :
/// un fichier audio déposé pendant que l'app est ouverte est indexé
/// immédiatement (avec un anti-rebond de 600 ms).
pub fn spawn(state: std::sync::Arc<crate::AppState>) {
    std::thread::spawn(move || {
        let db = state.db.clone();
        let st = state.clone();

        let (tx, rx) =
            std::sync::mpsc::channel::<notify::Result<notify::Event>>();

        let mut _keep_watcher: Option<notify::RecommendedWatcher> = None;
        let mut known_folders: Vec<String> = Vec::new();
        let mut dirty = false;

        loop {
            match rx.recv_timeout(Duration::from_millis(600)) {
                Ok(event) => {
                    if let Ok(ev) = event {
                        let relevant = ev.paths.iter().any(|p| {
                            p.is_file()
                                && p.extension()
                                    .and_then(|e| e.to_str())
                                    .map(|e| crate::scanner::AUDIO_EXTS.contains(&e.to_lowercase().as_str()))
                                    .unwrap_or(false)
                        });
                        if relevant {
                            dirty = true;
                        }
                    }
                }
                Err(RecvTimeoutError::Timeout) => {
                    // Dossiers ajoutés/retirés depuis l'UI → ré-arme les watches.
                    let current = db.lock().unwrap().list_folders();
                    if current != known_folders {
                        let mut w = match notify::recommended_watcher(tx.clone()) {
                            Ok(w) => w,
                            Err(_) => return,
                        };
                        for f in &current {
                            let _ = w.watch(Path::new(f), RecursiveMode::Recursive);
                        }
                        _keep_watcher = Some(w);
                        known_folders = current;
                        dirty = true;
                    }
                    if dirty {
                        dirty = false;
                        let _ = crate::scanner::scan(&st);
                    }
                }
                Err(RecvTimeoutError::Disconnected) => return,
            }
        }
    });
}
