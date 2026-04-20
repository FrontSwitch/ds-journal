---

kanban-plugin: basic

---

Local first Dissociative System Journal and Tracker. 
Peer-to-Peer sync. Sovereign Data Engine

## Panels/Settings
- [x] v0.2

## ## Roadtrip to shared data
- [x] v0.3
- [x] usable interface on iPhone (Capacitor iOS — simulator + physical device)

## ## Github MVP
- [x] v0.4
- [x] export
- [x] link in "about"
- [x] automatically add "someone" - avatar for not wanting to attribute and "no one". a more silent voice
- [x] credits
- [x] disclaimer - in readme and bottom of settings
- [x] localization
- [x] LICENSE file
- [x] credits system
- [x] double click to edit. empty it for "deleted"
- [x] front tracking
    - secondary alters. list.
    - blurry vs grounded scale
    - tags for why.
- [x] tag system
    - type # and then it tries to fill in for you. not forced.
    - if new, add
    - see list - click on one to get messages filtered by it

## ## Trackers
- [x] Ability to add different tracker records. |Date|separated|by|bars|finally|
- [x] Each field gets a type and optional flag.
    - Some may get a range (int, number)
    - Date
    - Text (short/long)
    - list[a|b|c]
    - Integer
    - Number
    - Boolean
    - Who=Avatar (or none)
- [x] Default Input is "now" for date.
    - text entry for others.
    - validated
    - maybe dropdowns for list
    - custom editors as needed for emotions, body sensation, ...
- [x] Editor to add new one, name, description, data set, set hidden
- [x] System builds a "Trackers" folder for each "visible" tracker.
- [x] User views the channel like regular chat except "records" are inserted.
- [x] Chat still happens.
- [x] field:
    - flag if hidden from report
    - default (int, boolean, text, ...)
- [x] report button
    - show data view that is more "table". Header. Data. Summary line.
    - I'd show this to my therapist not the channel with chat noise.
    - I'll start with saving screenshot - can you do that with a button?
    - Idealy write as PDF.
    - filter by 1 day, 7 days, 14 days, 1 month, year
    - may need to "condense for year"
    - option to hide "avatar" field
    - Results: show week, month, year, total
    - trends/frequency
    - sum fields for summary (pick in tracker field ... none, sum, average, min, max, count true, count false)
    - skip empty/null values

- [x] tracker
    - use color in channel list

## ## 0.5 More Features
- [x] SQLCipher
    - passphrase
- [x] delete/edit messages. delete/edit have timers.
- [x] debug window levels.
    - click "debug" -> "info" -> "warn" -> "error" -> debug.
    - db calls... maybe info.
    - never and messages/alters/user data logged
- [x] anonymizer for export.json
    - strip all text.
    - replace dates with incrementing value +1 sec
    - add to README. create import doc
- [x] don't require avatar for chat.
- [x] emojis using :
- [x] unit tests
    - started.
- [x] feature flags/config
- [x] threads
- [x] debug panel
    - db duration, call counts
    - logging
- [x] AvatarFields
    - more like TrackerFields. with type
    - and specifically int range. and filter can be Age=5
    - avatars can get custom ones too
- [x] Avatar filter behaviors
- [x] Verify db on mac don't get into iCloud or Time Machine
- [x] member notes
    - Notes scrolllist in avatar view:
    - shows index of notes (date, title, color)
    - sorted by favorite/last edit (most recent)
    - include a +note button
    - Notes have fixed (date created), who.
    - Editable color, title, markdown, favorite (bool)
    - Gets a last changed
    - can get deleted

## 0.7 Closer
- [x] Images/album. 
    - just links not in database

## 0.8 RC1
- [x] Trackers: Defaults for fields
- [x] MasterKey for database
    test flow
    reminders
    test using recovery key
    unit tests
    documentation for recovery

## 0.9 RC2
- [ ] syncing table
    x button
    x help
    x remove device
    disable automatic database backups for full/remote/cold

    
## 1.0  Used for a week
- [ ] bug fixes
- [ ] QOL changes
- [ ] import notes, customFields from SP
- [ ] user guide with screenshots
- [ ] import with easy way to find auth code for SP
- [ ] dsj web landing page
- [ ] packaged build
- [ ] windows version
- [ ] Wider coverage of unit tests

## 1.1  iOS

- [ ] v1.5 iPhone/iPad and sync - encrypted end to end
    - websocket? device discovery. mac as primary
    - QR code to exchange password first time
   - Still planned (Phase 3+): BLE wake, local notifications, mDNS   - auto-sync timer, conflict resolution UI.
  - remove old event_log data

## Performance
- [ ] scrolling listbox with 100s of messages(performance)
- [ ] load test. 100, 1000, 10k, 100k messages.
- [ ] load test. tags. 100, 1000

## ## Future
- [ ] v1.2 Reminder popups.
    - List in settings.
    - Settings page
    - List with +Reminder button to add
    - Select to edit/delete
    - Title: text
    - Repeat - frequency: after event: startup, different alter sends message. delay: minutes
    - Repeat - start date. daily: every N days. weekly: every N weeks. with horizontal Sun. Mon, Tue. Wed, ... checkboxes
    - start time: <>. endtime: <>.
    - show once if program is open between start/end
    - "fire once" execution flag. stores "last shown"
    - Actions: new tracker (channel) or create tracker report, auto front track (current alter), switch channel, ...
    - missed action - if missed, do X
    - duplicate action - boolean. do once for each missed.
    - Popup: Text, reason (event, daily, ...).
    - Buttons: Action: does the thing, Sleep: show in 5 minutes (config), Cancel: do nothing
    - Queue if more than one (or show N)
- [ ] v1.3
    - embedded folders
    - embedded groups?

- [ ] Better iPhone.
    backups
    layout improvements

- [ ] backup recovery
    make sure the sensible thing happens
    check if password/restore code changes/removed
        can user enter the old one for a backup
    
- run phase signal tracker
    large buttons for during a run
        steady, hr drift, sidetracked, heavy legs, laboring, monster mode
    it just timestamps the when. and gives a plot (time is x, mode is y)
    because remembering the body tracking on the run is hard later

## ## Backlog
- [ ] notes: markdown
- [ ] notes: searching
- [ ] notes: export from scratch - add title and edit color/edit text.
- [ ] message cache system:
    - when performance shows it is needed
    - store messages index of id. timeout old messages.
    - max to keep. duration before deleting oldest N. hard limit
- [ ] shard the database by month
        longevity and redundency
- [ ] polls
- [ ] first time user experience
- [ ] help page search
- [ ] first time setup wizard to walk thru avatars/channels

