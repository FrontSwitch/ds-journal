# Capacitor Mobile Setup

## Strategy

- **Desktop** (Mac, Windows, Linux): keep Tauri as-is — it works well
- **Mobile** (iOS, Android): Capacitor — same React/CSS codebase, mature WebView bridge, first-class SQLCipher support

The existing React components, CSS, stores, and SQL queries are all reused. A thin platform abstraction layer routes native API calls to the right implementation (Tauri vs Capacitor).

SQLCipher (encrypted at rest) is a key feature, wired up on both platforms.

---

## What Needs Abstracting

Seven Tauri-specific API callsites, all in a few files:

| API | Current | Files |
|-----|---------|-------|
| SQLite DB | `@tauri-apps/plugin-sql` | `src/db/index.ts` |
| File system | `@tauri-apps/plugin-fs` | `src/db/backup.ts` |
| App data dir | `@tauri-apps/api/path` | `src/db/backup.ts` |
| Save dialog | `@tauri-apps/plugin-dialog` | `src/db/backup.ts` |
| Open URL | `@tauri-apps/plugin-opener` | `About.tsx`, `Settings.tsx` |
| File → URL | `convertFileSrc()` | `src/types/index.ts` → `assetUrl()` |
| Window minimize | `@tauri-apps/api/window` | `src/App.tsx` (idle timer) |

---

## Step 1 — Install Capacitor & Plugins ✓

```bash
npm install @capacitor/core @capacitor/cli
npm install @capacitor/ios
npm install @capacitor-community/sqlite
npm install @capacitor/filesystem
npm install @capacitor/browser
npx cap init "DissociativeSystemJournal" "io.github.frontswitch.dsj" --web-dir dist
npx cap add ios
```

`capacitor.config.ts` at project root:
```typescript
import { CapacitorConfig } from '@capacitor/cli'
const config: CapacitorConfig = {
  appId: 'io.github.frontswitch.dsj',
  appName: 'DSJ',
  webDir: 'dist',
  plugins: {
    CapacitorSQLite: { iosDatabaseLocation: 'Library/LocalDatabase' }
  }
}
export default config
```

---

## Step 2 — Platform Abstraction Layer

Create `src/native/` with four files:

### `src/native/platform.ts`
```typescript
export const isTauri = () => !!window.__TAURI_INTERNALS__
export const isCapacitor = () => !!(window as any).Capacitor?.isNativePlatform?.()
```

### `src/native/db.ts`
```typescript
export interface NativeDb {
  select<T>(sql: string, params: unknown[]): Promise<T[]>
  execute(sql: string, params: unknown[]): Promise<void>
}
export async function loadNativeDb(name: string, secret?: string): Promise<NativeDb>
```
- Tauri impl: `Database.load('sqlite:...')` from `@tauri-apps/plugin-sql`
- Capacitor impl: `SQLiteConnection` from `@capacitor-community/sqlite`, opened with `secret` for SQLCipher

### `src/native/fs.ts`
```typescript
export interface NativeFs {
  getDataDir(): Promise<string>
  mkdir(path: string): Promise<void>
  readDir(path: string): Promise<string[]>
  remove(path: string): Promise<void>
  writeText(path: string, data: string): Promise<void>
  saveDialog(defaultName: string): Promise<string | null>
}
```
- Tauri impl: `appDataDir()`, `mkdir()`, `readDir()`, `remove()`, `writeTextFile()`, `save()` from existing plugins
- Capacitor impl: `Filesystem` from `@capacitor/filesystem` + `Directory.Data`; save dialog → share sheet on mobile

### `src/native/urls.ts`
```typescript
export function convertAssetUrl(filePath: string): string
export async function openUrl(url: string): Promise<void>
```
- Tauri impl: `convertFileSrc()` from `@tauri-apps/api/core`; `openUrl()` from opener
- Capacitor impl: `Capacitor.convertFileSrc()`; `Browser.open()` from `@capacitor/browser`

---

## Step 3 — Wire Abstractions into Existing Code

Four files change, everything else is untouched:

