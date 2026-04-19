import { getNativeFs } from '../native/fs'
import { openUrl } from '../native/urls'
import { getDb } from './index'
import { isCapacitor } from '../native/platform'
import { toBackupTimestamp, toIsoDate } from '../lib/dateUtils'

export interface BackupConfig {
  dailyEnabled: boolean
  dailyKeep: number
  weeklyEnabled: boolean
  weeklyKeep: number
  lastDailyAt: string | null
  lastWeeklyAt: string | null
}

const CONFIG_KEY = 'dsj-backup-config'

export const DEFAULT_CONFIG: BackupConfig = {
  dailyEnabled: true,
  dailyKeep: 7,
  weeklyEnabled: true,
  weeklyKeep: 4,
  lastDailyAt: null,
  lastWeeklyAt: null,
}

export function loadBackupConfig(): BackupConfig {
  try {
    const raw = localStorage.getItem(CONFIG_KEY)
    return raw ? { ...DEFAULT_CONFIG, ...JSON.parse(raw) } : { ...DEFAULT_CONFIG }
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

export function saveBackupConfig(config: BackupConfig) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config))
}

// --- Backup ---

async function backupDir(type: 'daily' | 'weekly'): Promise<string> {
  const fs = await getNativeFs()
  const base = await fs.getDataDir()
  return fs.join(base, 'backups', type)
}

function timestamp(): string {
  return toBackupTimestamp(new Date())
}

export async function runBackup(type: 'daily' | 'weekly', keep: number): Promise<string> {
  const fs = await getNativeFs()
  const dir = await backupDir(type)
  await fs.mkdir(dir)

  const filename = `dsj_${timestamp()}.db`
  const destPath = await fs.join(dir, filename)

  // VACUUM INTO creates an atomic, consistent copy via SQLite's own backup API
  const db = await getDb()
  await db.execute(`VACUUM INTO '${destPath}'`)

  await pruneBackups(dir, keep)
  return destPath
}

async function pruneBackups(dir: string, keep: number) {
  const fs = await getNativeFs()
  const entries = await fs.readDir(dir)
  const dbFiles = entries
    .filter(e => e.name.endsWith('.db'))
    .sort((a, b) => a.name.localeCompare(b.name))

  while (dbFiles.length > keep) {
    const oldest = dbFiles.shift()!
    await fs.remove(await fs.join(dir, oldest.name))
  }
}

export interface BackupEntry {
  type: 'daily' | 'weekly'
  name: string
  path: string
}

export async function listBackups(): Promise<BackupEntry[]> {
  const fs = await getNativeFs()
  const result: BackupEntry[] = []
  for (const type of ['daily', 'weekly'] as const) {
    try {
      const dir = await backupDir(type)
      const entries = await fs.readDir(dir)
      for (const e of entries) {
        if (e.name.endsWith('.db')) {
          result.push({ type, name: e.name, path: await fs.join(dir, e.name) })
        }
      }
    } catch {
      // directory doesn't exist yet — no backups of this type
    }
  }
  return result.sort((a, b) => b.name.localeCompare(a.name))
}

export async function openBackupsDir(): Promise<void> {
  const fs = await getNativeFs()
  const base = await fs.getDataDir()
  const dir = await fs.join(base, 'backups')
  await openUrl(`file://${dir}`)
}

// --- Auto-backup: call on app startup ---

export async function checkAutoBackup() {
  if (isCapacitor()) return  // iOS backup handled by iCloud/iTunes
  const config = loadBackupConfig()
  const now = Date.now()

  if (config.dailyEnabled) {
    const last = config.lastDailyAt ? new Date(config.lastDailyAt).getTime() : 0
    if (now - last > 24 * 60 * 60 * 1000) {
      await runBackup('daily', config.dailyKeep)
      saveBackupConfig({ ...config, lastDailyAt: new Date().toISOString() })
    }
  }

  if (config.weeklyEnabled) {
    const last = config.lastWeeklyAt ? new Date(config.lastWeeklyAt).getTime() : 0
    if (now - last > 7 * 24 * 60 * 60 * 1000) {
      await runBackup('weekly', config.weeklyKeep)
      saveBackupConfig({ ...config, lastWeeklyAt: new Date().toISOString() })
    }
  }
}

// --- Export to JSON ---

export async function exportToJson(): Promise<string | null> {
  const fs = await getNativeFs()
  const defaultName = `dsj_export_${toIsoDate(new Date())}.json`
  const savePath = await fs.saveDialog(defaultName, [{ name: 'JSON', extensions: ['json'] }])
  if (!savePath) return null

  const db = await getDb()
  const [folders, channels, avatars, groups, members, messages] = await Promise.all([
    db.select('SELECT * FROM folders ORDER BY sort_order, name'),
    db.select('SELECT * FROM channels ORDER BY sort_order, name'),
    db.select('SELECT * FROM avatars ORDER BY sort_order, name'),
    db.select('SELECT * FROM avatar_groups ORDER BY sort_order, name'),
    db.select('SELECT * FROM avatar_group_members'),
    db.select('SELECT * FROM messages ORDER BY created_at'),
  ])

  const data = {
    exported_at: new Date().toISOString(),
    app: 'DissociativeSystemJournal',
    version: '0.1.0',
    folders,
    channels,
    avatars,
    avatar_groups: groups,
    avatar_group_members: members,
    messages,
  }

  await fs.writeText(savePath, JSON.stringify(data, null, 2))
  return savePath
}
