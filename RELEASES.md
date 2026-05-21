# Release Notes

## v0.10.2

*Bug fixes and internal improvements.*

- Fixed a script that catches build errors before pushing releases
- `release.sh` now uses annotated tags

---

## v0.10.1

### New Features

- **Four themes** — Dark (Catppuccin Mocha, default), Dim (Catppuccin Frappé), Light (Catppuccin Latte), and Sepia (warm cream). Switch in Settings.
- **Falling blocks** (`/blocks`) — a focus and regulation activity with falling blocks; `/blocks zen <speed>` for a calmer, unscored mode
- **Avatar fields in the avatar panel** — custom fields now show in the full avatar view with an info popup; filter by avatar fields supports `>5` and `<5` comparisons; list fields display their items
- **Write tracking in Page mode** — `/write` word count now tracks words typed in the page editor, not just chat messages
- **`/write` shorthand** — accepts `m`, `min`, `minutes`, `w`, `words` as goal units

### Improvements

- **Front panel moved to sidebar** — cleaner layout; add avatars with `add <icon>`, remove with a per-avatar button
- **Sync listener** — no longer auto-starts; requires explicit user action to begin listening
- **Avatar panel** — info popup now has a dedicated button; notes favorite toggle works in read mode
- **Scratch export** — renamed for clarity; folder/group selection lists are easier to navigate
- **Large avatar lists** — layout and performance improvements; seed data now includes 100 avatars for testing
- **Channel tracking** — last-used avatar is now tracked per channel (not globally)
- **Mobile polish** — channel name shown in top bar; selected avatar name shown in avatar panel; chat resizes correctly with virtual keyboard; closing the About popup works; clicking an avatar in chat input opens the avatar panel
- **Clicking "select an avatar"** opens the avatar panel, helpful especially on mobile
- **Color contrast** — avatar colors now adapt text for readability
- **EditChannels and EditTrackers** share common code (`TrackerFieldEditor` component)
- **ChatPanel** refactored into `MessageItem`, `PageItem`, and `TrackerRecordCard` components

### Bug Fixes

- PluralKit import now fetches avatar images
- Settings uses `←` to navigate back through subsections
- Tracker sum fields for integers no longer display as floats
- "Load more" button behaves correctly at exact page boundaries
- Tracker record saves correctly show/hide the avatar flag per-tracker

### Tests

- Sync integration tests added
- Bot engine tests added
- PluralKit import tests added
