import { isTauri } from './platform'

export function convertAssetUrl(filePath: string | null): string | null {
  if (!filePath) return null
  if (isTauri()) {
    // Tauri asset protocol — convertFileSrc is sync, import eagerly at module level
    // We use a lazy cache to avoid repeated dynamic imports at render time
    return _tauriConvertFileSrc?.(filePath) ?? filePath
  } else {
    // Capacitor: same API, available on window.Capacitor
    type WinCap = { Capacitor?: { convertFileSrc: (p: string) => string } }
    return (window as unknown as WinCap).Capacitor?.convertFileSrc(filePath) ?? filePath
  }
}

export async function openUrl(url: string): Promise<void> {
  if (isTauri()) {
    const { openUrl: tauriOpenUrl } = await import('@tauri-apps/plugin-opener')
    await tauriOpenUrl(url)
  } else {
    const { Browser } = await import('@capacitor/browser')
    await Browser.open({ url })
  }
}

// Eagerly cache the Tauri convertFileSrc function after first import so that
// convertAssetUrl() stays synchronous (needed for img src rendering).
let _tauriConvertFileSrc: ((path: string) => string) | null = null

if (isTauri()) {
  import('@tauri-apps/api/core').then(m => {
    _tauriConvertFileSrc = m.convertFileSrc
  })
}
