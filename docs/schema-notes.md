# Schema Design Notes

## Avatar fields vs Tracker fields

- **Avatar fields** (`avatar_fields`) — system-wide, all avatars share the same field definitions. Used for persistent attributes like age range, role, subsystem. Types: text, integer, intRange, boolean, list. Edited in Settings → Avatar Fields. Values set per-avatar in Settings → Edit Avatars.
- **Tracker fields** (`tracker_fields`) — per-tracker schema, define what gets recorded each time. Richer types (date, datetime, who, color, custom, etc.). Not shared across trackers.

## intRange type

- Stored as `"25"` (single value = point) or `"10-20"` (range). Parsed with `parseIntRange()` in `src/lib/avatarFieldUtils.ts`.
- `-` is searched starting at index 1 to allow potential negative numbers (e.g. `"-5-10"`).
- Filter `Age=5`: point-in-range check — stored range must include 5.
- Filter `Age=10-19`: overlap check — `intRangesOverlap([stored], [query])` → `a[0] <= b[1] && a[1] >= b[0]`.
- Display: `formatIntRange("10-20")` → `"10–20"` (en-dash), `formatIntRange("25")` → `"25"`.

## Tracker design

- A tracker defines a set of typed fields (the "schema" for one type of record).
- `createTracker()` auto-creates a channel in the "Trackers" folder. Channel name/hidden stay in sync with the tracker via `updateTracker()`.
- `submitRecord()` writes: `tracker_records` row → `tracker_record_values` rows (one per field) → `messages` row with bar-separated text for search + `tracker_record_id` foreign key.
- Bar text format: `|YYYY-MM-DD HH:MM|val1|val2|...|` — timestamp always first, then field values in sort order.
- `messages.avatar_id` is nullable — anonymous records create a message with null avatar (shown as grey dot / "—").
- Field types: `date`, `datetime`, `text_short`, `text_long`, `list`, `integer`, `number`, `boolean`, `who`, `color`, `custom`.
- Tracker records render as inline cards in chat with field names + formatted values (not raw bar text).

## Tag design

- Tags are created/updated on every message send or edit via `upsertTagsFromText(text)`.
- `upsertTagsFromText` parses `#word` tokens, skips digits-only and hex colors (via `shouldSkip`), upserts with `ON CONFLICT(name) DO UPDATE SET last_used_at` — `display_name` is set only on insert, never overwritten (first casing wins).
- Channel names are surfaced as tag suggestions in-memory (non-hidden channels only, not stored in `tags` table). If a channel gets hidden or deleted, its name simply stops appearing.
- Avatar mentions (`@name`) are fully in-memory — matched on `name` and `icon_letters`, never written to DB.

## Config system

- `src/config.ts` — `ConfigLevel` enum (Basic=0, Normal=1, Advanced=2, System=3, Restart=4), `AppConfig` interface, `REGISTRY: ConfigDef[]`.
- `ConfigDef` has: `path` (dot notation into AppConfig), `group`, `label`, `description?`, `type` (`number|boolean|select|text`), `level`, `default`, `options?`.
- `isEntryVisible(entry, currentLevel)`: Restart entries show at System+; others show when `entry.level <= currentLevel`.
- `EditConfig` renders the registry — no hardcoded fields. To add a config option: add to `AppConfig` interface, add to `DEFAULTS`, add a `ConfigDef` to `REGISTRY`.
- Config persisted in `localStorage` under `dsj-config` via `loadConfig`/`saveConfig`.
- `store/app.ts` holds `config: AppConfig` and `setConfig` — calling `setConfig` saves and updates React state.

## View mode resolution

Channels and folders each have a nullable `view_mode` column. ChatPanel resolves:
`channelViewMode ?? folderViewMode ?? config.ui.viewMode`
Fetched via `getChannelViewModes(channelId)` (single JOIN query) on channel change.
