# DissociativeSystemJournal (DSJ)

## About this file

CLAUDE.md is loaded at the start of every session (every `/clear`). Every line has a recurring token cost. Content belongs here only if knowing it **upfront** saves more tokens than it costs to load — typically by preventing a file read, avoiding a mistake, or answering the "where do I even start?" question.

**Belongs in CLAUDE.md:**
- Non-obvious conventions that affect nearly every task (e.g. always use `t()` for strings)
- Gotchas that cause wrong answers without prior knowledge (e.g. `confirm()` is blocked, no `created_at` on `tracker_fields`)
- File map / project structure — orients navigation without reading the filesystem
- Running commands — needed almost every session
- Schema — needed whenever touching DB code; faster than reading `db/index.ts` each time
- Migration pattern — prevents mistakes; not obvious from code

**Belongs in `docs/` (link from here, read on demand):**
- Full reference tables that duplicate what the code already says clearly
- Detailed UI behavior — read the component instead
- Sync protocol internals — read `db/sync.ts` instead
- Security startup flow — read `docs/security.md` instead

**Doesn't belong anywhere in prose:**
- Things obvious from file names, function names, or standard conventions
- Exhaustive API listings when the code is the ground truth

When updating this file: if a section can be summarized in one sentence with a `docs/` pointer, do that. If a gotcha only applies in one rare scenario, it lives in `docs/gotchas.md`. If something was added "just in case," remove it.

A local, private desktop journal for dissociative systems (DID/OSDD). Multiple avatars (alters) post messages into channels, and can submit structured tracker records. Built with Tauri + React + TypeScript + SQLite.

**Formerly:** syschat. Renamed 2026-03-22. GitHub handle: FrontSwitch.

**Versioning:** Minor version bumps (`x.Y.z`) whenever the DB schema changes (new tables, columns, or migrations). Patch bumps for fixes/UI changes.

## What it is

- Private, local-first. No cloud, no external auth. Opt-in P2P sync between personally-owned devices over LAN.
- Avatars represent alters. Messages and tracker records are attributed to an avatar (or anonymous).
- Channels are topics/spaces, grouped into folders. Avatars are grouped into subsystems.
- Trackers are structured data forms (e.g. Mood, Front Log). Each tracker auto-creates a channel in the "Trackers" folder.
- "All Messages" is a virtual channel showing everything across all channels, filterable by avatar.
- No message delete UI by design — safety consideration for the user's system.

## Stack

- **Tauri v2** — desktop shell, native window, file access
- **rusqlite** (`bundled-sqlcipher`) — SQLite/SQLCipher access via custom Tauri commands (`db_load`, `db_execute`, `db_select`). Single persistent connection stored in `DbState(Arc<Mutex<DbInner>>)`. PRAGMA state (e.g. `foreign_keys`) **persists** for the session.
- **argon2, aes-gcm, rand, hex** (Rust crates) — vault-based key wrapping: Argon2id KDF + AES-256-GCM for master key vaults; also used for sync payload encryption
- **keyring** — macOS Keychain integration for optional passphrase caching
- **axum + tokio** (Rust) — embedded HTTP server for P2P sync (configurable port, started at Tauri `setup()`; restartable via `sync_restart_on_port`)
- **hkdf + sha2 + hmac** (Rust crates) — HKDF-SHA256 derives enc_key + mac_key from peer_code; HMAC-SHA256 per-request signing
- **local-ip-address** (Rust crate) — get LAN IP for sync info endpoint
- **tauri-plugin-fs** — file system ops (backup dir management, JSON export write, import file read)
- **tauri-plugin-dialog** — native save/open dialogs
- **tauri-plugin-opener** — `openUrl()` for external links
- **React + TypeScript** — all UI; **Vite** — build tool; **Zustand** — global UI state
- **SQLite/SQLCipher** — single `.db` file at `~/Library/Application Support/com.frontswitchstudio.dsj/dsj.db`
- **zxcvbn** (npm) — passphrase strength estimation in `PassphraseStrength` component

## Running

