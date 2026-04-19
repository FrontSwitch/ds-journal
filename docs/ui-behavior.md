# UI Behavior

## Sidebar

Folders collapse/expand. Right-click for context menu (rename, delete, move to folder). "All Messages" virtual channel pinned at top. Scratch and Album appear below All Messages (outside folders). Channel counts shown as `day/week/month`. Reloads from DB when settings close. Clicking any channel closes Settings if open.

**Sync button**: `⇅` icon in the `sidebar-icon-bar` (alongside ?, ⚙, 👥). No peers → tooltip "Set up sync" → opens Settings→Sync. Peers present → calls `syncNow()`. Only visible in Tauri desktop (not mobile overlay). On sync attempt, a `sidebar-sync-status-bar` strip appears below the header: "Syncing…" (muted) while in progress; on failure shows "Sync failed — PeerName: reason" (abbreviated error, full error in title tooltip) + "Check settings →" link that opens Settings→Sync; on success shows "Synced" (green, 3s then auto-hides). The strip is not shown when idle.

## ChatPanel

Messages newest at bottom. "Load more" (50→100→500). 300ms debounce search, date filter with ←/→. Double-click to edit. `canType` (slash without avatar) vs `canSend` (avatar required).

- `#` → tag autocomplete (DB + channels). `@` → avatar autocomplete. `:word` → emoji autocomplete.
- `/` at position 0 → slash command autocomplete (Tab/Enter completes name; Enter executes).

| Command | Effect |
|---|---|
| `/who @name` | Set current avatar |
| `/channel #name` | Switch channel |
| `/avatar @name` | Open avatar info popup |
| `/note @name` | Open avatar info popup → new note |
| `/tracker #name` | Navigate to tracker → open record form |
| `/report #name` | Navigate to tracker → open report |
| `/front @name` | Log front change to Front Log |
| `/front clear` | Log front clear |
| `/date YYYY-MM-DD\|today\|yesterday` | Jump to date in search |
| `/last` | Jump to latest messages |
| `/search query` | Open search with query |
| `/settings [page]` | Open settings (optional subpage alias) |
| `/roll 6 20` or `/roll 6 x 3` | Roll dice 🎲 |
| `/lottery 72 x 5` | Pick unique numbers 🎰 |
| `/tarot [count]` | Draw 1–10 tarot cards 🔮 |
| `/album` | Open image album (ALBUM_ID = -3) |

`/tracker` and `/report` use a `pendingOpenRef` pattern: set ref before `setSelectedChannel`, consumed in the channel-change `useEffect` once tracker is detected.

## AvatarPanel

Full/Small/Hidden modes (persisted). "Active Here" group pinned at top. Filter: plain name search or `key=value` avatar field search. Double-click or `/avatar`/`/note` → AvatarInfoPopup (info / note list / new+edit note views). If panel hidden when triggered, auto-shows as 'small'.

## Settings

12 editors (Edit Avatars, Avatar Fields, Edit Groups, Edit Channels, Edit Trackers, Edit Tags, Edit Shortcodes, App Settings, Backup & Export, Security, Import, Sync). Crisis footer (988, findahelpline.com) on main page only. Escape closes sub-editor or Settings entirely. Also opens via Cmd+, (native menu) or `open-settings` Tauri event. `/settings shortcodes` or `/settings emoji` navigates directly to Edit Shortcodes. `setPendingSettingsPage('sync')` deep-links to Sync page (used by sidebar sync button when no peers configured).

## Sync UI (`Settings → Sync`)

Four sections:
- **This Device** (bordered card): device name input; device type shown as current value + **Change** button (expands to radio list, collapses on selection); IP and port rows — port shows "(random on restart)" or "(fixed)" label with **Change** button (inline editor: blank = random, number = fixed port, **Apply** calls `sync_restart_on_port` live and updates display).
- **Paired Devices**: list with device type badge + "cold sync" badge; **✕** remove button per peer (`removeSyncPeer` → DELETE + Rust cache evict); **Sync Now** button (disabled if no trusted peers).
- **Sync Policy by Device Type**: per-type rows for primary/full/remote/cold — autoBackup checkbox, messageDays radio (All / None / Custom N). Saved to `config.sync.policyByType` via `saveConfig`.
- **Conflicts**: shown when `sync_conflicts` has open entries — entity name + type badge, conflicting fields, detected date, Dismiss button (marks `'lww'`).
- **Connect to a peer** (collapsed toggle at bottom): expands to show generate-pair-code panel (for other device to connect to you) and connect-to-peer form (IP:port + pair code + Connect button).

## Edit Shortcodes (`Settings → Edit Shortcodes`)

Skin tone picker row (saves to `features.skinTone`). Two-column layout (440px list / editor panel). Left: filter input, collapsible category groups — user categories expanded by default, built-in categories (Faces, Hearts, Gestures, Nature, Objects) collapsed by default. Filter auto-expands all matching groups. Built-in entries show with skin tone applied; greyed-out if shadowed by a user override. Right panel: user entry editor (name, emoji, aliases, category + save/delete) or built-in viewer (read-only + Clone/Hide buttons, both disabled if a user entry with the same name already exists). Empty emoji string = hidden (entry suppressed from autocomplete).

## Import (`Settings → Import`)

Source selector (Simply Plural / PluralKit). File picker reads JSON via `@tauri-apps/plugin-fs` `readTextFile`. Shows parsed counts. Skip checkboxes per section. Import button runs `runSPImport` / `runPKImport` against live DB. Existing records with same name are skipped (not duplicated).

## RecordEntryForm

Inline panel above textarea. "At:" backdating input, "As:" avatar selector. Required fields (*) block Submit. `text_short` → MentionInput, `text_long` → MentionTextarea. `defaultValue()` uses `field.default_value` if set; date/datetime/who always use contextual defaults (today/now/current avatar).

## Backup

`{appDataDir}/backups/daily/` and `/weekly/`. Checked on startup and every hour.

## Debug panel (Ctrl+`)

Floating bottom-right. Rolling 60s stats + timeline. DB calls colored green(<10ms)/yellow(<50ms)/red(≥50ms). WHERE hints: `[ch]`, `[all]`, `[av]`, `[search]`, `[count]`.

## Menu bar (`src-tauri/src/lib.rs` setup)

Custom menu built in `setup()` using `tauri::menu::{MenuBuilder, SubmenuBuilder, MenuItem, PredefinedMenuItem}`. Structure:

- **macOS only — app-name submenu**: Preferences… (Cmd+,), Hide, Hide Others, Show All, Quit
- **Edit**: Undo, Redo, Cut, Copy, Paste, Select All
- **Window**: Minimize
- **Help**: About DSJ, Help, Credits

Menu events → `app.emit(event_name, payload)`:
- `"menu-settings"` → emits `"open-settings"` (listened in `App.tsx` → `setShowSettings(true)`)
- `"menu-about"` → emits `"open-about"` with `"about"`
- `"menu-help"` → emits `"open-about"` with `"help"`
- `"menu-credits"` → emits `"open-about"` with `"credits"`

`Sidebar.tsx` listens for `"open-about"` → sets `aboutTab` state + `showAbout=true`.

Note: `PredefinedMenuItem::zoom` does not exist in this version of Tauri. Window submenu only uses `minimize`.
