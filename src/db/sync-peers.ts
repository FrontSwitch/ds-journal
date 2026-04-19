import { getDb } from './index'
import { isTauri } from '../native/platform'
import type { SyncPeer } from '../types'

export async function getSyncPeerById(deviceId: string): Promise<SyncPeer | null> {
  const db = await getDb()
  const rows = await db.select<SyncPeer[]>('SELECT * FROM sync_peers WHERE device_id = ?', [deviceId])
  return rows[0] ?? null
}

export async function getSyncPeers(): Promise<SyncPeer[]> {
  const db = await getDb()
  return db.select<SyncPeer[]>(
    `SELECT * FROM sync_peers WHERE blocked = 0 ORDER BY last_sync_timestamp DESC`
  )
}

export async function upsertSyncPeer(peer: Partial<SyncPeer> & { device_id: string }): Promise<void> {
  const db = await getDb()
  await db.execute(
    `INSERT INTO sync_peers (device_id, device_name, device_type, peer_address, peer_code, trusted)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(device_id) DO UPDATE SET
       device_name = COALESCE(excluded.device_name, device_name),
       device_type = COALESCE(excluded.device_type, device_type),
       peer_address = COALESCE(excluded.peer_address, peer_address),
       peer_code = COALESCE(excluded.peer_code, peer_code),
       trusted = COALESCE(excluded.trusted, trusted)`,
    [
      peer.device_id,
      peer.device_name ?? null,
      peer.device_type ?? 'full',
      peer.peer_address ?? null,
      peer.peer_code ?? null,
      peer.trusted ?? 0,
    ]
  )
}

export async function removeSyncPeer(deviceId: string): Promise<void> {
  const db = await getDb()
  await db.execute(`DELETE FROM sync_peers WHERE device_id = ?`, [deviceId])
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('sync_remove_peer', { deviceId }).catch(console.warn)
  }
}

export async function recordSyncComplete(deviceId: string, theirCounter: number): Promise<void> {
  const db = await getDb()
  await db.execute(
    `UPDATE sync_peers SET last_seen_counter = ?, last_sync_timestamp = ? WHERE device_id = ?`,
    [theirCounter, Date.now(), deviceId]
  )
}
