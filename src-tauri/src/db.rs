use serde::Serialize;
use std::collections::HashSet;
use std::path::PathBuf;

#[derive(Debug, Serialize)]
pub struct Track {
    pub id: i64,
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
    pub cover: Option<String>,
    pub fav: bool,
    pub play_count: i64,
    pub last_played: Option<i64>,
}

#[derive(Debug, Serialize)]
pub struct Album {
    pub album: String,
    pub album_artist: Option<String>,
    pub cover: Option<String>,
    pub count: i64,
    pub total_duration: f64,
}

#[derive(Debug, Serialize)]
pub struct Artist {
    pub artist: String,
    pub cover: Option<String>,
    pub count: i64,
    pub total_duration: f64,
}

#[derive(Debug, Serialize)]
pub struct Playlist {
    pub id: i64,
    pub name: String,
    pub created_at: i64,
}

#[derive(Debug, Serialize)]
pub struct IgnoredFile {
    pub id: i64,
    pub path: String,
    pub reason: String,
    pub size: Option<i64>,
    pub seen_at: i64,
}

pub struct Db {
    conn: rusqlite::Connection,
}

fn row_to_track(row: &rusqlite::Row) -> rusqlite::Result<Track> {
    Ok(Track {
        id: row.get(0)?,
        path: row.get(1)?,
        title: row.get(2)?,
        artist: row.get(3)?,
        album: row.get(4)?,
        album_artist: row.get(5)?,
        track_no: row.get(6)?,
        year: row.get(7)?,
        genre: row.get(8)?,
        duration: row.get(9)?,
        size: row.get(10)?,
        cover: row.get(11)?,
        fav: row.get::<_, i64>(12)? != 0,
        play_count: row.get(13)?,
        last_played: row.get(14)?,
    })
}

const TRACK_COLS: &str = "id, path, title, artist, album, album_artist, track_no, year, genre, duration, size, cover, fav, play_count, last_played";

impl Db {
    pub fn open(path: &PathBuf) -> Result<Self, rusqlite::Error> {
        let conn = rusqlite::Connection::open(path)?;
        conn.pragma_update(None, "journal_mode", "WAL").ok();
        conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS folders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                path TEXT UNIQUE NOT NULL
            );
            CREATE TABLE IF NOT EXISTS tracks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                path TEXT UNIQUE NOT NULL,
                title TEXT NOT NULL,
                artist TEXT, album TEXT, album_artist TEXT,
                track_no INTEGER, year INTEGER, genre TEXT,
                duration REAL NOT NULL, size INTEGER NOT NULL, mtime INTEGER NOT NULL,
                ext TEXT, cover TEXT,
                fav INTEGER NOT NULL DEFAULT 0,
                play_count INTEGER NOT NULL DEFAULT 0,
                last_played INTEGER,
                added_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS ignored (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                path TEXT UNIQUE NOT NULL,
                reason TEXT NOT NULL,
                size INTEGER,
                seen_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS playlists (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT UNIQUE NOT NULL,
                created_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS playlist_tracks (
                playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
                track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
                position INTEGER NOT NULL,
                PRIMARY KEY (playlist_id, track_id)
            );
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_tracks_artist ON tracks(artist);
            CREATE INDEX IF NOT EXISTS idx_tracks_album ON tracks(album);
            "#,
        )?;
        Ok(Db { conn })
    }

    // ---------- Paramètres ----------

    pub fn get_setting(&self, key: &str) -> Option<String> {
        self.conn
            .query_row("SELECT value FROM settings WHERE key = ?1", [key], |r| r.get(0))
            .ok()
    }

    pub fn set_setting(&self, key: &str, value: &str) {
        self.conn
            .execute(
                "INSERT INTO settings(key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = ?2",
                [key, value],
            )
            .ok();
    }

    // ---------- Dossiers surveillés ----------

    pub fn list_folders(&self) -> Vec<String> {
        let mut stmt = self.conn.prepare("SELECT path FROM folders ORDER BY path").unwrap();
        stmt.query_map([], |r| r.get::<_, String>(0))
            .unwrap()
            .filter_map(Result::ok)
            .collect()
    }

    pub fn add_folder(&self, path: &str) {
        self.conn
            .execute("INSERT OR IGNORE INTO folders(path) VALUES (?1)", [path.trim_end_matches(['\\', '/'])])
            .ok();
    }

    pub fn remove_folder(&self, path: &str) {
        self.conn.execute("DELETE FROM folders WHERE path = ?1", [path]).ok();
        // Les morceaux de ce dossier sortent de la bibliothèque.
        self.conn
            .execute(
                "DELETE FROM tracks WHERE path LIKE ?1 || '%'",
                [format!("{}%", path.trim_end_matches(['\\', '/']))],
            )
            .ok();
    }