```bash
cd ~/dev/tools/syschat   # folder name unchanged
npm run tauri dev        # ⚠ uses prod identifier — touches production data
npm run dev:tauri        # dev build with isolated identifier (.dsj.dev) — safe for development
npm run dev:test         # isolated test instance 1 (.dsj.test), uses test.db
npm run dev:test2        # isolated test instance 2 (.dsj.test2), uses test2.db — run simultaneously with dev:test to test sync
npm run seed:test        # (re)create test DB with sample alters/channels, no messages
npm run seed:test2       # (re)create test2 DB for second sync instance
npm run seed:load        # load-test DB: 2000 messages by default (~100/day density)
npm run seed:load -- --messages 50000   # explicit count; scales time range automatically
npm run delete:test      # wipe the test DB
npm test                 # run Vitest unit tests (pure functions only, no Tauri)
npm run test:watch       # watch mode
```

First run compiles Rust packages (3-5 min). Subsequent runs are fast.

To run against any arbitrary DB:
```bash
DSJ_DB=/path/to/custom.db npm run tauri dev
```

If the app fails to start with "database is locked":
```bash
rm ~/Library/Application\ Support/com.frontswitchstudio.dsj/dsj.db-wal
rm ~/Library/Application\ Support/com.frontswitchstudio.dsj/dsj.db-shm
```

On first launch with an empty DB, the app auto-seeds: a "general" channel, a "someone" avatar, and 5 tracker presets (Medications, Front Log, Mood, Sleep, Triggers).

## Project structure

