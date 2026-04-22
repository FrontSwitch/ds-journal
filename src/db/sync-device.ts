import { getDb } from './index'
import { isTauri } from '../native/platform'
import type { DeviceType } from '../types'

// --- Device identity ---

export function getOrCreateDeviceId(): string {
  let id = localStorage.getItem('dsj-device-id')
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem('dsj-device-id', id)
  }
  return id
}

// --- Device config helpers ---

async function getDeviceConfig(key: string): Promise<string | null> {
  const db = await getDb()
  const rows = await db.select<{ value: string }[]>(
    `SELECT value FROM device_config WHERE key = ?`, [key]
  )
  return rows[0]?.value ?? null
}

async function setDeviceConfig(key: string, value: string): Promise<void> {
  const db = await getDb()
  await db.execute(
    `INSERT OR REPLACE INTO device_config (key, value) VALUES (?, ?)`, [key, value]
  )
}

/** Call once at app startup to persist device_id in the DB and push device info to Rust. */
export async function initSyncCtx(): Promise<void> {
  const db = await getDb()

  // Read from DB first — authoritative per-database
  const existing = await db.select<{ value: string }[]>(
    `SELECT value FROM device_config WHERE key = 'device_id'`
  )
  let deviceId: string
  if (existing.length > 0 && existing[0].value) {
    deviceId = existing[0].value
    localStorage.setItem('dsj-device-id', deviceId)
  } else {
    deviceId = crypto.randomUUID()
    localStorage.setItem('dsj-device-id', deviceId)
    await db.execute(
      `INSERT OR REPLACE INTO device_config (key, value) VALUES ('device_id', ?)`,
      [deviceId]
    )
  }

  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('sync_set_device_id', { deviceId })
    const name = await getDeviceName()
    const type = await getDeviceType()
    await invoke('sync_set_device_info', { deviceName: name ?? '', deviceType: type })
    // Reload trusted peer codes into Rust cache (lost on every restart — cache is in-memory only)
    const peers = await db.select<{ device_id: string; peer_code: string }[]>(
      `SELECT device_id, peer_code FROM sync_peers WHERE trusted = 1 AND peer_code IS NOT NULL`
    )
    for (const p of peers) {
      await invoke('sync_update_peer_cache', { deviceId: p.device_id, peerCode: p.peer_code })
    }
    // Apply stored preferred port (starts on random; restart to preferred port if set)
    await applyPreferredPort()
  }
}

// --- Device name / type (stored in device_config) ---

export async function getDeviceName(): Promise<string | null> {
  return getDeviceConfig('device_name')
}

export async function setDeviceName(name: string): Promise<void> {
  await setDeviceConfig('device_name', name)
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('sync_set_device_info', { deviceName: name, deviceType: await getDeviceType() })
  }
}

export async function getDeviceType(): Promise<DeviceType> {
  return ((await getDeviceConfig('device_type')) as DeviceType) ?? 'full'
}

export async function setDeviceType(type: DeviceType): Promise<void> {
  await setDeviceConfig('device_type', type)
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('sync_set_device_info', { deviceName: (await getDeviceName()) ?? '', deviceType: type })
  }
}

// --- Sync policy (stored in device_config) ---

/** messageDays: -1 = all, 0 = structure only, N = last N days */
export async function getMessageDays(): Promise<number> {
  const v = await getDeviceConfig('sync_message_days')
  return v !== null ? parseInt(v, 10) : -1
}

export async function setMessageDays(days: number): Promise<void> {
  await setDeviceConfig('sync_message_days', String(days))
}

export async function getAutoBackup(): Promise<boolean> {
  return (await getDeviceConfig('sync_auto_backup')) === 'true'
}

export async function setAutoBackup(enabled: boolean): Promise<void> {
  await setDeviceConfig('sync_auto_backup', enabled ? 'true' : 'false')
}

// --- Sync port (stored in device_config; 0 = random) ---

export async function getSyncPort(): Promise<number> {
  return parseInt((await getDeviceConfig('sync_port')) ?? '0', 10) || 0
}

export async function setSyncPort(port: number): Promise<void> {
  await setDeviceConfig('sync_port', String(port))
}

/** Apply the stored preferred port to the running server. Returns the actual port bound.
 *  Persists the actual port so it stays stable across restarts. */
export async function applyPreferredPort(): Promise<number> {
  if (!isTauri()) return 0
  const preferred = await getSyncPort()
  const { invoke } = await import('@tauri-apps/api/core')
  const actual = await invoke<number>('sync_restart_on_port', { port: preferred })
  if (actual > 0 && actual !== preferred) {
    await setDeviceConfig('sync_port', String(actual))
  }
  return actual
}
