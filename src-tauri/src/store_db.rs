//! Durable key/value storage for the app's persisted state.
//!
//! The UI used to persist meetings, projects and tasks straight into
//! `localStorage`, which is capped around 5 MB. Transcripts are the bulk of a
//! meeting, so a heavy user hits the cap after a few dozen calls — and when
//! they do, the write throws `QuotaExceededError`, zustand swallows it, and
//! meetings silently stop being saved. Losing recordings without an error is
//! about the worst failure this app can have.
//!
//! SQLite has no such cap, and it writes atomically, so a crash mid-save can't
//! leave a half-written blob behind. State lives in one `kv` row per store
//! today; the table is deliberately generic so meetings can be promoted to real
//! rows (with FTS/vector indexes) later without another storage migration.

use rusqlite::{params, Connection};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};

pub struct Db(pub Mutex<Option<Connection>>);

impl Default for Db {
    fn default() -> Self {
        Db(Mutex::new(None))
    }
}

/// Open (and create) the database next to the recordings.
pub fn init(app: &AppHandle) -> Result<(), String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let conn = Connection::open(dir.join("meetly.db")).map_err(|e| e.to_string())?;

    // WAL keeps readers from blocking the writer and survives crashes cleanly.
    let _ = conn.pragma_update(None, "journal_mode", "WAL");
    let _ = conn.pragma_update(None, "synchronous", "NORMAL");
    conn.execute(
        "CREATE TABLE IF NOT EXISTS kv (
            key        TEXT PRIMARY KEY,
            value      TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    *app.state::<Db>().0.lock().map_err(|e| e.to_string())? = Some(conn);
    Ok(())
}

fn with_conn<T>(db: &State<'_, Db>, f: impl FnOnce(&Connection) -> rusqlite::Result<T>) -> Result<T, String> {
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("database not initialised")?;
    f(conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn store_get(db: State<'_, Db>, key: String) -> Result<Option<String>, String> {
    with_conn(&db, |conn| {
        conn.query_row("SELECT value FROM kv WHERE key = ?1", params![key], |r| {
            r.get::<_, String>(0)
        })
        .map(Some)
        .or_else(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => Ok(None),
            other => Err(other),
        })
    })
}

#[tauri::command]
pub fn store_set(db: State<'_, Db>, key: String, value: String) -> Result<(), String> {
    with_conn(&db, |conn| {
        conn.execute(
            "INSERT INTO kv (key, value, updated_at) VALUES (?1, ?2, datetime('now'))
             ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
            params![key, value],
        )
        .map(|_| ())
    })
}

#[tauri::command]
pub fn store_remove(db: State<'_, Db>, key: String) -> Result<(), String> {
    with_conn(&db, |conn| {
        conn.execute("DELETE FROM kv WHERE key = ?1", params![key]).map(|_| ())
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Same schema/statements the commands use, against an in-memory database.
    fn conn() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        c.execute(
            "CREATE TABLE kv (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)",
            [],
        )
        .unwrap();
        c
    }

    fn set(c: &Connection, key: &str, value: &str) {
        c.execute(
            "INSERT INTO kv (key, value, updated_at) VALUES (?1, ?2, datetime('now'))
             ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
            params![key, value],
        )
        .unwrap();
    }

    fn get(c: &Connection, key: &str) -> Option<String> {
        c.query_row("SELECT value FROM kv WHERE key = ?1", params![key], |r| {
            r.get::<_, String>(0)
        })
        .map(Some)
        .or_else(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => Ok(None),
            other => Err(other),
        })
        .unwrap()
    }

    #[test]
    fn missing_key_is_none_not_an_error() {
        assert_eq!(get(&conn(), "meetly-meetings"), None);
    }

    #[test]
    fn upsert_overwrites_rather_than_conflicting() {
        let c = conn();
        set(&c, "meetly-meetings", r#"{"meetings":[]}"#);
        set(&c, "meetly-meetings", r#"{"meetings":[1]}"#);
        assert_eq!(get(&c, "meetly-meetings").as_deref(), Some(r#"{"meetings":[1]}"#));
        let rows: i64 = c
            .query_row("SELECT count(*) FROM kv", [], |r| r.get(0))
            .unwrap();
        assert_eq!(rows, 1, "upsert must not accumulate duplicate rows");
    }

    /// The whole point of the migration: no 5 MB ceiling.
    #[test]
    fn stores_a_payload_far_larger_than_the_localstorage_quota() {
        let c = conn();
        let big = "x".repeat(12 * 1024 * 1024); // 12 MB — localStorage dies ~5 MB
        set(&c, "meetly-meetings", &big);
        assert_eq!(get(&c, "meetly-meetings").map(|v| v.len()), Some(big.len()));
    }

    #[test]
    fn remove_clears_the_key() {
        let c = conn();
        set(&c, "k", "v");
        c.execute("DELETE FROM kv WHERE key = ?1", params!["k"]).unwrap();
        assert_eq!(get(&c, "k"), None);
    }
}
