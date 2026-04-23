export function fmtElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export function fmtMsgTime(created_at: string, use24h: boolean): { timeStr: string; dateStr: string } {
  const date = new Date(created_at + 'Z')
  return {
    timeStr: date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: !use24h }),
    dateStr: date.toLocaleDateString(),
  }
}

export function fmtRestoreTime(created_at: string, windowMinutes: number): string {
  const ms = new Date(created_at + 'Z').getTime() + windowMinutes * 60_000
  return new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}
