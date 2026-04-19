# Security / Encryption

Database encryption is opt-in via Settings → Security. When disabled (default), the DB is plain SQLite. When enabled, it uses AES-256 SQLCipher with a wrapped master key.

## Architecture

DSJ uses a **key wrapping** design rather than using the passphrase directly as the SQLCipher key:

1. A random 256-bit **master key** is generated at encryption setup time.
2. The master key is encrypted into two vaults using Argon2id + AES-256-GCM:
   - **Vault A** — encrypted with the user's passphrase
   - **Vault B** — encrypted with a generated recovery code
3. Both vaults are stored in `dsj.keys` (JSON) alongside `dsj.db`.
4. SQLCipher is opened with the raw master key via `PRAGMA key = "x'HEX'"`.

Changing the passphrase only re-wraps the vaults — the master key and DB encryption are unchanged, making passphrase changes fast and safe.

## Startup flow

1. `App.tsx` checks `config.security.encryptDatabase` before any DB call.
2. If enabled, calls `db_exists` — if the file is missing, resets encryption config and starts fresh.
3. If `config.security.rememberPassphrase`, invokes `keychain_get`. The keychain stores the `raw:HEX` master key (new vault mode) or the passphrase (legacy mode). If found, calls `db_load(key)` directly.
4. If no keychain entry, renders `PassphrasePrompt` (full-screen, blocks app).
5. Prompt calls `db_open_passphrase(passphrase)` — decrypts Vault A via Argon2id + AES-GCM, returns `"raw:HEX"` key if vault exists, or verifies passphrase directly for legacy DBs.
6. On success: `setDbKey(key)` → `getDb()` → `db_load(key)` → session connection opened.

**Recovery code path:** Prompt can switch to recovery mode, calling `db_open_recovery(code)`. On success, a `PostRecoverySetup` screen forces the user to set a new passphrase and generates a new recovery code before the app loads.

## Escape hatch (forgot passphrase)

`PassphrasePrompt` has "Forgot passphrase?" → destructive confirmation → `db_reset` (closes connection, deletes DB + WAL/SHM + sidecar), clears Keychain, resets `encryptDatabase` to false. **All data is permanently lost.**

## Rust commands (`src-tauri/src/lib.rs`)

| Command | Purpose |
|---|---|
| `db_exists(name)` | Returns bool — whether the DB file exists |
| `db_reset(name)` | Close connection, delete DB + WAL/SHM + `.keys` sidecar |
| `db_verify(name, key)` | Open + verify key, then close (kept for debugging) |
| `db_load(name, key)` | Open the session connection; extracts and stores master_key if key has `raw:` prefix |
| `db_execute(sql, params)` | Run a DML/DDL statement |
| `db_select(sql, params)` | Run a SELECT, return rows as JSON objects |
| `vault_exists(name)` | Returns bool — whether `dsj.keys` sidecar exists |
| `db_open_passphrase(name, passphrase)` | Decrypt Vault A → return `"raw:HEX"` key (vault mode) or verify passphrase directly (legacy mode) |
| `db_open_recovery(name, recovery_code)` | Decrypt Vault B → return `"raw:HEX"` key |
| `db_setup_encryption(name, passphrase)` | Generate master key, re-encrypt DB via `sqlcipher_export`, create vaults, return `{key, recovery_code}` |
| `db_rewrap_passphrase(name, new_passphrase)` | Re-create both vaults with new passphrase + new recovery code; DB key unchanged |
| `db_disable_encryption(name, passphrase)` | Verify passphrase, export to plain, delete sidecar |
| `keychain_get()` | Read key from macOS Keychain |
| `keychain_set(password)` | Save key to macOS Keychain |
| `keychain_delete()` | Remove key from Keychain (no-op if absent) |

## Legacy mode

DBs encrypted before the vault system was introduced have no `.keys` sidecar. `vault_exists` returns false. The app uses the passphrase directly as the SQLCipher key (original behavior). Settings → Security detects this and shows an "Upgrade Encryption" section that adds the vault system without changing the passphrase.

## Key facts

- **Losing both passphrase AND recovery code = lost data.** No reset, no backdoor.
- **Changing passphrase is non-destructive.** `db_rewrap_passphrase` only updates the `.keys` file. The database is not re-encrypted. Fast and safe.
- **Keychain stores the master key** (new mode) or passphrase (legacy). Either way, `db_load` handles both via the `raw:` prefix detection in `open_with_key`.
- **Backup before encrypt**: `db_setup_encryption` copies the original to `dsj.db.pre_vault_bak` before swapping. Delete manually once the encrypted DB is confirmed healthy.
- **Key derivation**: Argon2id, 64 MB memory, 3 iterations, 1 lane. Produces a 32-byte vault key. Master key is 32 bytes random. SQLCipher receives it as a raw hex key via `PRAGMA key = "x'HEX'"`, bypassing SQLCipher's internal PBKDF2.
- **Recovery code format**: 16 random bytes → uppercase hex → `XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX`. The normalized form (dashes stripped, uppercase) is used as the Argon2 input for Vault B.

See `docs/data-recovery.md` for step-by-step instructions to access data without the app.
