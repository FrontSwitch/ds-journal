use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Key, Nonce,
};
use argon2::{Algorithm, Argon2, Params, Version};
use keyring::Entry;
use rand::RngCore;
use tauri::{AppHandle, State};

use crate::db::{DbState, resolve_db_path, sidecar_path, open_with_key, open_with_raw_key};

// ── Vault types ───────────────────────────────────────────────────────────────

#[derive(serde::Serialize, serde::Deserialize)]
pub(crate) struct VaultEntry {
    pub(crate) salt: String,       // hex-encoded 32 bytes
    pub(crate) nonce: String,      // hex-encoded 12 bytes
    pub(crate) ciphertext: String, // hex-encoded 48 bytes (32 plaintext + 16 GCM tag)
}

#[derive(serde::Serialize, serde::Deserialize)]
struct KeyFile {
    version: u32,
    vault_a: VaultEntry, // locked with passphrase
    vault_b: VaultEntry, // locked with recovery code
}

#[derive(serde::Serialize)]
pub(crate) struct SetupResult {
    key: String,           // "raw:HEXHEX" — store in keychain if remember
    recovery_code: String, // formatted XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX
}

// ── Vault crypto ──────────────────────────────────────────────────────────────

// Argon2id: 64 MB memory, 3 iterations, 1 lane — strong on desktop hardware.
const ARGON2_M_COST: u32 = 65536;
const ARGON2_T_COST: u32 = 3;
const ARGON2_P_COST: u32 = 1;

pub(crate) fn derive_vault_key(secret: &str, salt: &[u8]) -> Result<[u8; 32], String> {
    let params = Params::new(ARGON2_M_COST, ARGON2_T_COST, ARGON2_P_COST, Some(32))
        .map_err(|e| e.to_string())?;
    let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
    let mut key = [0u8; 32];
    argon2
        .hash_password_into(secret.as_bytes(), salt, &mut key)
        .map_err(|e| e.to_string())?;
    Ok(key)
}

pub(crate) fn encrypt_master_key(master_key: &[u8; 32], secret: &str) -> Result<VaultEntry, String> {
    let mut salt = [0u8; 32];
    let mut nonce_bytes = [0u8; 12];
    rand::thread_rng().fill_bytes(&mut salt);
    rand::thread_rng().fill_bytes(&mut nonce_bytes);

    let vault_key = derive_vault_key(secret, &salt)?;
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&vault_key));
    let nonce = Nonce::from_slice(&nonce_bytes);
    let ciphertext = cipher
        .encrypt(nonce, master_key.as_ref())
        .map_err(|_| "Encryption failed".to_string())?;

    Ok(VaultEntry {
        salt: hex::encode(salt),
        nonce: hex::encode(nonce_bytes),
        ciphertext: hex::encode(ciphertext),
    })
}

pub(crate) fn decrypt_master_key(vault: &VaultEntry, secret: &str) -> Result<[u8; 32], String> {
    let salt = hex::decode(&vault.salt).map_err(|e| e.to_string())?;
    let nonce_bytes = hex::decode(&vault.nonce).map_err(|e| e.to_string())?;
    let ciphertext = hex::decode(&vault.ciphertext).map_err(|e| e.to_string())?;

    let vault_key = derive_vault_key(secret, &salt)?;
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&vault_key));
    let nonce = Nonce::from_slice(&nonce_bytes);
    let plaintext = cipher
        .decrypt(nonce, ciphertext.as_ref())
        .map_err(|_| "Wrong passphrase or recovery code".to_string())?;

    if plaintext.len() != 32 {
        return Err("Corrupted vault data".to_string());
    }
    let mut mk = [0u8; 32];
    mk.copy_from_slice(&plaintext);
    Ok(mk)
}

fn read_key_file(sc_path: &str) -> Result<KeyFile, String> {
    let json = std::fs::read_to_string(sc_path).map_err(|e| e.to_string())?;
    serde_json::from_str(&json).map_err(|e| e.to_string())
}

/// Generate a random 16-byte recovery code and return (raw bytes, display string).
/// Display format: XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX (4 groups of 8 uppercase hex).
pub(crate) fn generate_recovery_code() -> ([u8; 16], String) {
    let mut bytes = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut bytes);
    let h = hex::encode_upper(bytes);
    let display = format!("{}-{}-{}-{}", &h[0..8], &h[8..16], &h[16..24], &h[24..32]);
    (bytes, display)
}

/// Normalize a user-entered recovery code to a consistent secret string.
pub(crate) fn normalize_recovery_code(code: &str) -> String {
    code.replace(['-', ' '], "").to_uppercase()
}

// ── Vault commands ────────────────────────────────────────────────────────────

