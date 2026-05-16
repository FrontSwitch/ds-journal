# Testing

DSJ has two test suites: TypeScript (Vitest + React Testing Library) and Rust (cargo test).

`npm test` runs everything — pure unit tests, mock-DB tests, **real-SQLite integration tests** (T3, via `better-sqlite3`), React component tests, and i18n checks.

## Running tests

```bash
npm test               # all Vitest tests (~1.3s)
npm run test:watch     # watch mode

cd src-tauri && cargo test   # Rust unit tests (~8s, includes Argon2 KDF)
```

## TypeScript tests (Vitest)

**390 tests across 19 files.**

### Setup

- **Environment**: `happy-dom` (configured in `vitest.config.ts`)
- **Setup file**: `src/test-setup.ts` — imports `@testing-library/jest-dom`, provides in-memory `localStorage`
- **Tauri mocks** (`src/__mocks__/`):
  - `tauri-core.ts` — `invoke` is a `vi.fn().mockResolvedValue(null)`; `convertFileSrc` returns `asset://path`
  - `tauri-event.ts` — `listen` and `emit` are `vi.fn()`
  - `tauri-sql.ts` — SQL plugin stub
- All three are aliased in `vitest.config.ts` so imports of `@tauri-apps/api/core` etc. resolve to the mocks automatically.

### Sync tests (`src/db/`)

**58 tests across 2 files.** Three tiers: pure, mock-DB, and real-SQLite integration.

| File | Tier | What it tests |
|---|---|---|
| `sync-events.test.ts` | T1 (mock DB) | `logCreate`, `logUpdate`, `logDelete`, `logUpdateById`, `getEntityId`, `getLocalEventsSince` — SQL shape, param order, filter conditions |
| `sync-apply.test.ts` | T1 pure | `safeCol`, `sanitizePayload` — injection-prevention allowlist |
| `sync-apply.test.ts` | T2 (mock DB) | `applyRemoteEvents`: dedup, unknown entity skip, create/update/delete paths, FK `_*_eid` resolution, LWW conflict recording, conflict dedup, cold-sync sentinel not stored in event_log, first-sync merge |
| `sync-apply.test.ts` | T3 (real SQLite) | Two-device structure sync; first-sync merge (entity_id adoption); LWW conflict and no-conflict; message sync with FK resolution; message soft-delete; avatar group members; event log round-trip; cutoffMs filter |

**T3 uses `better-sqlite3`** (already in devDependencies) to run a real in-memory SQLite DB. Helper: `src/db/sync-test-utils.ts` — `makeTestDb()` creates the schema, `makeNativeDb()` wraps it in the `NativeDb` interface, `makeEvent()` builds test events.

**Injected DB pattern**: sync functions accept an optional `injectedDb?: NativeDb` parameter. When omitted, they fall back to `getDb()` as in production. Tests pass a real or mock DB directly — no module mocking needed.

### Pure function tests (`src/lib/`)

| File | What it tests |
|---|---|
| `tagUtils.test.ts` | `getTagCursor`, `applyTagAccept`, `shouldSkip` |
| `messageUtils.test.ts` | `buildThreadedList`, `buildLogRows` |
| `helpers.test.ts` | `getInitials`, `isHidden`, misc utils |
| `avatarFieldUtils.test.ts` | `parseIntRange`, `intRangesOverlap`, `formatIntRange` |
| `dateUtils.test.ts` | `toSqlDatetime`, `toIsoDate`, `toBackupTimestamp` |
| `nudge.test.ts` | `shouldShowNudge`, `snoozeNudge`, `dismissNudge` — exponential backoff, localStorage state |
| `importSpJson.test.ts` | `normalizeColor`, `spTsToSql`, `buildMemberDescription`, `buildFrontHistoryText`, `buildNoteText`, `buildBoardText`, `frontHistoryMemberId` |
| `importUtils.test.ts` | Shared import transform helpers |
| `importPK.test.ts` | `parsePKData`, `previewPK`, `runPKImport` — member insert/skip/dry-run, display_name preference, color fallback, uuid alias, group create/reuse/warning, switch sorting, duration math, single/co-session text format, Front Log channel creation. Uses `vi.mock('../db/index')` with a sequenced mock DB. |
| `botEngine.test.ts` | `distillTone` (recency weighting, clamping, volatility calculation) and `matchBot` (pattern match, priority, tag boost +5, required/excluded tag logic, all six tone range filters, multi-sentence collection with tag dedup, chance/Math.random gating) |

### React component tests (`src/components/security/__tests__/`)

Uses React Testing Library. These cover **security trust invariants** — things that matter for user safety and data integrity.

| File | What it tests |
|---|---|
| `RecoveryCodeDisplay.test.tsx` | Code shown; Continue disabled until checkbox checked; calls `onAcknowledged` correctly |
| `PassphrasePrompt.test.tsx` | Unlock with passphrase; correct/wrong passphrase; DELETE confirmation flow (button disabled until user types `DELETE` exactly); recovery code mode; forgot passphrase cancel/reset |
| `PostRecoverySetup.test.tsx` | Passphrase mismatch; successful submit shows recovery code; `onComplete` called after acknowledge |
| `Security.test.tsx` | Unencrypted state UI; encrypted state UI; change passphrase requires entering current first; legacy upgrade path shown |
| `PassphraseStrength.test.tsx` | Hint shown when empty or score < 3; no hint for strong passphrase; correct label shown |

