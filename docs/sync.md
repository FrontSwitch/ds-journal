# P2P Sync

Private bidirectional sync between personally-owned devices (Mac Mini ↔ mobile, laptop, etc.) over LAN. No cloud service; no sharing with others.

## Design

- **Per-device event log**: every mutation (create/update/delete) appended to `event_log` with device_id, monotonic device_counter, entity_type, entity_id, operation, JSON payload, ms timestamp.
- **entity_id**: each content row has a UUID4 `entity_id` — stable cross-device identity separate from integer PKs. Set at create time by app code (`crypto.randomUUID()`); backfilled for existing rows via migration.
- **LWW (Last-Write-Wins)**: conflict resolution by ms timestamp. Detected conflicts stored in `sync_conflicts`; surfaced in Settings → Sync with Dismiss button (marks as `'lww'`). Pure helpers in `src/lib/syncUtils.ts` (unit-tested): `extractConflictFields`, `payloadsConflict`, `lwwWinner`.
- **First-sync merge**: auto-match existing data by natural key (name, or name+tracker_id for tracker_fields) — no "primary device" designation. `mergeOrInsert` adopts the incoming entity_id AND updates all structural fields (folder_id, color, etc.) on the matched row. Handles auto-seeded defaults (general channel, someone avatar, 5 presets) that exist on all devices without event_log entries.
- **Device types**: `primary` (main home machine), `full` (full replica), `remote` (limited access device), `cold` (offline/archive — only syncs structure). Stored per-device in `device_config`; stored per-peer in `sync_peers.device_type`. Visible in Sync settings with descriptions.
- **Per-type sync policy**: `SyncTypePolicy { autoBackup: boolean, messageDays: number }` in `config.ts`. Defaults: primary/full → all messages; remote → 30 days; cold → 0 (structure only). `messageDays: -1` = all, `0` = none, `N` = last N days. Policy editor in Settings → Sync. `getSyncPolicy(config, deviceType)` merges saved overrides with defaults. `syncNow()` applies policy per peer: auto-backup before sync (calls `runBackup('daily', 7)`), cutoffMs passed to `getLocalEventsSince`.
- **sync_enabled**: channels and trackers have `sync_enabled INTEGER NOT NULL DEFAULT 1`. When 0, their messages/records are excluded from outgoing sync events (filtered via EXISTS subquery in `getLocalEventsSince`). Toggle in Edit Channels / Edit Trackers settings.
- **Avatar image sync**: `avatars.image_data TEXT` stores a base64-encoded PNG (canvas-resized, default 300×300, configurable 64–1024px). Import button in Edit Avatars loads the avatar's file path → canvas resize → base64 → `setAvatarImageData`. Included in `buildStructureSnapshot()` cold sync payload. Avatar display in AvatarPanel and message avatars prefer `image_data` over `image_path`.
- **Auto-sync**: `sync.autoSyncOnStartup` (boolean, default false) triggers `syncNow()` silently after app ready. `sync.autoSyncMinutes` (number, default 0 = off) sets a `setInterval` in `App.tsx` for periodic sync. Both configurable in App Settings.
- **Cold sync**: triggered on first sync with a peer (`!peer.last_sync_timestamp`) or when either device type is `cold`. Sending device prepends `buildStructureSnapshot()` to outgoing events; receiving device's `handleSyncRequest` detects `cold_sync: true` flag and also sends its own snapshot. Structure snapshot events use `device_counter: -1`, `timestamp: 0` sentinel — sorts before real events, guarantees FK dependency order.
- **EID_TO_FK pattern**: all FK integer IDs in event_log payloads are replaced with `_*_eid` entity_id companions (e.g. `_channel_eid`, `_avatar_eid`, `_folder_eid`). `applyRemoteEvents` resolves them generically via `EID_TO_FK` array before INSERT/UPDATE. This ensures FKs resolve correctly on any device regardless of local integer assignment.
- **Transport**: HTTP (axum, configurable port — fixed or random per `sync_port` in `device_config`) + AES-256-GCM payload encryption derived from `peer_code` via HKDF-SHA256 + HMAC-SHA256 per-request replay protection. No TLS cert management needed for LAN trusted-device sync.
- **Payload format**: `"hex_nonce.hex_ciphertext"` over HTTP body, signed with HMAC header.
- **Discovery**: mDNS/Bonjour for LAN auto-discovery (planned, `mdns-sd` Rust crate); QR code for initial pairing.

## Passive sync wake-up

- **BLE GATT** (primary): Mac Mini runs as BLE peripheral (`btleplug`, planned); sends GATT notify on `SYNC_PENDING_CHAR` when it has new event_log entries. iOS app wakes in background via `bluetooth-central` entitlement, reads `PEER_INFO_CHAR` for current IP:port, then syncs over WiFi.
- **Local notification fallback**: mobile checks `last_sync_timestamp` on foreground; if stale beyond configurable threshold (`sync.staleDaysNotify`, default 2 days), fires a local notification via `@capacitor/local-notifications`.

## Rust side (axum server)