```
src/
  App.tsx / App.css           # root layout, DB init, auto-backup, seed on empty DB, idle timer
  config.ts                   # AppConfig interface, ConfigLevel enum, REGISTRY (ConfigDef[])
  types/index.ts              # all TS interfaces; ALL_MESSAGES_ID=-1, SCRATCH_ID=-2, ALBUM_ID=-3
  store/
    app.ts                    # Zustand: selectedChannelId, selectedAvatarId, config, pending signals,
                              #   pendingSettingsPage + setPendingSettingsPage() — deep-links into Settings subpage on open
                              #   nudgeCheckRequest + requestNudgeCheck() — triggers nudge re-evaluation
    debug.ts                  # Zustand: rolling DB/log buffer for debug panel
  i18n/
    en.json                   # all user-visible strings by component namespace
    index.ts                  # t(key, vars?) and tn(key, count, vars?) helpers; StringKey type
  lib/
    botEngine.ts              # matchBot, getBotConfig, listBotNames; BotRule/BotConfig/BotMatch/BotMessage types;
                              #   RULE_SET_REGISTRY (auto-loaded via import.meta.glob); BOT_FILES from bots.json
    nudge.ts                  # shouldShowNudge, snoozeNudge, dismissNudge — encryption nudge state
    syncUtils.ts              # pure sync helpers (unit-testable): extractConflictFields, payloadsConflict, lwwWinner
    tagUtils.ts               # getTagCursor, applyTagAccept, shouldSkip
    messageUtils.ts           # buildThreadedList, buildLogRows
    avatarFieldUtils.ts       # parseIntRange, intRangesOverlap, formatIntRange
    importUtils.ts            # pure transform helpers: normalizeColor, spTsToSql, isoToSql, etc.
    importSP.ts               # Simply Plural JSON importer: parseSPData, previewSP, runSPImport
    importPK.ts               # PluralKit JSON importer: parsePKData, previewPK, runPKImport
  content/
    doc.ts / credits.en.ts    # DocNode types + credits data
    help.ts                   # HelpNode/HelpTopic/HelpContent; 3 in-app topics (chat, trackers, sync); full docs in docs/help_en.md
  db/
    index.ts                  # DB singleton, migrations, DSJ_DB env var, timing instrumentation
    channels.ts               # folder + channel CRUD, counts, view modes; setChannelSyncEnabled
    avatars.ts                # avatar + group CRUD, avatar_fields CRUD; setAvatarImageData
    messages.ts               # message queries, FTS search, sendImageMessage
    images.ts                 # insertImage, getAllImages
    tags.ts                   # tag CRUD, upsertTagsFromText, pruneOldTags
    backup.ts                 # runBackup (VACUUM INTO), checkAutoBackup, exportToJson
    trackers.ts               # tracker + field CRUD, submitRecord, getRecords, getRecordCounts; setTrackerSyncEnabled
    tracker-presets.ts        # BUILTIN_PRESETS, seedTrackerPresets
    emojiOverrides.ts         # EmojiOverride interface; CRUD for emoji_overrides table
    sync-device.ts            # getOrCreateDeviceId, initSyncCtx; getDeviceName/Type/Port + setters
                              #   (all backed by private getDeviceConfig/setDeviceConfig helpers)
    sync-events.ts            # logCreate, logUpdate, logDelete, getEntityId, getLocalEventsSince
    sync-peers.ts             # getSyncPeers, getSyncPeerById, upsertSyncPeer, removeSyncPeer, recordSyncComplete
    sync-apply.ts             # SYNC_TABLES, EID_TO_FK, NATURAL_KEY_COLS; buildStructureSnapshot, applyRemoteEvents
    sync.ts                   # Orchestration: handleSyncRequest, syncNow, completePairing,
                              #   getOpenConflicts, getOpenConflictsWithNames, resolveConflict
                              #   Re-exports everything from sync-*.ts so import paths are unchanged
  data/
    emojis.ts                 # 106 emoji entries; EMOJI_CATEGORIES; SKIN_TONES; applySkinTone()
                              #   findEmojiSuggestions(prefix, skinTone, entries?); buildMergedEntries()
    tarot.ts                  # TAROT_DECK: string[] (78 cards)
    bots/
      bots.json               # array of BotConfigFile — single file drives the /bot registry
      rules/*.json            # named rule sets (dissociation, eliza, emotional, activity, social,
                              #   routine, catchall); loaded via import.meta.glob — drop a file to add a set
  hooks/
    useChannels.ts            # folders + channels + counts
    useAvatars.ts             # avatars, groups, fields, fieldValues
    useMessages.ts            # messages with pagination (N → 2N → 10N)
    useAutocomplete.ts        # base hook: selectedIndex, pendingCursor, moveUp/Down/reset
    useTagInput.ts / useSlashInput.ts / useEmojiInput.ts
    useSearchState.ts         # search state + debounce effect + closeSearch/adjustDate
    useTrackerState.ts        # tracker/field/record-form/report state + channel-change effect
    useScratchExport.ts       # scratch export state + handleExportNote/Channel/openChannelExport
  components/
    security/                 # PassphrasePrompt, RecoveryCodeDisplay, PostRecoverySetup,
                              #   EncryptionNudge, PassphraseStrength
    about/About.tsx           # 3 tabs: About / Help / Credits; tab+onTabChange are controlled props
    sidebar/Sidebar.tsx       # left panel: folders, channels, counts, context menus
    chat/                     # ChatPanel, TrackerReport, RecordEntryForm, autocomplete components,
                              #   ImagePostForm, ImageMessage, Lightbox, AlbumView
    avatars/AvatarPanel.tsx   # right panel: full/small/hidden, filter, AvatarInfoPopup
    debug/DebugPanel.tsx      # Ctrl+` floating overlay: DB timing stats + timeline
    settings/                 # Settings router + 12 sub-editors (EditAvatars, EditChannels,
                              #   EditTrackers, EditTags, EditShortcodes, EditConfig, Backup,
                              #   Security, Import, Sync, EditAvatarFields, EditGroups)
scripts/
  seed-test-db.cjs / seed-load-test.cjs / delete-test-db.cjs
  import-sp-json.cjs          # SP JSON import (--file, --import, --db, --skip-* flags)
  check-i18n.cjs              # compare locale files against en.json
src-tauri/
  src/lib.rs                  # mod declarations, run() entry point (menu bar + sync server setup), all tests
  src/db.rs                   # DbState, helpers (to_sql, from_sql, resolve_db_path, sidecar_path,
                              #   open_with_key, open_with_raw_key); db_* commands; get_db_path
  src/vault.rs                # VaultEntry/KeyFile crypto (Argon2id + AES-256-GCM); vault_* and
                              #   db_open_passphrase/recovery/setup_encryption/rewrap/disable commands;
                              #   keychain_* commands
  src/sync_server.rs          # SyncShared; HKDF/HMAC/AES sync crypto; axum handlers (info/pair/sync);
                              #   sync_* Tauri commands; start_sync_server()
  capabilities/default.json   # sql/fs/dialog/opener/window/webview capabilities + scopes
  tauri.conf.json             # identifier: com.frontswitchstudio.dsj