    // ---------- Morceaux ----------

    pub fn track_meta_by_path(&self, path: &str) -> Option<(i64, i64, i64)> {
        self.conn
            .query_row(
                "SELECT id, size, mtime FROM tracks WHERE path = ?1",
                [path],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .ok()
    }

    pub fn upsert_track(&self, t: &crate::scanner::ParsedTrack, cover: Option<String>) {
        self.conn
            .execute(
                r#"INSERT INTO tracks (path, title, artist, album, album_artist, track_no, year, genre,
                                       duration, size, mtime, ext, cover, added_at)
                   VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
                   ON CONFLICT(path) DO UPDATE SET
                       title=?2, artist=?3, album=?4, album_artist=?5, track_no=?6, year=?7, genre=?8,
                       duration=?9, size=?10, mtime=?11, ext=?12, cover=?13"#,
                rusqlite::params![
                    t.path, t.title, t.artist, t.album, t.album_artist, t.track_no, t.year, t.genre,
                    t.duration, t.size, t.mtime, t.ext, cover, now_secs(),
                ],
            )
            .ok();
    }

    pub fn delete_track(&self, id: i64) {
        self.conn.execute("DELETE FROM tracks WHERE id = ?1", [id]).ok();
    }

    pub fn all_paths(&self) -> Vec<String> {
        let mut stmt = self.conn.prepare("SELECT path FROM tracks").unwrap();
        stmt.query_map([], |r| r.get::<_, String>(0))
            .unwrap()
            .filter_map(Result::ok)
            .collect()
    }

    pub fn remove_missing(&self, keep: &HashSet<String>, folders: &[String]) -> usize {
        let mut removed = 0;
        for path in self.all_paths() {
            if keep.contains(&path) {
                continue;
            }
            if folders.iter().any(|f| path.starts_with(f.as_str())) {
                self.conn.execute("DELETE FROM tracks WHERE path = ?1", [&path]).ok();
                removed += 1;
            }
        }
        removed
    }

    fn query_tracks(&self, sql: &str, p1: Option<&str>) -> Vec<Track> {
        let mut stmt = match self.conn.prepare(sql) {
            Ok(s) => s,
            Err(_) => return vec![],
        };
        let rows = match p1 {
            Some(v) => stmt.query_map([v], row_to_track).map(|m| m.filter_map(Result::ok).collect()),
            None => stmt.query_map([], row_to_track).map(|m| m.filter_map(Result::ok).collect()),
        };
        rows.unwrap_or_default()
    }

    pub fn get_tracks(&self, filter: &str, value: Option<String>, search: Option<String>) -> Vec<Track> {
        let like = search.as_deref().map(|s| format!("%{}%", s.replace('%', "")));
        let filter_sql = match filter {
            "fav" => "WHERE fav = 1 ORDER BY artist, album, track_no, title",
            "recent" => "WHERE last_played IS NOT NULL ORDER BY last_played DESC LIMIT 300",
            "artist" => "WHERE artist = ?1 ORDER BY album, track_no, title",
            "album" => "WHERE album = ?1 ORDER BY track_no, title",
            "search" => "WHERE title LIKE ?1 OR artist LIKE ?1 OR album LIKE ?1 OR genre LIKE ?1 ORDER BY artist, album, track_no, title LIMIT 400",
            "playlist" => {
                return self.query_tracks(
                    &format!(
                        "SELECT {TRACK_COLS} FROM tracks t
                         JOIN playlist_tracks pt ON pt.track_id = t.id AND pt.playlist_id = ?1
                         ORDER BY pt.position"
                    ),
                    value.as_deref(),
                )
            }
            _ => "ORDER BY artist, album, track_no, title",
        };
        let sql = format!("SELECT {TRACK_COLS} FROM tracks {filter_sql}");
        let p1: Option<String> = match filter {
            "search" => like,
            _ => value,
        };
        self.query_tracks(&sql, p1.as_deref())
    }

    pub fn get_albums(&self) -> Vec<Album> {
        let mut stmt = self.conn.prepare(
            "SELECT album, album_artist, MAX(cover), COUNT(*), SUM(duration)
             FROM tracks WHERE album IS NOT NULL AND album != ''
             GROUP BY album, album_artist ORDER BY album",
        ).unwrap();
        stmt.query_map([], |r| {
            Ok(Album {
                album: r.get(0)?,
                album_artist: r.get(1)?,
                cover: r.get(2)?,
                count: r.get(3)?,
                total_duration: r.get(4)?,
            })
        }).unwrap().filter_map(Result::ok).collect()
    }

