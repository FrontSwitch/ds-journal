import { isTauri } from '../native/platform'
import { runBackup } from './backup'
import type { SyncEvent, SyncConflict } from '../types'
import { getOrCreateDeviceId, getDeviceType, getMessageDays, getAutoBackup } from './sync-device'
import { getLocalEventsSince } from './sync-events'
import { getSyncPeers, upsertSyncPeer, recordSyncComplete } from './sync-peers'
import { SYNC_TABLES, buildStructureSnapshot, applyRemoteEvents } from './sync-apply'
import { getDb } from './index'

// Re-export everything so existing import paths don't need to change
export * from './sync-device'
export * from './sync-events'
export * from './sync-peers'
export * from './sync-apply'

// --- High-level sync orchestration ---

/** Handle an incoming sync request from a peer (called by App.tsx dsj-sync-request handler). */
export async function handleSyncRequest(
  peerDeviceId: string,
  fromCounter: number,
  events: SyncEvent[],
  coldSync: boolean = false
): Promise<{ events: SyncEvent[], server_time: number }> {
  await applyRemoteEvents(events, peerDeviceId)

  const messageDays = await getMessageDays()
  const cutoffMs = messageDays > 0
    ? Date.now() - messageDays * 24 * 60 * 60 * 1000
    : messageDays === 0 ? Date.now() + 1  // structure only
    : 0  // all

  const responseEvents = await getLocalEventsSince(fromCounter, {
    cutoffMs,
    respectSyncEnabled: true,
  })

  // If peer requested cold sync, prepend our structure snapshot
  if (coldSync) {
    const snapshot = await buildStructureSnapshot()
    responseEvents.unshift(...snapshot)
  }

  const realIncoming = events.filter(e => e.device_counter !== -1)
  const theirMaxCounter = realIncoming.length > 0
    ? Math.max(...realIncoming.map(e => e.device_counter))
    : fromCounter
  await recordSyncComplete(peerDeviceId, theirMaxCounter)
  return { events: responseEvents, server_time: Date.now() }
}

/** Sync with all trusted peers. Returns totals for display. */
export async function syncNow(): Promise<{ sent: number, received: number, peers: number, errors: string[] }> {
  if (!isTauri()) return { sent: 0, received: 0, peers: 0, errors: [] }
  const { invoke } = await import('@tauri-apps/api/core')
  const peers = await getSyncPeers()
  const trusted = peers.filter(p => p.trusted && p.peer_address && p.peer_code)
  const myDeviceId = getOrCreateDeviceId()
  const ourType = await getDeviceType()
  let sent = 0, received = 0
  const errors: string[] = []

  const messageDays = await getMessageDays()
  const autoBackup = await getAutoBackup()

  if (autoBackup) {
    await runBackup('daily', 7).catch(e => console.warn('[sync] auto-backup before sync failed:', e))
  }

  const cutoffMs = messageDays > 0
    ? Date.now() - messageDays * 24 * 60 * 60 * 1000
    : messageDays === 0 ? Date.now() + 1
    : 0  // all

  for (const peer of trusted) {
    try {
      const coldSync = !peer.last_sync_timestamp || ourType === 'cold' || peer.device_type === 'cold'

      const regularEvents = await getLocalEventsSince(peer.last_seen_counter, {
        cutoffMs,
        respectSyncEnabled: true,
      })
      const myEvents = coldSync
        ? [...(await buildStructureSnapshot()), ...regularEvents]
        : regularEvents

      const result = await invoke<{ events: SyncEvent[], server_time: number }>('sync_send_to_peer', {
        peerAddress: peer.peer_address!,
        peerCode: peer.peer_code!,
        ourDeviceId: myDeviceId,
        fromCounter: peer.last_seen_counter,
        coldSync,
        events: myEvents,
      })
      await applyRemoteEvents(result.events, peer.device_id)
      const realReceived = result.events.filter(e => e.device_counter !== -1)
      const theirMaxCounter = realReceived.length > 0
        ? Math.max(...realReceived.map(e => e.device_counter))
        : peer.last_seen_counter
      await recordSyncComplete(peer.device_id, theirMaxCounter)
      sent += regularEvents.length
      received += realReceived.length
    } catch (e) {
      const msg = String(e)
      console.warn(`[sync] Failed to sync with ${peer.device_id}:`, msg)
      errors.push(`${peer.device_name ?? peer.device_id.slice(0, 8)}: ${msg}`)
    }
  }
  return { sent, received, peers: trusted.length, errors }
}

/** Save a newly-paired peer to DB and Rust in-memory cache. */
export async function completePairing(
  deviceId: string,
  peerCode: string,
  peerAddress: string,
  deviceName?: string | null,
  deviceType?: import('../types').DeviceType | null
): Promise<void> {
  await upsertSyncPeer({
    device_id: deviceId,
    peer_code: peerCode,
    peer_address: peerAddress,
    device_name: deviceName ?? null,
    device_type: deviceType ?? 'full',
    trusted: 1,
  })
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('sync_update_peer_cache', { deviceId, peerCode })
  }
}

// --- Conflict queries ---

export async function getOpenConflicts(): Promise<SyncConflict[]> {
  const db = await getDb()
  return db.select<SyncConflict[]>(
    `SELECT * FROM sync_conflicts WHERE status = 'open' ORDER BY detected_at DESC`
  )
}

export async function getOpenConflictsWithNames(): Promise<Array<SyncConflict & { entity_name?: string }>> {
  const db = await getDb()
  const conflicts = await db.select<SyncConflict[]>(
    `SELECT * FROM sync_conflicts WHERE status = 'open' ORDER BY detected_at DESC`
  )
  return Promise.all(conflicts.map(async c => {
    let entity_name: string | undefined
    if (SYNC_TABLES.has(c.entity_type)) {
      try {
        // messages use 'text'; all other sync tables have 'name'
        const col = c.entity_type === 'messages' ? 'text' : 'name'
        const rows = await db.select<{ val: string }[]>(
          `SELECT ${col} AS val FROM ${c.entity_type} WHERE entity_id = ?`, [c.entity_id]
        )
        entity_name = rows[0]?.val ?? undefined
      } catch { /* ignore for tables without name/text column */ }
    }
    return { ...c, entity_name }
  }))
}

export async function resolveConflict(
  conflictId: string,
  status: SyncConflict['status']
): Promise<void> {
  const db = await getDb()
  await db.execute(
    `UPDATE sync_conflicts SET status = ? WHERE id = ?`,
    [status, conflictId]
  )
}