/// Returns true if the vault sidecar (.keys) file exists for this DB.
#[tauri::command]
pub(crate) fn vault_exists(app: AppHandle, name: String) -> bool {
    let db_path = resolve_db_path(&app, &name);
    std::path::Path::new(&sidecar_path(&db_path)).exists()
}

/// Verify a passphrase and return the key string for use with db_load / keychain.
/// For vault DBs: decrypts vault_a, returns "raw:HEX".
/// For legacy DBs (no sidecar): verifies passphrase directly, returns passphrase as-is.
#[tauri::command]
pub(crate) fn db_open_passphrase(
    app: AppHandle,
    name: String,
    passphrase: String,
) -> Result<String, String> {
    let db_path = resolve_db_path(&app, &name);
    let sc = sidecar_path(&db_path);

    if std::path::Path::new(&sc).exists() {
        let kf = read_key_file(&sc)?;
        let master_key = decrypt_master_key(&kf.vault_a, &passphrase)?;
        Ok(format!("raw:{}", hex::encode(master_key)))
    } else {
        // Legacy: verify by opening a test connection
        open_with_key(&db_path, &Some(passphrase.clone()))?;
        Ok(passphrase)
    }
}

/// Verify a recovery code and return "raw:HEX" key string.
#[tauri::command]
pub(crate) fn db_open_recovery(app: AppHandle, name: String, recovery_code: String) -> Result<String, String> {
    let db_path = resolve_db_path(&app, &name);
    let sc = sidecar_path(&db_path);

    if !std::path::Path::new(&sc).exists() {
        return Err("No recovery data available for this database".to_string());
    }

    let kf = read_key_file(&sc)?;
    let secret = normalize_recovery_code(&recovery_code);
    let master_key = decrypt_master_key(&kf.vault_b, &secret)?;
    Ok(format!("raw:{}", hex::encode(master_key)))
}

/// Enable encryption (or upgrade legacy encryption) with the vault system.
/// DB must already be loaded. Returns the new key + a recovery code to show the user.
#[tauri::command]
pub(crate) fn db_setup_encryption(
    app: AppHandle,
    state: State<'_, DbState>,
    name: String,
    passphrase: String,
) -> Result<SetupResult, String> {
    let db_path = resolve_db_path(&app, &name);
    let tmp_path = format!("{}.enc_setup_tmp", db_path);
    let sc_path = sidecar_path(&db_path);

    // Generate new 32-byte master key
    let mut master_key = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut master_key);
    let master_hex = hex::encode(master_key);

    // Step 1: Export current DB to new master-key-encrypted tmp file
    {
        let mut guard = state.0.lock().unwrap();
        let conn = guard.conn.take().ok_or("Database not loaded")?;
        let safe_tmp = tmp_path.replace('\'', "''");

        let result = conn.execute_batch(&format!(
            "ATTACH DATABASE '{safe_tmp}' AS enc KEY 'x''{master_hex}''';\
             SELECT sqlcipher_export('enc');\
             DETACH DATABASE enc;"
        ));
        drop(conn);

        if let Err(e) = result {
            let _ = std::fs::remove_file(&tmp_path);
            return Err(e.to_string());
        }
    }

    // Step 2: Backup original
    let bak = format!("{}.pre_vault_bak", db_path);
    if let Err(e) = std::fs::copy(&db_path, &bak) {
        let _ = std::fs::remove_file(&tmp_path);
        return Err(format!("Backup failed: {e}"));
    }

    // Step 3: Create vaults
    let (recovery_bytes, recovery_code) = generate_recovery_code();
    let recovery_secret = hex::encode_upper(recovery_bytes);
    let vault_a = match encrypt_master_key(&master_key, &passphrase) {
        Ok(v) => v,
        Err(e) => {
            let _ = std::fs::remove_file(&tmp_path);
            return Err(e);
        }
    };
    let vault_b = match encrypt_master_key(&master_key, &recovery_secret) {
        Ok(v) => v,
        Err(e) => {
            let _ = std::fs::remove_file(&tmp_path);
            return Err(e);
        }
    };
    let kf = KeyFile { version: 1, vault_a, vault_b };
    let kf_json = match serde_json::to_string_pretty(&kf) {
        Ok(j) => j,
        Err(e) => {
            let _ = std::fs::remove_file(&tmp_path);
            return Err(e.to_string());
        }
    };
    if let Err(e) = std::fs::write(&sc_path, &kf_json) {
        let _ = std::fs::remove_file(&tmp_path);
        return Err(format!("Failed to write key file: {e}"));
    }

    // Step 4: Swap DB
    if let Err(e) = std::fs::rename(&tmp_path, &db_path) {
        let _ = std::fs::remove_file(&sc_path);
        let _ = std::fs::remove_file(&tmp_path);
        return Err(e.to_string());
    }

    // Step 5: Reopen with master key
    let new_conn = match open_with_raw_key(&db_path, &master_key) {
        Ok(c) => c,
        Err(e) => {
            // Attempt restore from backup
            let _ = std::fs::copy(&bak, &db_path);
            let _ = std::fs::remove_file(&sc_path);
            return Err(e);
        }
    };

    {
        let mut guard = state.0.lock().unwrap();
        guard.conn = Some(new_conn);
        guard.master_key = Some(master_key);
    }

    Ok(SetupResult {
        key: format!("raw:{master_hex}"),
        recovery_code,
    })
}

