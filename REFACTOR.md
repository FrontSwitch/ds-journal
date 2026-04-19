# Refactor Backlog

Peer to peer sync.
ordering of events is per device, not global.

schema:
- entity_id into everything
- event log.
    event_id - uuid
    device_id - uuid
    device_counter - monotomic per device. for ordering
    entity_type - table name
    entity_id
    operation - create, update, delete
    payload - optional... say avatar, which fields
    timestamp - milliseconds!
- sync table : not synced
    device_id, 
    last_device_counter, 
    last_sync_timestamp, 
    peer_address - ip/port
    peer_code -

- localStorage : my device_id

sync UI: 
  base shows QR code
  client scans it to get IP/port/id
  client confirms code
  base confirms code sent from client
  client can remember server and try again
  then "sync"

sync:
  ideally bluetooth sync
  encrypted
  client sends local changelist
  server sends client its changelist
  resolve! 

resolve:
1. add each change to the event table. with rightful device as own
2. last write wins (event_timestamp) as first option. 99%
    ideally some time drift correction at time of sync.
    and user threshold of how close (minutes). 
3. CRDT option if two devices changed entity/field. 
    show conflicts. UI to pick A or B/original?
    write to "unresolved sync event" table
      entity_id, field?
      device_id_a, event_id_a
      device_id_b, event_id_b
      detected_at - timestamp
      status - open, pickedA, pickedB, original, LWW
    avatar is most likely challenge
    changes to things like "notes" simultaneously - v1.5 we do a text merge.

assumes mostly inserts, few edits.

Tokens - next sync should be more "automatic". Less connect.
  settings for "sync frequency".
  button for Sync now.

Log/channel
  sync channel shows history. Device X connected sent X records, received Y records, 2 conflicts.
Settings
  block device - make it get a new token
  show this device - device_counter
  show devices/last sync time, last sync device_counter from me



When to compact event_log:

⚡ One-line version
Event log exists only to move changes between devices; once all devices have applied them, it can be discarded.

1. Single device
no event_log needed
db tables are source of truth
✔ done
2. Second device appears
generate event_log from database once
use it only for initial sync bootstrap or merge
✔ after that, it becomes normal sync
3. Two devices (normal case)
keep event_log
prune after both devices have synced
✔ lightweight rolling buffer
maybe flag if count is >N and suggest? ready to remove device B?
4. 3+ devices / possible long gaps between syncs
event_log can grow large
but only until “all known devices have caught up”
✔ then safe to compact/prune

* when all known devices have caught up.
  OR... flag a device as "periodic". alternate sync...

🧠 Key rule (this solves everything)
Keep events only until you are confident every device has received them.
Not time-based. Not size-based. Sync-completion-based.

💡 Practical outcome
event_log is temporary transport state
tables are permanent truth
sync determines when history is no longer needed

Cold start:
* verify state. counts of values in tables (minus messages, fronts, tracker_records)
* don't do full create event_log for cold start
  process in place. or at least do messages, trackers, fronts backwards in time

sync request becomes:
  "mode": full, cold, incremental

{
  "device_id": "A",
  "known_devices": {
    "B": 1842,
    "C": 991
  },
  "mode": "full | cold | incremental",
  "capabilities": {
    "accept_snapshot": true,
    "accept_event_window": true
  },
  "preferences": {
    "message_history_days": 7,
    "tracker_history_days": 30
  }
}  

Settings:
sync: 
  device mode:
     - primary: keep full database
     - secondary: keep N days of messages (weeks, months), trackers, fronts
     - periodic: do not wait for sync
  remove device
  
  keep event_log for N days
  keep event_log messages for N days
  keep event_log trackers for N days
  keep event_log fronts for N days
  send last N days of messages on device cold start
  send last N days of trackers on device cold start
  send last N days of fronts on device cold start



  What sync does:
  - Creates/updates/deletes flow from one DB to the other via the event log
  - LWW conflict detection: if both sides edited the same entity since last sync, the older edit loses and a
  sync_conflicts row is created
  - Received events are stored in the event log to prevent double-apply on next sync

  Still planned (Phase 3+): BLE wake, local notifications, mDNS auto-discovery, first-sync name-match merge,
  auto-sync timer, conflict resolution UI.