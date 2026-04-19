# DSJ Help

DSJ is a private, local journal for dissociative systems. Everything stays on your device — no account, no cloud, no telemetry.

---

## Avatars & Groups

Avatars represent members of your system. Each message is posted as an avatar, or anonymously. Manage avatars in **Settings → Edit Avatars**.

Groups let you organize avatars into subsystems — a group called Front can be pinned to the top of the avatar panel. Manage groups in **Settings → Edit Groups**.

Hidden avatars won't appear in the avatar panel but their messages remain in the journal.

## Avatar Fields

Avatar Fields let you define custom attributes for each avatar — things like Age, Role, Pronouns, or anything else meaningful to your system. Fields can be text, number, a range, boolean, or a list.

Fields show up in the Avatar detail view (double-click an avatar in the panel) and can be used to filter the visible avatar list.

Manage fields in **Settings → Avatar Fields**.

## Avatar Filter & Autocomplete

Type in the filter box above the avatar panel to narrow by name or initials.

Type `@name` in the message box to mention an avatar. The autocomplete dropdown appears as you type — use ↑↓ to navigate, Space or Enter to complete.

In the **All Messages** view, clicking an avatar in the panel filters to their messages. Click again to clear.

## Channels & Folders

Channels are spaces for different topics or parts of your life. Folders group related channels together. Click a folder name to collapse or expand it.

Right-click any channel or folder to rename, move, recolor, or delete it.

Each channel can have its own **view mode** (normal, compact, log) — set it via right-click or in **Settings → Edit Channels**.

## Chat

Select a channel in the sidebar to open it. Messages appear newest at the bottom.

**Double-click** a message to edit it. Messages are never deleted — this is intentional and a deliberate safety choice.

Type `#tag` to label a message. Autocomplete appears after `#`. Use the search bar to filter by tag later.

Use `@name` to mention an avatar. Use `/` to see available slash commands (roll dice, tarot, front log shortcuts, and more).

Click the **reply** button on a message (or right-click → Reply) to start a thread. Threads indent under the parent message up to the configured depth.

Use the **date arrows** (← →) or the date picker in the toolbar to jump to a specific day's entries.

## Trackers

Trackers are structured forms for logging things over time — mood, sleep, medications, who is fronting, or anything you define.

Each tracker gets its own channel. Open the channel and click **+ Record** to submit an entry. You'll see a form with the fields you configured.

The **Report** button (chart icon in the channel toolbar) shows a summary view: averages, totals, and a timeline depending on the field types.

Create and customize trackers in **Settings → Edit Trackers**.

## Front Tracker

The Front Tracker is a special tracker for logging who is fronting. It appears in the Trackers folder if you haven't moved it.

Use the avatar panel's **Front** section (if enabled) to quickly set or clear front. Each change is recorded as a message in the Front Log channel.

The tracker report shows a fronting timeline and per-avatar statistics.

## Search

Click the search icon in the chat toolbar to search messages. Search uses prefix matching — `vent` finds `venting` but not `event`.

Combine search with the date filter or avatar filter to narrow results.

In **All Messages**, you can search across every channel at once.

## Avatar Notes

Each avatar has a private notes list — text associated with that avatar, visible in their detail view (double-click in the panel).

Double-click an existing note to edit it. Star a note to keep it pinned at the top.

## Slash Commands

Type `/` in the message box to see all available commands. A few highlights:

- `/roll` — roll dice (e.g. `/roll 2d6`)
- `/tarot` — draw a tarot card
- `/lottery` — pick lottery numbers
- `/front` — log fronting directly from the message box

## Sync

Sync is optional, fully local, and device-to-device over your home network. No cloud or account required.

**To pair two devices:**
1. On one device, open **Settings → Sync** and note the IP address and port.
2. On the other device, open **Settings → Sync**, enter the first device's IP:port and the peer code shown there.
3. Once paired, tap the sync button (⇅) in the sidebar to sync.

**Device types** control what gets synced:
- **Primary / Full** — receive all data
- **Remote** — syncs a recent time window (configurable)
- **Cold** — structure only (avatars, channels, trackers) — useful for archiving or a new install

Each change is recorded in an event log and synced incrementally — not the whole database each time. Set a fixed port in Sync settings so peer addresses stay stable between restarts.

## Backup

DSJ stores all data in a single SQLite file on your device. Set up automatic daily and weekly backups in **Settings → Backup & Export**.

Run a manual backup any time with **Backup Now**. Click **Open Backups Folder** to find the files on disk.

**To restore from a backup:** quit DSJ, replace `dsj.db` with the backup file, then relaunch. If you changed your passphrase after the backup was made, you will need the passphrase that was active at that time.

## Import & Export

Export all your data as a JSON file from **Settings → Backup & Export**. Your data, your file.

Import from **Simply Plural** or **PluralKit** via **Settings → Import**. The importer maps members → avatars, groups → avatar groups, channels → channels, and messages where available.

## App Settings

**Settings → App Settings** has options organized by settings level — basic, standard, and advanced. Raise the settings level to unlock more options (view modes, thread depth, tag limits, sync policies, and more).

## Security & Encryption

Encryption is opt-in. Enable it in **Settings → Security**. DSJ uses SQLCipher (AES-256) with a passphrase you choose.

When you enable encryption, a **recovery code** is generated. Write it down and store it somewhere safe — it is the only way to access your data if you forget your passphrase.

Optionally cache your passphrase in the macOS Keychain so you're not prompted on every launch.

## Philosophy & Privacy

Local data. Your data. DSJ is designed so your journal never leaves your device. No account, no cloud, no telemetry — ever.

Built by a dissociative system, for dissociative systems. We understand the unique needs of journaling in a system and built the features we wanted to exist.

DSJ is open source. Contributions and feedback are welcome. See [github.com/FrontSwitch/dsj](https://github.com/FrontSwitch/dsj).

## Roadmap

Early access! The short-term focus is quality-of-life improvements, polish, and bug fixes based on real use.

Planned for later: improved imports, mobile improvements, and sync enhancements.

Have feedback? Open an issue on GitHub or reach out through the community.
