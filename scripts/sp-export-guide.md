# Simply Plural Export Format — DSJ Import Guide

The SP export is a single JSON object where each key is a MongoDB collection name and the value is an array of documents. All timestamps are **epoch milliseconds**. All IDs are MongoDB ObjectId strings.

---

## Collections and DSJ Mapping

### ✅ maps directly

| SP collection | DSJ target | Notes |
|---|---|---|
| `members` | `avatars` | name, color, pronouns, desc, avatarUrl |
| `groups` | `avatar_groups` + `avatar_group_members` | name, color, desc; `members[]` links to member IDs |
| `chatCategory` | `folders` | name, desc |
| `chatChannel` | `channels` | name, desc; `category` links to chatCategory |
| `chatMessage` | `messages` | message, writer (avatar), channel, timestamp |

### ⚠️ partial / lossy

| SP collection | DSJ approach | Loss |
|---|---|---|
| `frontHistory` | Front Log tracker records | endTime lost (DSJ records are point-in-time, not ranges) |
| `notes` | messages in a "Notes" channel | title lost (no message titles in DSJ); member association lost |
| `boardMessage` | messages in a "Board" channel | recipient/read state lost |
| `customFront` | avatars (tagged as custom front) | separate-from-member concept doesn't exist in DSJ |

### ❌ no DSJ equivalent (skip or future feature)

| SP collection | Reason |
|---|---|
| `polls` | No poll mechanic in DSJ |
| `comments` | No inline annotations |
| `customField` | SP profile fields ≠ DSJ tracker fields |
| `analytics` | Derived data, can be recomputed |
| `automatedTimer` | No front-change trigger system |
| `repeatedReminder` | No reminders |
| `friend` | DSJ is local-only, no social graph |
| `buckets` | No privacy tiers |
| `filters` | No saved member filters |
| `events` | Internal SP events |
| `storage` | Avatar images referenced by URL — download separately |
| `token` | API tokens, irrelevant |
| `user` | SP user profile; username/desc could seed a "system" avatar or be skipped |

---

## Member schema

```json
{
  "_id": "abc123",
  "uid": "user-uid",
  "name": "Ren",
  "desc": "The curious one.",
  "pronouns": "they/them",
  "color": "a8d8ea",       // hex, with or without #, may have alpha: rrggbbaa
  "avatarUrl": "https://...",
  "avatarUuid": "uuid-string",
  "pkId": "abcde",         // PluralKit id, can ignore
  "private": false,
  "preventTrusted": false,
  "info": {                // arbitrary key-value, user-defined fields
    "age": "mid-20s",
    "role": "Researcher"
  },
  "lastOperationTime": 1711234567890
}
```

