# Recovering Your Data Without the App

This guide explains how to access your DSJ data using only open, standard tools — no app required.

You might need this if:
- The app is no longer available or maintained
- You want to verify you can always access your own data
- You need to migrate to another tool and want a custom exporter

---

## Overview

When encryption is enabled, DSJ uses a **wrapped master key** design:

1. A random 256-bit **master key** is generated and used to encrypt the SQLite database (via SQLCipher).
2. The master key is never stored directly. Instead, it is stored in two encrypted "vaults":
   - **Vault A** — master key encrypted with your passphrase
   - **Vault B** — master key encrypted with your recovery code
3. Both vaults live in `dsj.keys` alongside `dsj.db`.

To open the database you need: the `.db` file + the `.keys` file + either your passphrase or recovery code.

---

## File Locations (macOS)

```
~/Library/Application Support/com.frontswitchstudio.dsj/dsj.db    ← encrypted database
~/Library/Application Support/com.frontswitchstudio.dsj/dsj.keys  ← vault file
```

---

## The `.keys` File

This is a plain JSON file. Example structure:

```json
{
  "version": 1,
  "vault_a": {
    "salt":       "a1b2c3...  (64 hex chars = 32 bytes)",
    "nonce":      "d4e5f6...  (24 hex chars = 12 bytes)",
    "ciphertext": "789abc...  (96 hex chars = 32 bytes plaintext + 16 byte GCM tag)"
  },
  "vault_b": {
    "salt":       "...",
    "nonce":      "...",
    "ciphertext": "..."
  }
}
```

- `vault_a` — unlocked by your **passphrase**
- `vault_b` — unlocked by your **recovery code**
- All fields are **lowercase hex strings** (no base64)

---

## Recovery Code Format

Your recovery code looks like: `A1B2C3D4-E5F6A7B8-C9D0E1F2-A3B4C5D6`

To use it as the vault secret, strip the dashes and uppercase it:
```
A1B2C3D4E5F6A7B8C9D0E1F2A3B4C5D6
```
This 32-character string is passed as the passphrase input to Argon2 when decrypting vault_b.

---

## Cryptographic Parameters

| Parameter | Value |
|---|---|
| KDF | Argon2id |
| Argon2 memory | 65536 KiB (64 MB) |
| Argon2 iterations | 3 |
| Argon2 parallelism | 1 |
| Argon2 output length | 32 bytes |
| Cipher | AES-256-GCM |
| Nonce size | 12 bytes |
| Database encryption | SQLCipher 4, raw key via `PRAGMA key = "x'HEX'"` |

---

## Step-by-Step: Recover the Master Key (Python)

### Install dependencies

```bash
pip install argon2-cffi cryptography
```

### recover_key.py

```python
import json, sys
from argon2.low_level import hash_secret_raw, Type
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

with open("dsj.keys") as f:
    keys = json.load(f)

# Choose vault_a (passphrase) or vault_b (recovery code)
vault = keys["vault_a"]

secret = input("Enter passphrase (or normalized recovery code): ").strip()
# If using recovery code: strip dashes, uppercase — e.g. "A1B2C3D4E5F6A7B8C9D0E1F2A3B4C5D6"

salt       = bytes.fromhex(vault["salt"])
nonce      = bytes.fromhex(vault["nonce"])
ciphertext = bytes.fromhex(vault["ciphertext"])

# Derive vault key via Argon2id
vault_key = hash_secret_raw(
    secret=secret.encode(),
    salt=salt,
    time_cost=3,
    memory_cost=65536,
    parallelism=1,
    hash_len=32,
    type=Type.ID,
)

# Decrypt master key via AES-256-GCM
try:
    master_key = AESGCM(vault_key).decrypt(nonce, ciphertext, None)
except Exception:
    print("Failed — wrong passphrase/recovery code or corrupted vault")
    sys.exit(1)

print("Master key (hex):", master_key.hex().upper())
```

Run it:
```bash
python recover_key.py
```

---

## Step-by-Step: Open the Database (SQLCipher CLI)

Install SQLCipher:
```bash
brew install sqlcipher   # macOS
```

Open the database using the raw hex master key:
```bash
sqlcipher dsj.db
```

At the SQLCipher prompt:
```sql
PRAGMA key = "x'PASTE_MASTER_KEY_HEX_HERE'";
SELECT name FROM sqlite_master WHERE type='table';
```

If the table list appears, you're in.

---

## Export to Plain SQLite

To create an unencrypted copy you can open with any SQLite tool:
```sql
ATTACH DATABASE 'dsj_plain.db' AS plain KEY '';
SELECT sqlcipher_export('plain');
DETACH DATABASE plain;
.quit
```

Open `dsj_plain.db` with [DB Browser for SQLite](https://sqlitebrowser.org/), `sqlite3`, or any other tool.

---

## Key Tables

| Table | Contents |
|---|---|
| `messages` | All journal entries (channel_id, avatar_id, text, created_at) |
| `channels` | Channels and their folders |
| `avatars` | Alter list with colors, descriptions, pronouns |
| `tracker_records` / `tracker_record_values` | Structured tracker submissions |
| `front_sessions` | Front log entries (who, entered_at, exited_at) |
| `avatar_notes` | Per-avatar notes |

See `docs/schema-notes.md` for the full schema.

---

## Unencrypted Databases

If encryption was never enabled, `dsj.db` is a plain SQLite file. Open it directly with `sqlite3` or DB Browser — no key needed.

---

## Troubleshooting

| Error | Likely cause |
|---|---|
| "Failed to decrypt" | Wrong passphrase or recovery code |
| "file is not a database" | Wrong master key hex, or DB not encrypted with SQLCipher |
| Empty table list | Key was correct but DB is corrupted |
| Argon2 takes a long time | Normal — 64 MB memory + 3 iterations is intentional |

---

## Safety Reminders

- The master key gives full access to all data. Do not store it in plaintext.
- Keep your `.keys` file backed up separately from your `.db` file — having both an attacker can attempt to guess (brute force) your passphrase.
- If you suspect the master key was exposed, re-encrypt via Settings → Security → Change Passphrase (this generates a new recovery code; the database is re-keyed via the new master key).
