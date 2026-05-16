# Refactor Backlog


## Bugs

iOS:
  sync did not put actors into groups
general:
  ?
  

## Scaling bugs
❯ anywhere you would anticipate 100+ avatars causing issues?                                                      
                                                             
⏺ A few spots stand out:                                                                                          
                                         
  getInitials(name, allNames) — called per-avatar in rendered lists, passing the full avatar array each time.     
  That's O(n²) across a render of 100+ avatars. Not a crash, but measurable jank on every re-render.
                                                                                                                  
  image_data TEXT (base64 PNG on avatars table) — useAvatars loads all avatars in one query, pulling every base64 
  image into JS memory at once. 100 avatars with images could easily be 50–100 MB held in the Zustand store.
                                                                                                                  
  Avatar panel + EditAvatars — both render the full list with no virtualization. At 100+, DOM pressure becomes    
  noticeable, especially with images.
                                                                                                                  
  Mention autocomplete — the @ dropdown shows all avatars. At 100+ it's still functional but the UX degrades      
  (you're scrolling a long list before typing filters it). Not a bug, just friction.
                                                                                                                  
  useAvatars loading avatar_field_values — if you also have many avatar fields, the cross-join result could be    
  large. One row per (avatar × field) means 100 avatars × 10 fields = 1000 rows fetched on every channel change.
                                                                                                                  
  Sync payloads — first sync of a 100+-avatar system sends all avatar payloads at once. Probably fine, but worth  
  knowing it's unbounded.
                                                                                                                  
  The worst practical one is the image_data memory issue — it would be worth lazy-loading images (fetch on demand 
  rather than hydrating image_data into every avatar record). The getInitials O(n²) is worth memoizing if avatar
  lists get that large.                                                                                           
                                                            
❯ I'd like to fix these. 25 is expected. 50 is big but not. 100 is likely outlier but let's setup the base        
  seed:test to do 100. I want to be known as scale friendly. let's work out 100. then consider 500.               
  Number for issues might help assuming that for comments.                                                        
  1 getInitials() - would it be useful to have a dictionary or other faster lookup. x2 use cases. anywhere else   
  we're walking avatars?                                                                                          
  2 image_data. - let's make that data smarter. a text page with 500 images fails.                                
  3 avatar panel - I don't want paging. help explain alternates.                                                  
  3b EditAvatars - paging here is likely ok.                                                                      
  4 @ autocomplete - for no first character filter... let's limit to 10 (or 20).                                  
      what's smarter way? inside a channel - maybe the recent list. maybe we need a recent list shared.           
      maybe N works.                                                                                              
  4b same issue with #<tag>. limit of 20 is fine.                                                                 
  5 avatar_field_values - where do they get used? feels like "info panel". I need to add some to test with.       
    might be a flag for "fields loaded".                                                                          
  6 sync payload - break that apart. pick a size 1-20 to send at once. 

## Peer to peer sync
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