**DSJ mapping:**
- `name` → avatar.name
- `desc` → avatar.description
- `pronouns` → avatar.pronouns
- `color` → avatar.color (normalize to #rrggbb — strip alpha, add #)
- `avatarUrl` → avatar.image_path (download and store locally, or skip)
- `private` / `preventTrusted` → avatar.hidden (if private=true, set hidden=1)
- `info` → append key:value pairs to description, or ignore

---

## Group schema

```json
{
  "_id": "grp1",
  "uid": "user-uid",
  "name": "Inner Kids",
  "desc": "The younger ones.",
  "color": "f9c74f",
  "emoji": "🌟",
  "members": ["abc123", "def456"],   // array of member _ids
  "parent": null,                    // parent group _id (nested groups — DSJ has no nesting)
  "private": false,
  "lastOperationTime": 1711234567890
}
```

**DSJ mapping:**
- `name` → avatar_group.name
- `desc` → avatar_group.description
- `color` → avatar_group.color
- `members` → avatar_group_members join table (after member IDs are resolved to DSJ avatar IDs)
- `parent` → ignore (DSJ groups are flat)

---

## chatCategory schema

```json
{
  "_id": "cat1",
  "uid": "user-uid",
  "name": "Daily Life",
  "desc": "Everyday channels",
  "lastOperationTime": 1711234567890
}
```

**DSJ mapping:** → folder (name, description)

---

## chatChannel schema

```json
{
  "_id": "ch1",
  "uid": "user-uid",
  "name": "general",
  "desc": "Anything goes",
  "category": "cat1",    // chatCategory _id
  "lastOperationTime": 1711234567890
}
```

**DSJ mapping:** → channel (name, description, folder_id resolved from category)

---

## chatMessage schema

```json
{
  "_id": "msg1",
  "uid": "user-uid",
  "message": "Hello from the front!",
  "channel": "ch1",       // chatChannel _id
  "writer": "abc123",     // member _id (null = system/anonymous)
  "timestamp": 1711234567890,
  "reply": null,          // message _id being replied to (DSJ supports parent_msg_id)
  "iv": "...",            // encryption IV — not needed, export is already decrypted
  "lastOperationTime": 1711234567890
}
```

**DSJ mapping:**
- `message` → message.text
- `channel` → message.channel_id (resolved)
- `writer` → message.avatar_id (resolved; null → null)
- `timestamp` → message.created_at (convert ms → "YYYY-MM-DD HH:MM:SS" UTC)
- `reply` → message.parent_msg_id (if reply message was also imported)

---

## frontHistory schema

```json
{
  "_id": "fh1",
  "uid": "user-uid",
  "startTime": 1711200000000,
  "endTime": 1711234567890,     // null if currently active
  "member": "abc123",           // member _id (null if customFront)
  "customFront": null,          // customFront _id (null if member)
  "custom": false,
  "live": false,
  "customStatus": "feeling tired",
  "lastOperationTime": 1711234567890
}
```

**DSJ mapping (lossy):** → Front Log tracker record at `startTime`
- `member` or `customFront` → "Who" field
- `customStatus` → a Notes text field
- `endTime` → no equivalent (could compute duration and store as text)

---

## notes schema

```json
{
  "_id": "note1",
  "uid": "user-uid",
  "title": "Therapy session",
  "note": "We talked about...",
  "color": "f4a261",
  "date": 1711234567890,
  "member": "abc123",    // associated member (optional)
  "supportDescMarkdown": true,
  "lastOperationTime": 1711234567890
}
```

**DSJ mapping (lossy):** → message in a "Notes" channel
- `title` + `note` → combined as text: "**{title}**\n{note}"
- `date` → created_at
- `member` → avatar_id
- `color` → lost

---

## customFront schema

```json
{
  "_id": "cf1",
  "uid": "user-uid",
  "name": "Blended",
  "desc": "When multiple are out at once.",
  "color": "b5838d",
  "avatarUrl": null,
  "private": false,
  "lastOperationTime": 1711234567890
}
```

**DSJ mapping:** → avatar (treated like a member, maybe tagged `[custom front]` in description)

---

## boardMessage schema

```json
{
  "_id": "bm1",
  "uid": "user-uid",
  "title": "Reminder",
  "message": "Don't forget therapy tomorrow.",
  "writer": "abc123",
  "recipient": "def456",
  "timestamp": 1711234567890,
  "read": true,
  "lastOperationTime": 1711234567890
}
```

**DSJ mapping (lossy):** → message in a "Board" channel
- `title` + `message` → "**{title}**\n{message}"
- `writer` → avatar_id
- `recipient` / `read` → lost

---

## Color normalization

SP colors come in several formats — normalize all to `#rrggbb`:

```
"a8d8ea"     →  "#a8d8ea"   (no prefix, 6 chars)
"#a8d8ea"    →  "#a8d8ea"   (already correct)
"a8d8eaff"   →  "#a8d8ea"   (8 chars with alpha — strip last 2)
"#a8d8eaff"  →  "#a8d8ea"   (9 chars with # and alpha)
""           →  null        (empty = no color)
```

---

## Import decisions needed per run

Before importing, the user needs to decide:
1. **Avatar image download**: download avatarUrl files locally, or skip image_path
2. **Front history**: import as Front Log tracker records, or skip
3. **Notes**: import as a "Notes" channel, or skip
4. **Board messages**: import as a "Board" channel, or skip
5. **customFronts**: import as avatars, or skip
6. **Duplicate protection**: check for existing channel/avatar names before creating

---

## Timestamp conversion

All SP timestamps are epoch milliseconds. Convert to DSJ's SQLite datetime format:

```js
function spTsToSql(ms) {
  return new Date(ms).toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '')
}
// 1711234567890 → "2024-03-23 20:16:07"
```
