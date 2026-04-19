/**
 * Formats a Date as a SQLite-compatible datetime string: "YYYY-MM-DD HH:MM:SS"
 */
export function toSqlDatetime(d: Date): string {
  return d.toISOString().slice(0, 19).replace('T', ' ')
}

/**
 * Formats a Date as an ISO date string: "YYYY-MM-DD"
 */
export function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/**
 * Formats a Date as a filesystem-safe timestamp for backup filenames: "YYYY-MM-DD_HH-MM-SS"
 */
export function toBackupTimestamp(d: Date): string {
  return d.toISOString().replace(/:/g, '-').replace('T', '_').slice(0, 19)
}