- Starts in `setup()` via `start_sync_server(shared, app_handle, 0)` (random port); JS calls `sync_restart_on_port` after DB open to apply stored preferred port
- `SyncShared` state: `port`, `device_name: Mutex<String>`, `device_type: Mutex<String>`, `pair_codes` (6-digit OTP, 5 min expiry), `peer_codes` (in-memory HMAC key cache), `pending` (oneshot sender map for request routing), `server_task: Mutex<Option<JoinHandle<()>>>` (aborted on port change)
- Endpoints: `GET /dsj/info` (unauthenticated — returns device_id, device_name, device_type, port), `POST /dsj/pair`, `POST /dsj/sync`
- `handle_pair` reads `requester_device_name`/`requester_device_type` from request body; includes them in `dsj-peer-paired` event payload
- `handle_sync` passes `cold_sync` flag from request body through `SyncRequestEvent` → JS handles cold sync response inclusion; emits `dsj-sync-request` → JS calls `sync_complete_request` → oneshot sends response back → encrypted response returned

## Tauri commands (sync)

| Command | Purpose |
|---|---|
| `sync_set_device_info` | JS → Rust: store device_id + device_name + device_type in SyncShared (called from initSyncCtx and on name/type change) |
| `sync_get_server_info` | Returns `{ device_id, device_name, device_type, local_ip, port }` for pairing UI |
| `sync_generate_pair_code` | Generate 6-digit OTP (stored in memory, 5 min TTL) |
| `sync_complete_request` | JS → Rust: deliver sync response to waiting HTTP handler via oneshot |
| `sync_update_peer_cache` | JS updates in-memory peer_code cache after DB write |
| `sync_remove_peer` | Remove peer from in-memory cache |
| `sync_restart_on_port` | async: abort old server task, bind new port (0=random, falls back to random if busy), spawn new task, return actual port |
| `sync_send_to_peer` | Outgoing sync: HKDF + AES-GCM encrypt, HMAC sign, POST, decrypt response; accepts `cold_sync: bool` |

## App-code event logging

All CRUD functions in `db/avatars.ts`, `db/channels.ts`, `db/messages.ts`, `db/trackers.ts`, `db/emojiOverrides.ts`, `db/front-log.ts` call `logCreate`/`logUpdate`/`logDelete` from `db/sync.ts` after every mutation.

## JS sync client (`db/sync.ts`)

- `getDeviceName/setDeviceName/getDeviceType/setDeviceType` — read/write `device_config` key-value table; `set*` also calls `sync_set_device_info`
- `getSyncPort/setSyncPort` — read/write `sync_port` in `device_config` (0 = random, n = fixed port)
- `applyPreferredPort()` — reads `sync_port` from DB and calls `sync_restart_on_port`; called from `initSyncCtx()` after DB open
- `removeSyncPeer(deviceId)` — DELETE from `sync_peers` + calls `sync_remove_peer` to evict from Rust cache
- `buildStructureSnapshot()` — generates synthetic create events (device_counter=-1, timestamp=0) for all structure tables in FK dependency order (folders→channels→avatar_groups→avatar_fields→avatars→trackers→tracker_fields→tags→emoji_overrides). Sentinel counter=-1 sorts before all real events so FK resolution order is guaranteed.
- `mergeOrInsert(db, entityType, entityId, payload)` — first-sync deduplication: if entity_id already present skip; if natural key matches an existing row, UPDATE entity_id AND all structural fields (excluding `created_at`, `entity_id`) to adopt incoming state; else INSERT OR IGNORE.
- `applyRemoteEvents(events, theirDeviceId)` — generic EID_TO_FK loop resolves all `_*_eid` fields to local integer FKs before INSERT/UPDATE; extracts `_member_eids`/`_field_values`/`_record_values` for junction table inserts; applies LWW conflict detection; logs received events to prevent re-apply
- `handleSyncRequest(peerDeviceId, fromCounter, events, coldSync = false)` — called by App.tsx `dsj-sync-request` listener; applies remote events; if `coldSync`, prepends `buildStructureSnapshot()` to outgoing events; returns our events since fromCounter (with sync_enabled filtering)
- `syncNow()` — iterates trusted peers; determines cold sync trigger; applies per-peer policy (autoBackup, messageDays cutoff); calls `sync_send_to_peer` with `cold_sync` flag; returns `{ sent, received, peers, errors }`
- `getOpenConflictsWithNames()` — like `getOpenConflicts()` but joins entity name from DB for display in Sync settings
- `completePairing(deviceId, peerCode, peerAddress, deviceName?, deviceType?)` — saves peer to DB + updates Rust in-memory cache
- `SYNC_TABLES` — Set of whitelisted table names; unknown entity_type events are skipped
- `EID_TO_FK` — array mapping `_*_eid` payload fields → `{ col, table }` for generic FK resolution in `applyRemoteEvents`
- `NATURAL_KEY_COLS` — map of entity type → natural key columns used by `mergeOrInsert` (e.g. `tracker_fields: ['name', 'tracker_id']`)
- `VIRTUAL_FIELDS` — fields stripped before INSERT: `member_ids`, `group_ids`, `field_values`, `values` (legacy integer-based formats)

## App.tsx event listeners

- `dsj-sync-request` (only when `ready=true`) — payload includes `cold_sync: boolean` → calls `handleSyncRequest(..., coldSync)` → calls `sync_complete_request`
- `dsj-peer-paired` — payload includes `device_name`, `device_type` → calls `upsertSyncPeer` to persist newly-paired peer to DB

## Capacitor (mobile)

Makes `fetch()` calls to Mac Mini's HTTP server. No server on mobile. Uses `getOrCreateDeviceId()` from localStorage. BLE central (planned) via `@capacitor-community/bluetooth-le`.
