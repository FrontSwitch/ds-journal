import { isTauri } from './platform'

// Matches the shape both backends return so call sites need no changes.
export interface NativeDb {
  select<T>(sql: string, params?: unknown[]): Promise<T>
  execute(sql: string, params?: unknown[]): Promise<{ lastInsertId: number | bigint }>
}

export async function loadNativeDb(name: string, key?: string): Promise<NativeDb> {
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core')
    // Open the DB (with optional SQLCipher key). Throws on wrong passphrase.
    await invoke('db_load', { name, key: key ?? null })
    return {
      select: <T>(sql: string, params?: unknown[]) =>
        invoke<T>('db_select', { sql, params: params ?? [] }),
      execute: async (sql: string, params?: unknown[]) => {
        const r = await invoke<{ rows_affected: number; last_insert_id: number }>(
          'db_execute', { sql, params: params ?? [] }
        )
        return { lastInsertId: r.last_insert_id }
      },
    }
  } else {
    // Capacitor: @capacitor-community/sqlite with SQLCipher support
    const { CapacitorSQLite, SQLiteConnection } = await import('@capacitor-community/sqlite')
    const sqlite = new SQLiteConnection(CapacitorSQLite)
    let conn
    for (let attempt = 0; attempt < 10; attempt++) {
      try {
        conn = await sqlite.createConnection(name, false, 'no-encryption', 1, false)
        break
      } catch {
        await new Promise(r => setTimeout(r, 200))
      }
    }
    if (!conn) throw new Error('SQLite plugin did not initialize in time')
    await conn.open()
    return {
      select: async <T>(sql: string, params?: unknown[]) => {
        const result = await conn.query(sql, params as string[])
        return (result.values ?? []) as T
      },
      execute: async (sql: string, params?: unknown[]) => {
        const r = await conn.run(sql, params as string[], false)
        return { lastInsertId: r.changes?.lastId ?? 0 }
      },
    }
  }
}
