mod db;
mod sync_server;
mod vault;

use std::sync::Arc;
use tauri::{Emitter, Manager};

// ── Entry point ───────────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(db::DbState(Arc::new(std::sync::Mutex::new(
            db::DbInner::default(),
        ))))
        .manage(Arc::new(sync_server::SyncShared::new()))
        .invoke_handler(tauri::generate_handler![
            db::get_db_path,
            db::db_exists,
            db::db_reset,
            db::db_verify,
            db::db_load,
            db::db_execute,
            db::db_select,
            vault::vault_exists,
            vault::db_open_passphrase,
            vault::db_open_recovery,
            vault::db_setup_encryption,
            vault::db_rewrap_passphrase,
            vault::db_disable_encryption,
            vault::keychain_get,
            vault::keychain_set,
            vault::keychain_delete,
            sync_server::sync_set_device_id,
            sync_server::sync_set_device_info,
            sync_server::sync_get_server_info,
            sync_server::sync_generate_pair_code,
            sync_server::sync_complete_request,
            sync_server::sync_update_peer_cache,
            sync_server::sync_remove_peer,
            sync_server::sync_restart_on_port,
            sync_server::sync_send_to_peer,
        ])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            if let Ok(data_dir) = app.path().app_data_dir() {
                db::exclude_from_time_machine(&data_dir);
            }

            // ── Menu bar ──────────────────────────────────────────────────────
            {
                use tauri::menu::{MenuBuilder, MenuItem, PredefinedMenuItem, SubmenuBuilder};

                // macOS: app-name menu with Preferences… (Cmd+,)
                #[cfg(target_os = "macos")]
                let app_sub = SubmenuBuilder::new(app, "DissociativeSystemJournal")
                    .item(&MenuItem::with_id(
                        app,
                        "menu-settings",
                        "Preferences…",
                        true,
                        Some("CmdOrCtrl+,"),
                    )?)
                    .separator()
                    .item(&PredefinedMenuItem::hide(app, None)?)
                    .item(&PredefinedMenuItem::hide_others(app, None)?)
                    .item(&PredefinedMenuItem::show_all(app, None)?)
                    .separator()
                    .item(&PredefinedMenuItem::quit(app, None)?)
                    .build()?;

                let edit_sub = SubmenuBuilder::new(app, "Edit")
                    .item(&PredefinedMenuItem::undo(app, None)?)
                    .item(&PredefinedMenuItem::redo(app, None)?)
                    .separator()
                    .item(&PredefinedMenuItem::cut(app, None)?)
                    .item(&PredefinedMenuItem::copy(app, None)?)
                    .item(&PredefinedMenuItem::paste(app, None)?)
                    .item(&PredefinedMenuItem::select_all(app, None)?)
                    .build()?;

                let window_sub = SubmenuBuilder::new(app, "Window")
                    .item(&PredefinedMenuItem::minimize(app, None)?)
                    .build()?;

                let help_sub = SubmenuBuilder::new(app, "Help")
                    .item(&MenuItem::with_id(
                        app,
                        "menu-about",
                        "About DSJ",
                        true,
                        None::<&str>,
                    )?)
                    .separator()
                    .item(&MenuItem::with_id(
                        app,
                        "menu-help",
                        "Help",
                        true,
                        None::<&str>,
                    )?)
                    .item(&MenuItem::with_id(
                        app,
                        "menu-credits",
                        "Credits",
                        true,
                        None::<&str>,
                    )?)
                    .build()?;

                #[cfg(target_os = "macos")]
                let menu = MenuBuilder::new(app)
                    .item(&app_sub)
                    .item(&edit_sub)
                    .item(&window_sub)
                    .item(&help_sub)
                    .build()?;
                #[cfg(not(target_os = "macos"))]
                let menu = MenuBuilder::new(app)
                    .item(&edit_sub)
                    .item(&window_sub)
                    .item(&help_sub)
                    .build()?;
                app.set_menu(menu)?;

                app.on_menu_event(|app, event| match event.id().as_ref() {
                    "menu-settings" => {
                        app.emit("open-settings", ()).ok();
                    }
                    "menu-about" => {
                        app.emit("open-about", "about").ok();
                    }
                    "menu-help" => {
                        app.emit("open-about", "help").ok();
                    }
                    "menu-credits" => {
                        app.emit("open-about", "credits").ok();
                    }
                    _ => {}
                });
            }

            // ── Sync HTTP server ──────────────────────────────────────────
            {
                let shared = app.state::<Arc<sync_server::SyncShared>>().inner().clone();
                let actual_port = sync_server::start_sync_server(shared, app.handle().clone(), 0);
                println!("[sync] HTTP server listening on port {actual_port}");
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

// ── Unit tests ────────────────────────────────────────────────────────────────
//
// Run with:  cd src-tauri && cargo test
//
// The vault_* tests invoke Argon2id (64 MB, 3 iterations) — they take ~1-3 s
// each on modern hardware, which is expected for a KDF test.

#[cfg(test)]
mod tests {
    use crate::db::{sidecar_path, to_sql, from_sql};
    use crate::vault::{
        decrypt_master_key, derive_vault_key, encrypt_master_key, generate_recovery_code,
        normalize_recovery_code,
    };
    use rusqlite::types::Value;

    // ── Fast tests (no crypto) ─────────────────────────────────────────────

    #[test]
    fn sidecar_path_replaces_db_extension() {
        assert_eq!(sidecar_path("/data/dsj.db"), "/data/dsj.keys");
    }

    #[test]
    fn sidecar_path_no_extension() {
        assert_eq!(sidecar_path("/data/mydb"), "/data/mydb.keys");
    }

    #[test]
    fn normalize_recovery_code_strips_dashes() {
        assert_eq!(
            normalize_recovery_code("AABB0011-CCDD2233-EEFF4455-66778899"),
            "AABB0011CCDD2233EEFF445566778899"
        );
    }

    #[test]
    fn normalize_recovery_code_lowercases_to_upper() {
        assert_eq!(
            normalize_recovery_code("aabb0011-ccdd2233-eeff4455-66778899"),
            "AABB0011CCDD2233EEFF445566778899"
        );
    }

    #[test]
    fn normalize_recovery_code_strips_spaces() {
        assert_eq!(
            normalize_recovery_code("AABB0011 CCDD2233 EEFF4455 66778899"),
            "AABB0011CCDD2233EEFF445566778899"
        );
    }

    #[test]
    fn generate_recovery_code_has_correct_format() {
        let (bytes, display) = generate_recovery_code();
        // 16 random bytes
        assert_eq!(bytes.len(), 16);
        // display: XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX
        let parts: Vec<&str> = display.split('-').collect();
        assert_eq!(parts.len(), 4, "should have 4 dash-separated groups");
        for part in &parts {
            assert_eq!(part.len(), 8, "each group should be 8 chars");
            assert!(part.chars().all(|c| c.is_ascii_hexdigit() && !c.is_lowercase()),
                "all chars should be uppercase hex");
        }
    }

    #[test]
    fn generate_recovery_code_normalizes_to_hex_encode_upper() {
        let (bytes, display) = generate_recovery_code();
        // The secret used for vault_b is hex::encode_upper(bytes)
        // Normalizing the display code must produce the same string
        let expected_secret = hex::encode_upper(bytes);
        assert_eq!(normalize_recovery_code(&display), expected_secret);
    }

    // ── to_sql / from_sql ──────────────────────────────────────────────────

    #[test]
    fn to_sql_null() {
        assert_eq!(to_sql(&serde_json::Value::Null), Value::Null);
    }

    #[test]
    fn to_sql_bool_true() {
        assert_eq!(to_sql(&serde_json::json!(true)), Value::Integer(1));
    }

    #[test]
    fn to_sql_bool_false() {
        assert_eq!(to_sql(&serde_json::json!(false)), Value::Integer(0));
    }

    #[test]
    fn to_sql_integer() {
        assert_eq!(to_sql(&serde_json::json!(42)), Value::Integer(42));
    }

    #[test]
    fn to_sql_negative_integer() {
        assert_eq!(to_sql(&serde_json::json!(-7)), Value::Integer(-7));
    }

    #[test]
    fn to_sql_float() {
        assert_eq!(to_sql(&serde_json::json!(3.14)), Value::Real(3.14));
    }

    #[test]
    fn to_sql_string() {
        assert_eq!(
            to_sql(&serde_json::json!("hello")),
            Value::Text("hello".into())
        );
    }

    #[test]
    fn to_sql_array_serialises_to_text() {
        // Arrays have no SQL equivalent — stored as JSON text
        let v = to_sql(&serde_json::json!([1, 2, 3]));
        assert!(matches!(v, Value::Text(_)));
    }

    #[test]
    fn from_sql_null() {
        assert_eq!(from_sql(Value::Null), serde_json::Value::Null);
    }

    #[test]
    fn from_sql_integer() {
        assert_eq!(from_sql(Value::Integer(99)), serde_json::json!(99));
    }

    #[test]
    fn from_sql_real() {
        assert_eq!(from_sql(Value::Real(2.5)), serde_json::json!(2.5));
    }

    #[test]
    fn from_sql_text() {
        assert_eq!(
            from_sql(Value::Text("world".into())),
            serde_json::json!("world")
        );
    }

    #[test]
    fn from_sql_blob_is_null() {
        // Blobs are not used in this app; they map to null
        assert_eq!(from_sql(Value::Blob(vec![1, 2, 3])), serde_json::Value::Null);
    }

    #[test]
    fn to_sql_from_sql_string_roundtrip() {
        let original = serde_json::json!("round-trip");
        assert_eq!(from_sql(to_sql(&original)), original);
    }

    #[test]
    fn to_sql_from_sql_integer_roundtrip() {
        let original = serde_json::json!(1234567);
        assert_eq!(from_sql(to_sql(&original)), original);
    }

    // ── derive_vault_key determinism ───────────────────────────────────────

    #[test]
    fn derive_vault_key_is_deterministic() {
        // Same password + salt must always produce the same key (KDF correctness)
        let salt = [0x55u8; 32];
        let key_a = derive_vault_key("my-passphrase", &salt).unwrap();
        let key_b = derive_vault_key("my-passphrase", &salt).unwrap();
        assert_eq!(key_a, key_b);
    }

    #[test]
    fn derive_vault_key_differs_with_different_salt() {
        let key_a = derive_vault_key("same-pass", &[0x01u8; 32]).unwrap();
        let key_b = derive_vault_key("same-pass", &[0x02u8; 32]).unwrap();
        assert_ne!(key_a, key_b);
    }

    #[test]
    fn derive_vault_key_differs_with_different_password() {
        let salt = [0xAAu8; 32];
        let key_a = derive_vault_key("password-one", &salt).unwrap();
        let key_b = derive_vault_key("password-two", &salt).unwrap();
        assert_ne!(key_a, key_b);
    }

    // ── Slow tests (Argon2id KDF — ~1-3 s each) ───────────────────────────

    #[test]
    fn vault_passphrase_roundtrip() {
        let master_key: [u8; 32] = (0u8..32).collect::<Vec<_>>().try_into().unwrap();
        let passphrase = "correct-horse-battery-staple";

        let vault = encrypt_master_key(&master_key, passphrase)
            .expect("encrypt should succeed");
        let recovered = decrypt_master_key(&vault, passphrase)
            .expect("decrypt with correct passphrase should succeed");

        assert_eq!(master_key, recovered);
    }

    #[test]
    fn vault_wrong_passphrase_rejected() {
        let master_key = [0x42u8; 32];
        let vault = encrypt_master_key(&master_key, "correct-passphrase")
            .expect("encrypt should succeed");
        let result = decrypt_master_key(&vault, "wrong-passphrase");
        assert!(result.is_err(), "wrong passphrase must be rejected");
    }

    #[test]
    fn vault_recovery_code_roundtrip() {
        let master_key = [0xABu8; 32];
        let (recovery_bytes, display) = generate_recovery_code();
        // vault_b is encrypted with hex::encode_upper of the raw bytes
        let recovery_secret = hex::encode_upper(recovery_bytes);

        let vault = encrypt_master_key(&master_key, &recovery_secret)
            .expect("encrypt should succeed");

        // User enters the display string → normalize → decrypt
        let normalized = normalize_recovery_code(&display);
        let recovered = decrypt_master_key(&vault, &normalized)
            .expect("decrypt with correct recovery code should succeed");

        assert_eq!(master_key, recovered);
    }

    #[test]
    fn vault_wrong_recovery_code_rejected() {
        let master_key = [0x99u8; 32];
        let (recovery_bytes, _display) = generate_recovery_code();
        let recovery_secret = hex::encode_upper(recovery_bytes);

        let vault = encrypt_master_key(&master_key, &recovery_secret)
            .expect("encrypt should succeed");

        let wrong = "DEADBEEF-DEADBEEF-DEADBEEF-DEADBEEF";
        let result = decrypt_master_key(&vault, &normalize_recovery_code(wrong));
        assert!(result.is_err(), "wrong recovery code must be rejected");
    }

    #[test]
    fn vault_each_encrypt_produces_unique_ciphertext() {
        // Encryption uses fresh random salt + nonce each time
        let master_key = [0x11u8; 32];
        let passphrase = "same-passphrase";
        let vault_a = encrypt_master_key(&master_key, passphrase).unwrap();
        let vault_b = encrypt_master_key(&master_key, passphrase).unwrap();
        // Different random salt means different ciphertext
        assert_ne!(vault_a.salt, vault_b.salt);
        assert_ne!(vault_a.ciphertext, vault_b.ciphertext);
    }

    /// Simulates db_rewrap_passphrase: after rewrap, old recovery code must be rejected.
    /// vault_b is replaced entirely — old code A cannot decrypt the new vault_b,
    /// but new code B can.
    #[test]
    fn rewrap_invalidates_old_recovery_code() {
        let master_key = [0x42u8; 32];

        // Initial setup: vault_b locked with recovery code A
        let (bytes_a, display_a) = generate_recovery_code();
        let secret_a = hex::encode_upper(bytes_a);
        let vault_b_old = encrypt_master_key(&master_key, &secret_a)
            .expect("initial vault_b should encrypt");

        // Rewrap: generate new recovery code B, replace vault_b
        let (bytes_b, display_b) = generate_recovery_code();
        let secret_b = hex::encode_upper(bytes_b);
        let vault_b_new = encrypt_master_key(&master_key, &secret_b)
            .expect("rewrapped vault_b should encrypt");

        // Old code A must NOT open the new vault
        let result = decrypt_master_key(&vault_b_new, &normalize_recovery_code(&display_a));
        assert!(result.is_err(), "old recovery code must be rejected after rewrap");

        // New code B must open the new vault and yield the same master key
        let recovered = decrypt_master_key(&vault_b_new, &normalize_recovery_code(&display_b))
            .expect("new recovery code must open new vault");
        assert_eq!(master_key, recovered, "master key must survive rewrap unchanged");

        // Sanity: old vault_b_old is still openable with code A (simulates
        // that the old vault existed and worked before rewrap)
        let recovered_old = decrypt_master_key(&vault_b_old, &normalize_recovery_code(&display_a))
            .expect("old recovery code still opens old vault");
        assert_eq!(master_key, recovered_old);
    }
}
