export const isTauri = (): boolean =>
  typeof window !== 'undefined' && !!(window as unknown as Record<string, unknown>).__TAURI_INTERNALS__

export const isCapacitor = (): boolean =>
  typeof window !== 'undefined' && !!(window as unknown as Record<string, unknown>).Capacitor
