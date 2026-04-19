# Testing

DSJ has two test suites: TypeScript (Vitest + React Testing Library) and Rust (cargo test).

## Running tests

```bash
npm test               # all Vitest tests (~1.3s)
npm run test:watch     # watch mode

cd src-tauri && cargo test   # Rust unit tests (~8s, includes Argon2 KDF)
```

## TypeScript tests (Vitest)

**243 tests across 14 files.**

### Setup

- **Environment**: `happy-dom` (configured in `vitest.config.ts`)
- **Setup file**: `src/test-setup.ts` — imports `@testing-library/jest-dom`, provides in-memory `localStorage`
- **Tauri mocks** (`src/__mocks__/`):
  - `tauri-core.ts` — `invoke` is a `vi.fn().mockResolvedValue(null)`; `convertFileSrc` returns `asset://path`
  - `tauri-event.ts` — `listen` and `emit` are `vi.fn()`
  - `tauri-sql.ts` — SQL plugin stub
- All three are aliased in `vitest.config.ts` so imports of `@tauri-apps/api/core` etc. resolve to the mocks automatically.

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
- **DB queries** — tested implicitly by running the app against test/load DBs (`npm run dev:test`, `npm run seed:load`).
- **Tauri commands end-to-end** — the Rust commands (`db_setup_encryption`, `db_open_passphrase`, etc.) require a real SQLCipher DB. Test manually with `npm run dev:test`.

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
