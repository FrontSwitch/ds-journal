# Known Gotchas

## SQLite / Database

- **Single persistent connection**: `rusqlite` holds one `Connection` (in `DbState` Arc<Mutex>). PRAGMA state persists across calls — no `SQLITE_BUSY` from the app side. The `Arc` wrapper allows the axum sync server to share the same connection.
- **ALTER TABLE RENAME updates child FKs**: SQLite 3.26+ rewrites FK references on parent rename. Check `sqlite_master` if a rename migration was abandoned partway.
- **New columns**: add to both the `CREATE TABLE IF NOT EXISTS` statement AND the `alterations` array.
- `src-tauri/migrations/001_initial.sql` does not exist — schema defined entirely inline in `db/index.ts`.
- **`tracker_fields` has no `created_at`**: unlike other tables, `tracker_fields` does not have a `created_at` column. Don't include it in `buildStructureSnapshot()` queries.

## Tauri v2

- **Binary rejects unknown CLI flags**: use `DSJ_DB` env var instead of `--db` CLI arg.
- **`core:window:allow-minimize` required**: window minimize needs this explicit capability.
- **`core:webview:allow-print` required**: `window.print()` for tracker report PDF. (Not `core:window:allow-print` — that doesn't exist.)
- **Print PDF blank page**: `display:none` on ancestors blocks children. Use `visibility:hidden` on `body *` + `visibility:visible` on the target element.
- **OS drag-drop**: HTML `ondragover`/`ondrop` do NOT fire on elements for file drags from Finder. Use `getCurrentWindow().onDragDropEvent`. The position in the event payload is in viewport logical pixels (not physical, not screen-relative — do not divide by `devicePixelRatio` or subtract `window.screenX/Y`).
- **`PredefinedMenuItem`**: does NOT have a `zoom` method. Available methods include `copy`, `cut`, `paste`, `select_all`, `undo`, `redo`, `minimize`, `hide`, `hide_others`, `show_all`, `quit`, `separator`, `close_window`, `fullscreen`, `bring_all_to_front`. Check actual API before using.
- **Menus**: use `MenuBuilder` + `SubmenuBuilder` + `MenuItem::with_id` + `PredefinedMenuItem`. Menu events handled via `app.on_menu_event`. Emit Tauri events to frontend with `app.emit(...)` — requires `use tauri::Emitter` in scope.
- `confirm()` is blocked in Tauri webview — use inline Yes/No state pattern for destructive actions.
- Avatar/image paths must be absolute. Asset protocol scope: `$HOME/**`, `/Users/**`, `/Volumes/**` — images on external drives work.

## React / UI

- `useAvatars` is called in both `ChatPanel` and `AvatarPanel` — minor duplicate queries, fine at this scale.
- React StrictMode removed from `main.tsx` — was causing double DB init and lock errors in dev.
- Sidebar reloads via `prevShowSettings` ref in `Sidebar.tsx` when settings close.
- **CSS variable**: app uses `--bg-panel` (value `#181825`) for panel backgrounds. Do NOT use `--bg-2` — it doesn't exist and causes transparency.
- **About.tsx tab is controlled**: `tab: Tab` and `onTabChange: (tab: Tab) => void` are required props. Sidebar manages the tab state; `App.tsx` listens for `'open-settings'` event to open Settings.

## Encryption

- **Encryption + missing DB**: if `encryptDatabase` is true but the DB file is gone, `App.tsx` auto-resets the encryption config and starts fresh. `PassphrasePrompt` has a "Forgot passphrase?" escape hatch that calls `db_reset` (deletes DB + WAL/SHM + sidecar `.keys` file) and clears the Keychain entry.
- **Vault architecture**: encrypted DBs use a wrapped master key (`dsj.keys` sidecar alongside `dsj.db`). Random 256-bit master key encrypts SQLCipher; master key is wrapped in two vaults (vault_a = passphrase, vault_b = recovery code) using Argon2id + AES-256-GCM. Master key never changes on passphrase rotation — only the vaults are rewritten. Keychain stores `"raw:HEXHEX"` (master key), not the passphrase.
- **`raw:` prefix protocol**: frontend passes `"raw:HEXHEX"` to `db_load` / keychain. Rust's `open_with_key` detects this prefix and uses `PRAGMA key = "x'HEX'"` raw SQLCipher key format (bypasses KDF). ATTACH uses blob literal: `KEY x'HEX'`.
- **Legacy encrypted DBs**: DBs encrypted before the vault system have no sidecar. `vault_exists` returns false. `PassphrasePrompt` / `db_open_passphrase` falls back to direct passphrase test-open (legacy mode). Security settings show "Upgrade Encryption" section.
- **Post-recovery setup**: after recovery unlock, `App.tsx` sets `needsPostRecovery=true` and renders `PostRecoverySetup` (full-screen) instead of main layout. User must set a new passphrase before the app loads. `db_rewrap_passphrase` only replaces vaults — master key and keychain entry remain valid.
- **EncryptionNudge trigger**: `App.tsx` calls `checkNudge()` after app is ready and whenever settings close (true→false). Also called via `nudgeCheckRequest` in store (incremented after `sendMessage`). Reads config via `useAppStore.getState()` at call time to avoid stale closures. Shows nudge if: not encrypted, `shouldShowNudge()` passes, and avatars+channels > 1.

## Sync

- **HMAC `new_from_slice` ambiguity**: both `KeyInit` and `Mac` traits have `new_from_slice`. Use fully-qualified syntax: `<HmacSha256 as KeyInit>::new_from_slice(key)`.
- **axum server in Tauri `setup()`**: `setup()` is synchronous. `start_sync_server(shared, app_handle, port)` is a shared helper that aborts the old task, binds a `std::net::TcpListener` (port 0 = random; falls back to random if requested port is busy), converts to `tokio::net::TcpListener` inside `tauri::async_runtime::spawn`, stores the `JoinHandle` in `SyncShared.server_task`, and returns the actual port. Called from `setup()` with port 0, and from the `sync_restart_on_port` async command with the user's preferred port.
- **Sync port persistence**: `sync_port` key in `device_config` (0 = random, n = fixed). `initSyncCtx()` calls `applyPreferredPort()` after DB is open — reads `sync_port` and calls `sync_restart_on_port` if non-zero. The server starts on a random port at `setup()` time, then JS immediately restarts it on the preferred port. UI port editor in Settings → Sync calls `sync_restart_on_port` live and updates the display; if the port was busy and Rust fell back to random, the stored preference is cleared to 0.
- **Sync oneshot pattern**: axum `POST /dsj/sync` handler cannot call `db_select` directly (wrong thread). It emits a `dsj-sync-request` Tauri event to JS, then awaits a `tokio::sync::oneshot::Receiver`. JS calls `sync_complete_request(request_id, response)` → Tauri command finds the sender in `SyncShared.pending` and sends the response back to the HTTP handler.
- **initSyncCtx() order**: must be called before `seedTrackerPresets()` and `seedFrontLog()` in `App.tsx` so that `device_config` has the device_id before any event_log entries are written. Also calls `sync_set_device_info` to push device_name/type to Rust SyncShared, then calls `applyPreferredPort()` to restart the server on the stored port if set.
- **EID_TO_FK payloads**: all FK integer IDs in `logCreate`/`logUpdate` payloads must use `_*_eid` companions (e.g. `_channel_eid`, `_avatar_eid`), never raw integer `channel_id`/`avatar_id`. `applyRemoteEvents` resolves them generically — raw integers silently reference wrong rows on other devices.
- **Cold sync sentinel**: `buildStructureSnapshot()` uses `device_counter: -1`, `timestamp: 0`. The counter=-1 prevents these events from being stored in event_log or returned as "local events since counter". The timestamp=0 ensures they sort before all real events in dependency resolution order.
- **First-sync merge / seeded data**: data inserted via seed scripts (not app CRUD) has no event_log entry. Cold sync is the only mechanism for these entities to propagate. `mergeOrInsert` prevents duplicates when both devices have independently-seeded rows with different entity_ids but matching natural keys.
