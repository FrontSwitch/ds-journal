use rusqlite::{params_from_iter, types::Value, Connection};
use serde_json::{Map, Value as JsonValue};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Manager, Runtime, State};

// ── DB state ──────────────────────────────────────────────────────────────────

#[derive(Default)]
pub(crate) struct DbInner {
    pub(crate) conn: Option<Connection>,
    pub(crate) master_key: Option<[u8; 32]>, // set when opened via vault (raw: key format)
}

// Connection is !Send by rusqlite's conservative marker, but is safe behind a
// Mutex because SQLite uses serialized threading mode (SQLITE_THREADSAFE=1).
// Arc allows the axum sync server to share the same connection.
pub(crate) struct DbState(pub(crate) Arc<Mutex<DbInner>>);
unsafe impl Send for DbState {}
unsafe impl Sync for DbState {}

#[derive(serde::Serialize)]
pub(crate) struct ExecResult {
    rows_affected: usize,
    last_insert_id: i64,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

pub(crate) fn to_sql(v: &JsonValue) -> Value {
    match v {
        JsonValue::Null => Value::Null,
        JsonValue::Bool(b) => Value::Integer(if *b { 1 } else { 0 }),
        JsonValue::Number(n) => {
            if let Some(i) = n.as_i64() {
                Value::Integer(i)
            } else {
                Value::Real(n.as_f64().unwrap_or(0.0))
            }
        }
        JsonValue::String(s) => Value::Text(s.clone()),
        _ => Value::Text(v.to_string()),
    }
}

pub(crate) fn from_sql(v: Value) -> JsonValue {
    match v {
        Value::Null => JsonValue::Null,
        Value::Integer(i) => JsonValue::Number(i.into()),
        Value::Real(f) => serde_json::json!(f),
        Value::Text(s) => JsonValue::String(s),
        Value::Blob(_) => JsonValue::Null,
    }
}

pub(crate) fn resolve_db_path<R: Runtime>(app: &AppHandle<R>, name: &str) -> String {
    if let Ok(custom) = std::env::var("DSJ_DB") {
        return custom;
    }
    let mut path = app.path().app_config_dir().expect("no app config dir");
    std::fs::create_dir_all(&path).ok();
    path.push(format!("{name}.db"));
    path.to_string_lossy().into_owned()
}

pub(crate) fn sidecar_path(db_path: &str) -> String {
    let p = std::path::Path::new(db_path);
    let stem = p.file_stem().unwrap_or_default().to_string_lossy();
    let dir = p
        .parent()
        .map(|d| d.to_string_lossy().into_owned())
        .unwrap_or_default();
    format!("{dir}/{stem}.keys")
}

/// Open a connection using an optional key.
/// If the key starts with "raw:", the remainder is treated as a 64-char hex
/// master key and passed to SQLCipher in x'HEX' raw format (bypasses KDF).
/// Otherwise the key is used as a legacy string passphrase.
pub(crate) fn open_with_key(path: &str, key: &Option<String>) -> Result<Connection, String> {
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    if let Some(k) = key {
        if !k.is_empty() {
            if let Some(raw_hex) = k.strip_prefix("raw:") {
                conn.pragma_update(None, "key", format!("x'{raw_hex}'"))
                    .map_err(|e| e.to_string())?;
            } else {
                conn.pragma_update(None, "key", k).map_err(|e| e.to_string())?;
            }
        }
    }
    // Verify the key works
    conn.query_row("PRAGMA user_version", [], |_| Ok(()))
        .map_err(|_| "Wrong passphrase or corrupted database".to_string())?;
    Ok(conn)
}

/// Open with a raw 32-byte master key (internal use).
pub(crate) fn open_with_raw_key(path: &str, master_key: &[u8; 32]) -> Result<Connection, String> {
    let hex = hex::encode(master_key);
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    conn.pragma_update(None, "key", format!("x'{hex}'"))
        .map_err(|e| e.to_string())?;
    conn.query_row("PRAGMA user_version", [], |_| Ok(()))
        .map_err(|_| "Wrong key or corrupted database".to_string())?;
    Ok(conn)
}

// ── DB commands ───────────────────────────────────────────────────────────────

/// Returns true if the DB file exists on disk.
#[tauri::command]
pub(crate) fn db_exists(app: AppHandle, name: String) -> bool {
    let path = resolve_db_path(&app, &name);
    std::path::Path::new(&path).exists()
}

/// Close the connection and delete the DB file + WAL/SHM + sidecar.
#[tauri::command]
pub(crate) fn db_reset(app: AppHandle, state: State<'_, DbState>, name: String) -> Result<(), String> {
    *state.0.lock().unwrap() = DbInner::default();
    let path = resolve_db_path(&app, &name);
    for suffix in &["", "-wal", "-shm"] {
        let _ = std::fs::remove_file(format!("{path}{suffix}"));
    }
    let _ = std::fs::remove_file(sidecar_path(&path));
    Ok(())
}

/// Verify a key opens the DB without storing the connection.
#[tauri::command]
pub(crate) fn db_verify(app: AppHandle, name: String, key: Option<String>) -> Result<(), String> {
    let path = resolve_db_path(&app, &name);
    open_with_key(&path, &key).map(|_| ())
}

/// Open the DB for the session. Stores master_key if key has "raw:" prefix.
#[tauri::command]
pub(crate) fn db_load(
    app: AppHandle,
    state: State<'_, DbState>,
    name: String,
    key: Option<String>,
) -> Result<(), String> {
    let path = resolve_db_path(&app, &name);
    let conn = open_with_key(&path, &key)?;

    // Extract master key from raw: prefix if present
    let master_key = key
        .as_deref()
        .and_then(|k| k.strip_prefix("raw:"))
        .and_then(|hex_str| {
            let bytes = hex::decode(hex_str).ok()?;
            if bytes.len() == 32 {
                let mut mk = [0u8; 32];
                mk.copy_from_slice(&bytes);
                Some(mk)
            } else {
                None
            }
        });

    let mut guard = state.0.lock().unwrap();
    guard.conn = Some(conn);
    guard.master_key = master_key;
    Ok(())
}

#[tauri::command]
pub(crate) fn db_execute(
    state: State<'_, DbState>,
    sql: String,
    params: Vec<JsonValue>,
) -> Result<ExecResult, String> {
    let guard = state.0.lock().unwrap();
    let conn = guard.conn.as_ref().ok_or("Database not loaded")?;
    let sql_params: Vec<Value> = params.iter().map(to_sql).collect();
    let rows_affected = conn
        .execute(&sql, params_from_iter(sql_params.iter()))
        .map_err(|e| e.to_string())?;
    let last_insert_id = conn.last_insert_rowid();
    Ok(ExecResult { rows_affected, last_insert_id })
}

#[tauri::command]
pub(crate) fn db_select(
    state: State<'_, DbState>,
    sql: String,
    params: Vec<JsonValue>,
) -> Result<Vec<Map<String, JsonValue>>, String> {
    let guard = state.0.lock().unwrap();
    let conn = guard.conn.as_ref().ok_or("Database not loaded")?;
    let sql_params: Vec<Value> = params.iter().map(to_sql).collect();
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let col_names: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();
    let rows = stmt
        .query_map(params_from_iter(sql_params.iter()), |row| {
            let mut map = Map::new();
            for (i, col) in col_names.iter().enumerate() {
                let val: Value = row.get(i)?;
                map.insert(col.clone(), from_sql(val));
            }
            Ok(map)
        })
        .map_err(|e| e.to_string())?;
    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

#[tauri::command]
pub(crate) fn get_db_path() -> Option<String> {
    std::env::var("DSJ_DB").ok()
}

#[cfg(target_os = "macos")]
pub(crate) fn exclude_from_time_machine(path: &std::path::Path) {
    let _ = std::process::Command::new("tmutil")
        .arg("addexclusion")
        .arg(path)
        .output();
}