```

## localStorage keys

- `avatar-panel-mode` — `'full' | 'small' | 'hidden'`
- `selected-channel-id` — last selected channel ID (number)
- `syschat-backup-config` — auto-backup settings (daily/weekly keep counts)
- `dsj-config` — AppConfig (settings level, feature flags, DB tuning, hide timer)
- `dsj-nudge` — encryption nudge state: `null` (never shown), `"done"` (dismissed), or `{ count, nextAt }` (snoozed with exponential backoff: 2→4→8→16 days)
- `dsj-recovery-pending` — recovery code string awaiting acknowledgement; persists across restarts — `App.tsx` renders a blocking overlay until cleared.
- `dsj-device-id` — UUID4 stable device identity; also written to `device_config` table. `device_name`, `device_type`, and `sync_port` are stored only in `device_config` (DB).

## Schema (21 tables + FTS)

All 14 content tables have an `entity_id TEXT UNIQUE` column — a UUID4 stable cross-device identity. Junction tables (avatar_group_members, avatar_field_values, tracker_record_values, channel_avatar_activity) are synced as part of their parent payload.

```sql
folders        id, name, description, color, hidden, sort_order, created_at, view_mode, entity_id
channels       id, name, folder_id, description, color, hidden, sort_order,
               last_avatar_id, created_at, view_mode, entity_id, sync_enabled INTEGER DEFAULT 1
avatars        id, name, color, image_path, description, pronouns, hidden, icon_letters,
               sort_order, created_at, entity_id, image_data TEXT (base64 PNG, nullable)
avatar_groups  id, name, description, color, hidden, sort_order, created_at, entity_id
avatar_group_members   avatar_id, group_id  (composite PK)
avatar_fields  id, name, field_type TEXT DEFAULT 'text', list_values TEXT,
               sort_order, created_at, entity_id
               -- field_type: 'text' | 'integer' | 'intRange' | 'boolean' | 'list'
avatar_field_values    avatar_id, field_id, value TEXT  (composite PK; CASCADE on both FKs)
messages       id, channel_id, avatar_id, text, original_text, deleted, created_at,
               tracker_record_id, parent_msg_id, entity_id,
               message_type TEXT DEFAULT 'chat'   -- 'chat' | 'page'
message_images id, message_id (FK → messages CASCADE), image_path, caption, location, people,
               created_at, entity_id
messages_fts   FTS5 virtual table — content='messages', tokenize='unicode61'; trigger-synced
channel_avatar_activity  channel_id, avatar_id  (composite PK)
trackers       id, channel_id, name, description, color, hidden, sort_order, created_at,
               entity_id, sync_enabled INTEGER DEFAULT 1
emoji_overrides id, name UNIQUE, aliases TEXT (pipe-separated), emoji TEXT (empty = hidden),
               category TEXT, created_at, entity_id
tracker_fields id, tracker_id, name, field_type, sort_order, required, list_values (JSON),
               range_min, range_max, custom_editor, summary_op TEXT DEFAULT 'none',
               default_value TEXT, entity_id
               -- summary_op: 'none' | 'sum' | 'average' | 'min' | 'max' | 'count_true' | 'count_false'
               -- NO created_at column on tracker_fields
tracker_records        id, tracker_id, avatar_id, modified, created_at, entity_id
tracker_record_values  id, record_id, field_id, value_text, value_number, value_boolean,
                       value_avatar_id  UNIQUE(record_id, field_id)
tags           id, name UNIQUE (lowercase), display_name, created_at, last_used_at, entity_id

-- Sync tables
device_config  key TEXT PRIMARY KEY, value TEXT   -- device_id, device_name, device_type, sync_port, sync_message_days, sync_auto_backup
event_log      event_id, device_id, device_counter, entity_type, entity_id,
               operation ('create'|'update'|'delete'), payload JSON, timestamp INTEGER (ms)
sync_peers     device_id PK, device_name, device_type DEFAULT 'full',
               last_seen_counter, last_sync_timestamp, peer_address (ip:port), peer_code,
               trusted, blocked
sync_conflicts id PK, entity_type, entity_id, field_name, device_id_a, event_id_a,
               device_id_b, event_id_b, detected_at, status ('open'|'pickedA'|'pickedB'|'original'|'lww')