/// Re-wrap vaults with a new passphrase (and new recovery code). DB must be
/// open with master_key in state. Returns the new recovery code.
#[tauri::command]
pub(crate) fn db_rewrap_passphrase(
    app: AppHandle,
    state: State<'_, DbState>,
    name: String,
    new_passphrase: String,
) -> Result<String, String> {
    let db_path = resolve_db_path(&app, &name);
    let sc_path = sidecar_path(&db_path);

    let master_key = state
        .0
        .lock()
        .unwrap()
        .master_key
        .ok_or("No master key in session — open with passphrase or recovery code first")?;

    let (recovery_bytes, recovery_code) = generate_recovery_code();
    let recovery_secret = hex::encode_upper(recovery_bytes);

    let vault_a = encrypt_master_key(&master_key, &new_passphrase)?;
    let vault_b = encrypt_master_key(&master_key, &recovery_secret)?;

    let kf = KeyFile { version: 1, vault_a, vault_b };
    let kf_json = serde_json::to_string_pretty(&kf).map_err(|e| e.to_string())?;

    // Atomic write: tmp → rename
    let tmp = format!("{sc_path}.tmp");
    std::fs::write(&tmp, &kf_json).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &sc_path).map_err(|e| e.to_string())?;

    Ok(recovery_code)
}

/// Disable encryption. Passphrase required to verify. Decrypts DB and deletes sidecar.
#[tauri::command]
pub(crate) fn db_disable_encryption(
    app: AppHandle,
    state: State<'_, DbState>,
    name: String,
    passphrase: String,
) -> Result<(), String> {
    let db_path = resolve_db_path(&app, &name);
    let tmp_path = format!("{}.plain_tmp", db_path);
    let sc_path = sidecar_path(&db_path);

    // Verify passphrase
    if std::path::Path::new(&sc_path).exists() {
        let kf = read_key_file(&sc_path)?;
        decrypt_master_key(&kf.vault_a, &passphrase)?; // verify only
    } else {
        // Legacy: open a test connection to verify passphrase
        open_with_key(&db_path, &Some(passphrase.clone()))
            .map_err(|_| "Wrong passphrase".to_string())?;
    }

    // Export to plain
    {
        let mut guard = state.0.lock().unwrap();
        let conn = guard.conn.take().ok_or("Database not loaded")?;
        let safe_tmp = tmp_path.replace('\'', "''");

        let result = conn.execute_batch(&format!(
            "ATTACH DATABASE '{safe_tmp}' AS plain KEY '';\
             SELECT sqlcipher_export('plain');\
             DETACH DATABASE plain;"
        ));
        drop(conn);

        if let Err(e) = result {
            let _ = std::fs::remove_file(&tmp_path);
            return Err(e.to_string());
        }
    }

    std::fs::rename(&tmp_path, &db_path).map_err(|e| e.to_string())?;
    let _ = std::fs::remove_file(&sc_path);

    // Reopen plain
    let new_conn = rusqlite::Connection::open(&db_path).map_err(|e| e.to_string())?;
    let mut guard = state.0.lock().unwrap();
    guard.conn = Some(new_conn);
    guard.master_key = None;
    Ok(())
}

// ── Keychain commands ─────────────────────────────────────────────────────────

const KC_SERVICE: &str = "io.github.frontswitch.dsj";
const KC_USER: &str = "db-passphrase";

#[tauri::command]
pub(crate) fn keychain_get() -> Option<String> {
    Entry::new(KC_SERVICE, KC_USER)
        .ok()
        .and_then(|e| e.get_password().ok())
}

#[tauri::command]
pub(crate) fn keychain_set(password: String) -> Result<(), String> {
    Entry::new(KC_SERVICE, KC_USER)
        .map_err(|e| e.to_string())?
        .set_password(&password)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) fn keychain_delete() -> Result<(), String> {
    match Entry::new(KC_SERVICE, KC_USER)
        .map_err(|e| e.to_string())?
        .delete_credential()
    {
        Ok(_) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}