- **`src/db/index.ts`** — replace `Database.load()` with `loadNativeDb()` from `src/native/db.ts`
- **`src/db/backup.ts`** — replace all `@tauri-apps/plugin-fs`, `@tauri-apps/api/path`, `@tauri-apps/plugin-dialog` imports with `getNativeFs()` calls
- **`src/types/index.ts`** — replace `convertFileSrc()` with `convertAssetUrl()` from `src/native/urls.ts`
- **`src/components/about/About.tsx`** and **`Settings.tsx`** — replace `openUrl()` imports
- **`src/App.tsx`** — wrap `getCurrentWindow().minimize()` in `isTauri()` guard

---

## Step 4 — SQLCipher

**Capacitor (mobile):** `@capacitor-community/sqlite` has built-in SQLCipher. Pass `secret` to `loadNativeDb()`. Key management: derive from device keychain on first launch (store in `@capacitor/preferences`), or prompt for passphrase.

**Tauri (desktop):** Deferred — see CLAUDE.md "What's not built yet". Options when ready:
1. Patch `Cargo.toml` to use `rusqlite` with `bundled-sqlcipher` feature
2. Use community fork `tauri-plugin-sqlite` with SQLCipher support

---

## Step 5 — Build Scripts

Add to `package.json`:
```json
"cap:sync": "npm run build && npx cap sync",
"cap:ios": "npm run cap:sync && npx cap open ios",
"cap:ios:run": "npm run cap:sync && npx cap run ios"
```

Remove: `ios`, `ios:device`, `ios:seed` (Tauri iOS scripts, superseded).

Mobile build flow: `npm run cap:ios` → builds web assets → syncs to native project → opens Xcode.

---

## Step 6 — CocoaPods for SQLite ✓

`@capacitor-community/sqlite` has no SPM support (it depends on SQLCipher and ZIPFoundation
C libraries). All iOS plugins are therefore installed via CocoaPods.

**Setup (already done):**
- `ios/App/Podfile` — all 5 plugins via local pod paths
- `ios/debug.xcconfig` — includes `Pods-App.debug.xcconfig`
- `ios/App/CapApp-SPM/Package.swift` — emptied (no dependencies); Xcode still references
  the package by name, so we keep the file to avoid a project.pbxproj edit
- `scripts/cap-fix-spm.cjs` — post-sync script that re-empties Package.swift (since
  `cap sync` regenerates it with SPM deps every time)

**`npm run cap:sync` flow:**
1. `npm run build` — Vite build to `dist/`
2. `npx cap sync ios` — copies web assets, regenerates Package.swift (adds SPM deps)
3. `node scripts/cap-fix-spm.cjs` — empties Package.swift again
4. `cd ios/App && pod install` — installs/updates pods

**Pods installed:** Capacitor 8.3.0, CapacitorBrowser, CapacitorFilesystem,
CapacitorCommunitySqlite, CapacitorCordova, IONFilesystemLib, SQLCipher 4.10.0, ZIPFoundation

**Open Xcode:** always use `App.xcworkspace` (not `.xcodeproj`) after pod install.

---

## Files to Modify

| File | Change |
|------|--------|
| `src/native/platform.ts` | new |
| `src/native/db.ts` | new |
| `src/native/fs.ts` | new |
| `src/native/urls.ts` | new |
| `src/db/index.ts` | swap DB load call |
| `src/db/backup.ts` | swap fs/path/dialog calls |
| `src/types/index.ts` | swap convertFileSrc |
| `src/components/about/About.tsx` | swap openUrl |
| `src/components/settings/Settings.tsx` | swap openUrl |
| `src/App.tsx` | guard minimize with isTauri() |
| `package.json` | add cap:* scripts, remove ios scripts |
| `capacitor.config.ts` | new |

## Files NOT Modified
All components, hooks, stores, CSS, SQL queries — zero changes.

---

## Verification Checklist

- [ ] `npm run tauri dev` — desktop still works, no regressions
- [ ] `npm run cap:ios:run` — iOS simulator boots, app loads
- [ ] DB loads on iOS — messages, avatars, channels visible
- [ ] Backup works on desktop; gracefully degraded on mobile
- [ ] External links open in browser on both platforms
- [ ] Avatar images display on both platforms