```

Indexes: `idx_messages_channel`, `idx_messages_all`, `idx_messages_avatar`, `idx_tracker_records_tracker`, `idx_tracker_record_values_record`, `idx_message_images_message`, `idx_event_log_device`, `idx_event_log_entity`, `idx_sync_conflicts_entity`, `idx_sync_conflicts_open`.

See `docs/schema-notes.md` for design details (intRange, tracker design, tag design, config system, view mode resolution).

## Migration pattern

- New columns: `ALTER TABLE ... ADD COLUMN` in the `alterations` array in `db/index.ts`. Wrapped in try/catch to ignore "column already exists". Always also add to the `CREATE TABLE IF NOT EXISTS` statement.
- Table recreations: drop+recreate in dependency order (child tables before parent).
- **Index renames**: `DROP INDEX IF EXISTS old_name` first — `CREATE INDEX IF NOT EXISTS` silently skips if name exists.
- **FTS5**: check `sqlite_master WHERE name='messages_fts'` to detect first creation; only then run rebuild.
- **entity_id backfill**: `UPDATE {table} SET entity_id = (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || lower(substr(hex(randomblob(2)),1,3)) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(6)))) WHERE entity_id IS NULL`

## Localization

All user-visible strings in `src/i18n/en.json`, organized by namespace: `names, sidebar, chat, avatarPanel, settings, editConfig, editTags, editShortcodes, editAvatars, editAvatarImg, editAvatarFields, editGroups, editChannels, editTrackers, recordForm, backup, security, passphrase, postRecovery, recovery, passphraseStrength, nudge, help, about, errors, sync`.

```ts
import { t, tn } from '../../i18n'
t('sidebar.title')                          // simple lookup
t('editChannels.editTitle', { name, type }) // interpolation with {{var}}
tn('backup.copy', count)                    // plural: uses copyOne / copyOther
```

`StringKey` type is derived from `en.json` — TypeScript will error on unknown keys.

## AppConfig reference

```ts
ui.settingsLevel      // ConfigLevel enum — which settings are visible
ui.hideAfterMinutes   // auto-minimize after N minutes idle (0 = disabled)
ui.viewMode           // 'normal' | 'compact' | 'log' — overridable per channel/folder
ui.threadedView       // boolean — indent replies (default true); flat in log mode always
ui.use24HourClock     // boolean
ui.language           // locale code; 'xx' = pseudo-locale ⟦…⟧
threads.maxDepth      // max reply nesting depth (default 5)
threads.depthColors   // comma-separated hex colors cycling by depth
db.initialMessageLoad        // messages on first channel open (default 50)
db.tagPruneLimit             // max stored tags, LRU (default 10000)
features.tags                // tag autocomplete (default true)
features.mentions            // mention autocomplete (default true)
features.showFrontGroup      // show Front group in avatar panel (default true)
features.builtinShortcodes   // include built-in emoji shortcodes (default true)
features.skinTone            // skin tone modifier string (default '')
security.encryptDatabase     // SQLCipher encryption (default false)
security.rememberPassphrase  // cache passphrase in macOS Keychain (default false)
sync.autoSyncOnStartup       // sync on app startup (default false)
sync.autoSyncMinutes         // periodic sync interval in minutes, 0 = off (default 0)
sync.staleDaysNotify         // (planned) mobile local notification threshold in days (default 2)
sync.bleScanEnabled          // (planned) BLE central scan on mobile (default true)
```

## Helpers in types/index.ts

- `ALL_MESSAGES_ID = -1`, `SCRATCH_ID = -2`, `ALBUM_ID = -3` — virtual channel constants
- `assetUrl(path)` — converts file path to Tauri asset URL via `convertFileSrc()`
- `getInitials(name, allNames)` — 1 letter, or 2 if first letter shared with another avatar
- `isHidden(hidden: number | null): boolean` — returns `(hidden ?? 0) !== 0`; bitmask-safe
- `FIELD_TYPES` — const array of tracker field type strings; `FieldType` union
- `AVATAR_FIELD_TYPES = ['text', 'integer', 'intRange', 'boolean', 'list'] as const`
- `DeviceType = 'primary' | 'full' | 'remote' | 'cold'`
- `SyncEvent`, `SyncPeer`, `SyncConflict` — sync type interfaces
- `TrackerField` — includes `entity_id: string | null` (needed for `_record_values` sync payload)

## Scripts

```bash
node scripts/seed-test-db.cjs                    # create/reset test DB + delete .keys sidecar
node scripts/seed-load-test.cjs                  # 2000 messages (~100/day over 20 days)
node scripts/delete-test-db.cjs                  # wipe test DB + delete .keys sidecar
node scripts/import-sp-json.cjs --file export.json --import    # SP JSON import
node scripts/check-i18n.cjs                      # compare all locale files against en.json
```

SP JSON maps: members→avatars, groups→avatar_groups, chatCategory→folders, chatChannel→channels, chatMessage→messages, frontHistory→front log, notes→notes channel.

## Testing

```bash
npm test                       # Vitest: unit tests (~1.5s)
npm run test:watch             # watch mode
cd src-tauri && cargo test     # Rust tests (~8s, includes Argon2 KDF)
node scripts/check-i18n.cjs   # i18n completeness check
```

See `docs/testing.md` for full details: test structure, mock patterns, RTL gotchas, manual testing cheat sheet.

## Security / Encryption

Opt-in via Settings → Security. Vault design: random 256-bit master key encrypts SQLCipher; wrapped in `dsj.keys` sidecar via two Argon2id + AES-256-GCM vaults (passphrase + recovery code). `raw:` prefix protocol passes hex master key directly to `db_load`. See `docs/security.md` for startup flow, Rust commands, legacy mode, and key facts.

## P2P Sync

LAN sync via per-device event log, entity_id UUID4s, LWW conflict resolution, first-sync merge. Per-device sync policy (messageDays, autoBackup) stored in device_config table — not AppConfig. Transport: axum HTTP + AES-256-GCM + HMAC-SHA256. See `docs/sync.md` for full design, Rust server details, JS sync client API, and Tauri command reference.

## UI Behavior

See `docs/ui-behavior.md` for full details on Sidebar, ChatPanel (slash commands), AvatarPanel, Settings, Sync UI, Edit Shortcodes, Import, RecordEntryForm, Backup, Debug panel, and Menu bar.

## Images / Album

Images stored as local file paths in `message_images` (no bytes in DB). HEIC renders natively in Tauri/WebKit on macOS. See `docs/image-album.md` for full details.

## Bot & Write session

Both features are **ephemeral** — no DB schema changes, no persistence across restarts.

### Journaling bot (`/bot`)
- `/bot <name>` — enable; `/bot off` — disable; `/bot hide/show` — toggle display
- Bot state lives in ChatPanel local state: `botConfig`, `botMessage`, `botRecentTags`, `toneHistory`
- `botMessage` holds the single most-recent response (replaced on each send, cleared on channel change)
- Timer: `botTimerRef` (setTimeout) fires after `delaySeconds` of idle; reset by textarea onChange
- Tag decay: `botLastMsgAtRef` tracks last send time; if gap > 2 min, tags are trimmed at rate of 1 per 5 min from the oldest end
- Empty response (`""`) — bot message renders with no text; useful for silent presence

#### `matchBot(text, recentTags, rules, tone?)`
- Input is split into sentences on `[.!?]` boundaries; every rule is tested against every sentence
- All matching candidates collected across sentences; highest `priority + boost` wins for the response
- Tags from **all** matching rules (all sentences) are merged into returned tags
- Rule fields: `chance` (0–1 roll), `required` (OR: at least one tag in context), `excluded` (ANY: none in context), tone range filters

#### Tone system (`src/lib/botEngine.ts`)
- Two dimensions, 0–4, default 2: **seriousness** (light→heavy) and **depth** (playful→mirroring→reflective)
- `distillTone(tags, tagMap, history)` — recency-weighted sum of tag deltas from neutral (weight = 1/(i+1)), clamped to [0,4]; volatility = avg Euclidean distance across last 5 snapshots
- `ToneState { seriousness, depth, volatility }` — passed to `matchBot`; rules can gate on `minSeriousness`, `maxSeriousness`, `minDepth`, `maxDepth`, `minVolatility`, `maxVolatility`
- Debug line on bot message: `[ruleName] +tags · s:X.X d:X.X v:X.XX · ctx: tags`

#### `src/data/bots/bots.json`
Top-level structure (not an array): `{ tags: Record<string, ToneDelta>, bots: BotConfigFile[] }`. `tags` is the shared tone-delta map for all bots. Drop a rule JSON in `src/data/bots/rules/` → auto-registered via `import.meta.glob`.

#### Design note
Content-matching rules (emotional keywords, activity words) were explored and abandoned — too many false positives in journal text, especially for plural systems using "we" or dropping pronouns. Structural patterns (`I feel`, `I can't`, `I (.+) again`) and catchall tone-gated responses are the reliable layer. The chat UI format also creates an expectation of a conversational partner that the bot can't satisfy; worth revisiting with a different visual treatment.

