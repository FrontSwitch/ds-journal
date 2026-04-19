# Performance Notes (M4 Mac Mini, 500k message stress test)

- `SELECT messages [ch]` (single channel, 50 rows): ~23ms — mostly Tauri IPC overhead
- `SELECT messages [count]` (channel counts, GROUP BY all rows): ~126ms at 500k — acceptable, async
- `SELECT messages [search]` (FTS5 text query): <10ms after FTS index built
- `SELECT avatar_group_members`: single query via `getAllGroupMembers()`, not N per-group calls
- FTS5 first-time rebuild is a one-time migration cost; triggers maintain the index thereafter
- Search is prefix-based (`"term"*`), not substring — "vent" matches "venting", "ent" does not