    pub fn get_artists(&self) -> Vec<Artist> {
        let mut stmt = self.conn.prepare(
            "SELECT artist, MAX(cover), COUNT(*), SUM(duration)
             FROM tracks WHERE artist IS NOT NULL AND artist != ''
             GROUP BY artist ORDER BY artist",
        ).unwrap();
        stmt.query_map([], |r| {
            Ok(Artist {
                artist: r.get(0)?,
                cover: r.get(1)?,
                count: r.get(2)?,
                total_duration: r.get(3)?,
            })
        }).unwrap().filter_map(Result::ok).collect()
    }

    pub fn toggle_fav(&self, id: i64) -> bool {
        self.conn.execute("UPDATE tracks SET fav = 1 - fav WHERE id = ?1", [id]).ok();
        self.conn
            .query_row("SELECT fav FROM tracks WHERE id = ?1", [id], |r| r.get::<_, i64>(0))
            .map(|v| v != 0)
            .unwrap_or(false)
    }

    pub fn record_play(&self, id: i64) {
        self.conn
            .execute(
                "UPDATE tracks SET play_count = play_count + 1, last_played = ?2 WHERE id = ?1",
                rusqlite::params![id, now_secs()],
            )
            .ok();
    }

    // ---------- Playlists ----------

    pub fn list_playlists(&self) -> Vec<Playlist> {
        let mut stmt = self.conn.prepare("SELECT id, name, created_at FROM playlists ORDER BY name").unwrap();
        stmt.query_map([], |r| {
            Ok(Playlist { id: r.get(0)?, name: r.get(1)?, created_at: r.get(2)? })
        }).unwrap().filter_map(Result::ok).collect()
    }

    pub fn create_playlist(&self, name: &str) -> Result<Playlist, String> {
        let name = name.trim();
        if name.is_empty() {
            return Err("Nom vide".into());
        }
        self.conn
            .execute("INSERT INTO playlists(name, created_at) VALUES (?1, ?2)", rusqlite::params![name, now_secs()])
            .map_err(|e| e.to_string())?;
        let id = self.conn.last_insert_rowid();
        Ok(Playlist { id, name: name.into(), created_at: now_secs() })
    }

    pub fn rename_playlist(&self, id: i64, name: &str) {
        self.conn.execute("UPDATE playlists SET name = ?2 WHERE id = ?1", rusqlite::params![id, name]).ok();
    }

    pub fn delete_playlist(&self, id: i64) {
        self.conn.execute("DELETE FROM playlist_tracks WHERE playlist_id = ?1", [id]).ok();
        self.conn.execute("DELETE FROM playlists WHERE id = ?1", [id]).ok();
    }

    pub fn add_to_playlist(&self, pid: i64, tid: i64) {
        let pos: i64 = self.conn
            .query_row("SELECT COALESCE(MAX(position), 0) + 1 FROM playlist_tracks WHERE playlist_id = ?1", [pid], |r| r.get(0))
            .unwrap_or(1);
        self.conn
            .execute(
                "INSERT OR IGNORE INTO playlist_tracks(playlist_id, track_id, position) VALUES (?1, ?2, ?3)",
                rusqlite::params![pid, tid, pos],
            )
            .ok();
    }

    pub fn remove_from_playlist(&self, pid: i64, tid: i64) {
        self.conn
            .execute("DELETE FROM playlist_tracks WHERE playlist_id = ?1 AND track_id = ?2", rusqlite::params![pid, tid])
            .ok();
    }

    // ---------- Fichiers ignorés ----------

    pub fn add_ignored(&self, path: &str, reason: &str, size: i64) {
        self.conn
            .execute(
                "INSERT INTO ignored(path, reason, size, seen_at) VALUES (?1, ?2, ?3, ?4)
                 ON CONFLICT(path) DO UPDATE SET reason = ?2, size = ?3, seen_at = ?4",
                rusqlite::params![path, reason, size, now_secs()],
            )
            .ok();
    }

    pub fn list_ignored(&self) -> Vec<IgnoredFile> {
        let mut stmt = self.conn.prepare("SELECT id, path, reason, size, seen_at FROM ignored ORDER BY seen_at DESC").unwrap();
        stmt.query_map([], |r| {
            Ok(IgnoredFile { id: r.get(0)?, path: r.get(1)?, reason: r.get(2)?, size: r.get(3)?, seen_at: r.get(4)? })
        }).unwrap().filter_map(Result::ok).collect()
    }

    pub fn remove_ignored(&self, path: &str) {
        self.conn.execute("DELETE FROM ignored WHERE path = ?1", [path]).ok();
    }
}

pub fn now_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}
