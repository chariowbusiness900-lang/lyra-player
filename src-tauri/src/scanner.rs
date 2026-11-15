use lofty::file::{AudioFile, TaggedFileExt};
use std::collections::HashSet;
use std::fs;
use std::hash::{Hash, Hasher};
use std::path::Path;
use walkdir::WalkDir;

pub const AUDIO_EXTS: [&str; 6] = ["mp3", "flac", "m4a", "ogg", "opus", "wav"];

#[derive(Debug)]
pub struct ParsedTrack {
    pub path: String,
    pub title: String,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub album_artist: Option<String>,
    pub track_no: Option<i64>,
    pub year: Option<i64>,
    pub genre: Option<String>,
    pub duration: f64,
    pub size: i64,
    pub mtime: i64,
    pub ext: String,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct ScanSummary {
    pub added: usize,
    pub updated: usize,
    pub removed: usize,
    pub ignored: usize,
}

fn mtime_secs(meta: &fs::Metadata) -> i64 {
    meta.modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

fn save_cover(bytes: &[u8], covers_dir: &Path, track_path: &str) -> Option<String> {
    if bytes.len() < 8 {
        return None;
    }
    let ext = if bytes.starts_with(&[0x89, 0x50, 0x4E, 0x47]) {
        "png"
    } else if bytes.starts_with(&[0xFF, 0xD8]) {
        "jpg"
    } else {
        "img"
    };
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    track_path.hash(&mut hasher);
    let name = format!("{:016x}.{}", hasher.finish(), ext);
    let dest = covers_dir.join(&name);
    if !dest.exists() {
        fs::write(&dest, bytes).ok()?;
    }
    Some(dest.to_string_lossy().to_string())
}

pub fn parse_track(path: &Path, size: i64) -> Result<(ParsedTrack, Option<Vec<u8>>), String> {
    let path_str = path.to_string_lossy().to_string();
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    let tagged = lofty::read_from_path(path).map_err(|e| e.to_string())?;
    let duration = tagged.properties().duration().as_secs_f64();
    let tag = tagged.primary_tag().or_else(|| tagged.first_tag());

    let title = tag
        .as_ref()
        .and_then(|t| t.title().map(|v| v.to_string()))
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| {
            path.file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("Sans titre")
                .to_string()
        });
    let artist = tag.as_ref().and_then(|t| t.artist().map(|v| v.to_string()));
    let album = tag.as_ref().and_then(|t| t.album().map(|v| v.to_string()));
    let album_artist = tag.as_ref().and_then(|t| t.album_artist().map(|v| v.to_string()));
    let track_no = tag.as_ref().and_then(|t| t.track()).map(|v| v as i64);
    let year = tag.as_ref().and_then(|t| t.year()).map(|v| v as i64);
    let genre = tag.as_ref().and_then(|t| t.genre().map(|v| v.to_string()));
    let cover = tag
        .as_ref()
        .and_then(|t| t.pictures().first().map(|p| p.data().to_vec()));

    Ok((
        ParsedTrack {
            path: path_str,
            title,
            artist,
            album,
            album_artist,
            track_no,
            year,
            genre,
            duration,
            size,
            mtime: mtime_secs(&fs::metadata(path).map_err(|e| e.to_string())?),
            ext,
        },
        cover,
    ))
}

/// Scan incrémental : parcourt les dossiers surveillés, ne lit les tags
/// que des fichiers nouveaux ou modifiés, retire les disparus, ignore
/// selon les seuils configurés (durée / taille minimales).
pub fn scan(state: &crate::AppState) -> ScanSummary {
    let db = state.db.lock().unwrap();
    let covers_dir = state.covers.clone();
    fs::create_dir_all(&covers_dir).ok();

    let folders = db.list_folders();
    let min_dur: f64 = db
        .get_setting("min_duration_sec")
        .and_then(|v| v.parse().ok())
        .unwrap_or(60.0);
    let min_size: i64 = db
        .get_setting("min_size_bytes")
        .and_then(|v| v.parse().ok())
        .unwrap_or(102_400);

    let mut keep: HashSet<String> = HashSet::new();
    let mut added = 0usize;
    let mut updated = 0usize;
    let mut ignored = 0usize;

    for folder in &folders {
        for entry in WalkDir::new(folder).follow_links(false).into_iter().filter_map(Result::ok) {
            if !entry.file_type().is_file() {
                continue;
            }
            let path = entry.path();
            let ext = path
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("")
                .to_lowercase();
            if !AUDIO_EXTS.contains(&ext.as_str()) {
                continue;
            }
            let path_str = path.to_string_lossy().to_string();
            keep.insert(path_str.clone());

            let meta = match entry.metadata() {
                Ok(m) => m,
                Err(_) => continue,
            };
            let size = meta.len() as i64;

            if let Some((id, old_size, old_mtime)) = db.track_meta_by_path(&path_str) {
                if old_size == size && old_mtime == mtime_secs(&meta) {
                    continue; // inchangé
                }
                db.delete_track(id); // modifié : on reparsèra
            }

            if size < min_size {
                db.add_ignored(
                    &path_str,
                    &format!("Taille minimale non atteinte (< {} o)", min_size),
                    size,
                );
                ignored += 1;
                continue;
            }

            match parse_track(path, size) {
                Ok((t, _)) if t.duration < min_dur => {
                    db.add_ignored(
                        &path_str,
                        &format!("Durée minimale non atteinte (< {} s)", min_dur as i64),
                        size,
                    );
                    ignored += 1;
                }
                Ok((t, cover_bytes)) => {
                    let cover = cover_bytes.and_then(|b| save_cover(&b, &covers_dir, &path_str));
                    let is_new = db.track_meta_by_path(&path_str).is_none();
                    db.upsert_track(&t, cover);
                    db.remove_ignored(&path_str);
                    if is_new {
                        added += 1;
                    } else {
                        updated += 1;
                    }
                }
                Err(err) => {
                    db.add_ignored(&path_str, &format!("Illisible ({})", err), size);
                    ignored += 1;
                }
            }
        }
    }

    let removed = db.remove_missing(&keep, &folders);
    ScanSummary { added, updated, removed, ignored }
}
