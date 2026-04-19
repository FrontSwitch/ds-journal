#!/usr/bin/env node
// Deletes the test database.
// Usage: node scripts/delete-test-db.cjs

const os = require('os')
const path = require('path')
const fs = require('fs')

const DB_PATH = process.env.DSJ_DB ?? path.join(
  os.homedir(), 'Library', 'Application Support',
  'io.github.frontswitch.dsj', 'test.db'
)

const WAL  = DB_PATH + '-wal'
const SHM  = DB_PATH + '-shm'
const KEYS = DB_PATH.replace(/\.db$/, '.keys')

let deleted = false
for (const f of [DB_PATH, WAL, SHM, KEYS]) {
  if (fs.existsSync(f)) { fs.unlinkSync(f); deleted = true }
}

console.log(deleted ? `Deleted: ${DB_PATH}` : 'No test DB found.')