**Store isolation**: use `useAppStore.setState()` in `beforeEach` to reset encrypted/unencrypted state between tests.

**`invoke` mock pattern**:
```ts
// Default: resolves null (from the mock file)
// Per-test override:
mockInvoke
  .mockResolvedValueOnce(true)          // first call → vault_exists
  .mockResolvedValueOnce({ key: 'raw:abc', recovery_code: 'AABB0011-...' })  // second call
```

**Async effects**: components that call `vault_exists` in a `useEffect` need `await`-based assertions to let the effect settle:
```ts
// Wait for button to appear (also lets async effects complete)
await screen.findByRole('button', { name: /change passphrase/i })
// Or wrap synchronous assertion in waitFor:
await waitFor(() => expect(screen.getByText(/database is encrypted/i)).toBeInTheDocument())
```

### i18n tests (`src/i18n/i18n.test.ts`)

Runs for every non-EN locale file found in `src/i18n/`.

- **Hard fail**: stale keys — keys present in a translation but removed from `en.json`. These are bugs and can confuse translators.
- **Soft warn**: missing keys — logged to console but the test passes. Missing keys fall back to EN at runtime and are expected during active development.

### Manual i18n check script

```bash
node scripts/check-i18n.cjs           # all locales, shows % complete
node scripts/check-i18n.cjs es        # specific locale
node scripts/check-i18n.cjs --json    # machine-readable JSON output
```

Exits 1 if stale keys found, 0 otherwise.

## Rust tests (cargo test)

**31 tests in `src-tauri/src/lib.rs`.**

```bash
cd src-tauri && cargo test
# Run a specific test:
cd src-tauri && cargo test rewrap_invalidates
```

All tests are in the `#[cfg(test)] mod tests` block at the bottom of `lib.rs`. They test internal crypto functions directly — no Tauri runtime needed.

| Test group | Tests |
|---|---|
| `sidecar_path_*` (2) | `.keys` sidecar path derivation from DB path |
| `normalize_recovery_code_*` (3) | Strip dashes/spaces, uppercase normalization |
| `generate_recovery_code_*` (2) | Format (`XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX`), normalizes to `hex::encode_upper` |
| `to_sql_*` / `from_sql_*` (12) | SQL value serialization roundtrips |
| `derive_vault_key_*` (3) | Argon2id KDF: deterministic, salt-sensitive, password-sensitive |
| `vault_*` (5) | Passphrase roundtrip; wrong passphrase rejected; recovery code roundtrip; wrong recovery code rejected; unique ciphertext per encrypt call |
| `rewrap_invalidates_old_recovery_code` (1) | After `db_rewrap_passphrase`, old recovery code is rejected; new one works; master key unchanged |

Note: Argon2id tests are intentionally slow (KDF tuned for security). `cargo test` takes ~8s.

## What is NOT tested

- **ChatPanel** and most other React components — too many Tauri IPC and DB dependencies to mock meaningfully. RTL tests are focused on the security layer where trust invariants matter most.
- **`buildStructureSnapshot`** — reads 10+ tables for cold-sync; tested implicitly by running two-device sync manually (`npm run dev:test` + `npm run dev:test2`).
- **`syncNow` / `handleSyncRequest` orchestration** — high-level sync coordination in `sync.ts`; depends on Tauri `invoke` and real peer transport. Test manually.
- **Tauri commands end-to-end** — the Rust commands (`db_setup_encryption`, `db_open_passphrase`, etc.) require a real SQLCipher DB. Test manually with `npm run dev:test`.
- **`getBotConfig` / `listBotNames`** — depend on `import.meta.glob` loading real rule files; covered by `botEngine.test.ts` at the logic layer (`matchBot`, `distillTone`). The registry wiring is exercised by running the bot in the app.
- **SP importer `runSPImport`** — DB-bound orchestration, same pattern as `runPKImport`. The pure transform helpers (`spTsToSql`, `buildMemberDescription`, etc.) are fully tested.

## Manual testing cheat sheet

```js
// Show encryption nudge immediately (clear snooze/dismiss state)
localStorage.removeItem('dsj-nudge')

// Simulate snooze expired (nudge should show again)
localStorage.setItem('dsj-nudge', JSON.stringify({ count: 1, nextAt: Date.now() - 1 }))

// Simulate nudge dismissed permanently
localStorage.setItem('dsj-nudge', '"done"')

// Trigger pending recovery code overlay (as if app was restarted mid-flow)
localStorage.setItem('dsj-recovery-pending', 'AABB0011-CCDD2233-EEFF4455-66778899')

// Clear pending recovery code
localStorage.removeItem('dsj-recovery-pending')
```
