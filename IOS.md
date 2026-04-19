# iOS Build Notes

## Setup summary

Capacitor 8 + CocoaPods. All plugins via CocoaPods (not SPM) because
`@capacitor-community/sqlite` has no SPM support.

**Development team:** `8543U8DW9J` (set in `project.pbxproj` Debug + Release)

---

## Simulator

**Target:** iPhone 16, iOS 18.1
**UDID:** `C7DE5A02-A4BD-4F0D-B51F-8661BB546820`

```bash
npm run cap:ios:run     # build + install + launch on simulator
npm run cap:ios         # open App.xcworkspace in Xcode
```

Always open `ios/App/App.xcworkspace` — not `.xcodeproj`.

---

## Physical device

1. `npm run cap:ios` → opens Xcode
2. Plug in device, select it in the scheme picker
3. Set scheme to **Release** (Product → Scheme → Edit Scheme → Build Configuration)
4. Set Launch to **"Wait for the executable to be launched"** (prevents LLDB attach delay)
5. ▶ — installs the app; launch manually from the home screen

Xcode signs automatically (team `8543U8DW9J`). Launching from the home screen
gives real-world performance — LLDB attach adds several seconds to startup.

---

## Seeding test data

Use the `/seed` slash command in-app:

```
/seed          # 200 messages (quick smoke test)
/seed 2000     # 2000 messages
```

Creates: 10 avatars (Alex, Jamie, Sam, Sentinel, Ward, Pip, Sunny, Dot, Echo, River)
across 3 groups + 10 channels in 3 folders, realistic timestamps.

Idempotent — running `/seed` again adds more messages but reuses existing avatars
and channels (matched by name).

> 50k insert limit. Each message is an IPC call — 200–2000 is practical on device.

---

## Debug panel

Use the `/debug` slash command in-app to open the debug panel on device.
Shows DB query timings (avg/min/max over last 60s).

Typical device query times: ~9ms avg. Black screen on launch = LLDB attach delay,
not a performance issue — always launch from home screen for accurate timings.

---

## Build pipeline

`npm run cap:ios:run` runs:

1. `npm run build` — Vite → `dist/`
2. `npx cap sync ios` — copies web assets, regenerates `Package.swift` (re-adds SPM deps)
3. `node scripts/cap-fix-spm.cjs` — empties `Package.swift` + `Package.resolved` (prevents duplicate-framework conflicts)
4. `cd ios/App && pod install` — installs/updates CocoaPods
5. `node scripts/cap-build-run.cjs` — `xcodebuild -workspace`, `xcrun simctl install` + `launch`

For device builds, `npm run cap:ios` runs steps 1–4 then opens Xcode.

---

## CocoaPods

Podfile at `ios/App/Podfile`. Pods installed:

| Pod | Version |
|-----|---------|
| Capacitor | 8.3.0 |
| CapacitorCordova | 8.3.0 |
| CapacitorBrowser | 8.0.3 |
| CapacitorFilesystem | 8.1.2 |
| CapacitorCommunitySqlite | 8.0.1 |
| IONFilesystemLib | 1.1.2 |
| SQLCipher | 4.10.0 |
| ZIPFoundation | 0.9.20 |

After any `pod install`, `ios/App/App.xcworkspace` is the file to open.

---

## Why not `npx cap run ios` / `npx cap open ios`

- `cap run` builds with `-project App.xcodeproj` — CocoaPods requires `-workspace`
- `cap open` calls `open` on the workspace file — opens VS Code if that's your default

Both are bypassed by the scripts above.

---

## SPM conflict prevention

`cap sync` regenerates `ios/App/CapApp-SPM/Package.swift` every run, re-adding
Capacitor/Browser/Filesystem as SPM deps. Combined with CocoaPods, this causes
"Multiple commands produce Capacitor.framework" build errors.

`scripts/cap-fix-spm.cjs` runs after every sync and:
- Empties `Package.swift` (no dependencies)
- Clears `Package.resolved` (no cached pins)

The `CapApp-SPM` package reference was also removed from `project.pbxproj` directly.

---

## Database location + iCloud

DB is stored at `Library/LocalDatabase/dsjSQLite.db` (set via `iosDatabaseLocation`
in `capacitor.config.ts`). The plugin explicitly sets `NSURLIsExcludedFromBackupKey = true`
on this directory — the database is **never uploaded to iCloud**. Consistent with the
app's no-cloud guarantee.

---

## SQLCipher

Installed and linked via CocoaPods. **Not yet wired up** — DB is currently unencrypted
on mobile. Key management (device keychain) is a future step.

---

## Backup

In-app backup (VACUUM INTO) is disabled on Capacitor — `checkAutoBackup()` is a
no-op on mobile. The DB is intentionally excluded from iCloud. Manual backup via
the Settings → Backup panel is a future mobile task (needs Filesystem-based copy
instead of VACUUM INTO).