### Page editor (`/page`)
- `/page` or `[+ Page]` button opens a full-panel Tiptap WYSIWYG editor; chat history and input are hidden while it's open
- `← Back` closes the editor and returns to chat; draft is preserved. `Discard draft` asks for confirmation (inline Yes/No) before clearing. `Publish` commits.
- Draft saved to `localStorage` at key `dsj-page-draft-${channelId}`; restored on next open. Draft indicator: `[+ Page]` button shows `✎ Page` in accent color when a draft exists.
- On open, if no avatar is selected, `openPageEditor()` falls back to the channel's `last_avatar_id`
- Published pages call `sendMessage(..., 'page')` — stored as HTML in `messages.text` with `message_type = 'page'`
- `isEmpty` is tracked as React state (updated in Tiptap's `onUpdate`) — **not** computed from `editor.getHTML()` at render time. Computing it at render time causes Publish to stay disabled after draft restore because `setContent` doesn't trigger a re-render.
- In history, pages render as `<PageItem>` (expanded by default); header shows avatar icon (16px), name, title, date/time, ▾/▸ chevron. Click to collapse/expand. Collapse state is ephemeral (not persisted).
- `extractPageTitle(html)` — parses the first heading or `<p>` text from the HTML, truncated to 100 chars. Called once per render in `PageItem`.
- `@avatar` mention: Tiptap `Mention` extension, `char: '@'`, suggestion list positioned via `props.clientRect()` as `position: fixed`. Inserts a `.page-mention-chip` span. Arrow keys + Enter/Space to select.
- `#tag` / `#channel` mention: custom `Extension` + raw `Suggestion` plugin (`@tiptap/suggestion`), `char: '#'`, `allow: () => true`. **Do not use `Mention.extend()` for this** — the inherited `allow` function checks `schema.nodes[this.name]` which fails for non-node extensions. Inserts plain text `#displayName `. Arrow keys + Enter/Space to select.
- Both suggestion dropdowns: render closure tracks `selectedIndex` + `currentItems` + `currentCommand` as mutable closure vars (not React state) to handle keyboard events in `onKeyDown` without a forwarded ref.
- Styles split: editor UI in `PageEditor.css`; `.page-item` card styles also in `PageEditor.css` (imported via `PageEditor.tsx`, bundled statically so available even when editor is closed)

### Writing session (`/write`)
- `/write 5 minutes` or `/write 200 words` — start; `/write stop` — end manually
- Session state: `writeSession` + `writeSessionRef` (ref used in callbacks to avoid stale closure)
- `writeTickRef` — `setInterval` every 1s, increments `writeTick` to force status bar re-render
- Word counting: happens on every `handleSend` (both regular channel and scratch paths)
- Goal reached: `endWriteSession` is called BEFORE `reload()` so both the last user message and summary are committed before a single fetch — avoids race where summary appears before last message
- Intent message (`✍ Writing goal: …`) and summary (`✍ Wrote N words in M minutes.`) use `addScratchMessage` for scratch/allMessages channels, `sendMessage` for regular channels; both use the currently selected avatar
- Threading: in regular channels, all messages sent during a session are replies to the intent message (`parent_msg_id = intentMsgId`); summary is also a reply. Scratch/allMessages: no threading (`intentMsgId = null`).
- `sendMessage` in `db/messages.ts` returns `Promise<number>` (the new row id) — used to capture `intentMsgId` at session start
- Bot catchall fires write nudge text instead of its normal response when a write session is active (`result.ruleName === 'catchall' && capturedSession`)
- `botMessage` is in the scroll effect deps so the nudge/bot message scrolls into view when it appears

## Known Gotchas

See `docs/gotchas.md` for SQLite, Tauri v2, React/UI, encryption, and sync gotchas.
