import { isTauri } from './platform'

export interface NativeFs {
  getDataDir(): Promise<string>
  join(...parts: string[]): Promise<string>
  mkdir(path: string): Promise<void>
  readDir(path: string): Promise<{ name: string }[]>
  remove(path: string): Promise<void>
  writeText(path: string, data: string): Promise<void>
  saveDialog(defaultName: string, filters?: { name: string; extensions: string[] }[]): Promise<string | null>
}

export async function getNativeFs(): Promise<NativeFs> {
  if (isTauri()) {
    const { appDataDir, join } = await import('@tauri-apps/api/path')
    const { mkdir, readDir, remove, writeTextFile } = await import('@tauri-apps/plugin-fs')
    const { save } = await import('@tauri-apps/plugin-dialog')
    return {
      getDataDir: appDataDir,
      join: (...parts) => join(...parts),
      mkdir: (path) => mkdir(path, { recursive: true }),
      readDir: async (path) => {
        const entries = await readDir(path)
        return entries.map(e => ({ name: e.name ?? '' })).filter(e => e.name)
      },
      remove,
      writeText: writeTextFile,
      saveDialog: (defaultName, filters) => save({ defaultPath: defaultName, filters }),
    }
  } else {
    // Capacitor: paths are relative to Directory.Data
    const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem')
    return {
      getDataDir: async () => {
        const result = await Filesystem.getUri({ path: '', directory: Directory.Data })
        return result.uri
      },
      join: async (...parts) => parts.filter(Boolean).join('/'),
      mkdir: async (path) => {
        await Filesystem.mkdir({ path, directory: Directory.Data, recursive: true })
      },
      readDir: async (path) => {
        try {
          const result = await Filesystem.readdir({ path, directory: Directory.Data })
          return result.files.map(f => ({ name: f.name }))
        } catch {
          return []
        }
      },
      remove: async (path) => {
        await Filesystem.deleteFile({ path, directory: Directory.Data })
      },
      writeText: async (path, data) => {
        await Filesystem.writeFile({ path, directory: Directory.Data, data, encoding: Encoding.UTF8 })
      },
      // Mobile has no save dialog — return a path; caller may share via share sheet if desired
      saveDialog: async (defaultName) => defaultName,
    }
  }
}
