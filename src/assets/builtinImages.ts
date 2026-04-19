// Auto-discovers all PNGs under src/assets/avatars/ at build time via Vite glob.
// Keys are 'builtin://avatars/<pack>/<file>.png'; values are Vite-resolved asset URLs.

// Exclude Preview.png and Thumbs.db — only lowercase filenames are avatar art
const modules = import.meta.glob('./avatars/**/[a-z]*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

export const BUILTIN_IMAGES: Record<string, string> = {}

for (const [path, url] of Object.entries(modules)) {
  // path: './avatars/kenney-animal-pack/owl.png'
  // key:  'builtin://avatars/kenney-animal-pack/owl.png'
  BUILTIN_IMAGES['builtin://' + path.slice(2)] = url
}

export interface BuiltinImage {
  key: string   // stored in DB
  name: string  // display name (filename without extension)
  url: string   // resolved Vite asset URL
}

export interface BuiltinPack {
  id: string
  label: string
  images: BuiltinImage[]
}

export function getBuiltinPacks(): BuiltinPack[] {
  const packs: Record<string, BuiltinImage[]> = {}
  for (const [key, url] of Object.entries(BUILTIN_IMAGES)) {
    // key: 'builtin://avatars/kenney-animal-pack/owl.png'
    const inner = key.slice('builtin://avatars/'.length) // 'kenney-animal-pack/owl.png'
    const slash = inner.indexOf('/')
    const packId = inner.slice(0, slash)
    const filename = inner.slice(slash + 1)
    const name = filename.replace(/\.[^.]+$/, '')
    if (!packs[packId]) packs[packId] = []
    packs[packId].push({ key, name, url })
  }
  return Object.entries(packs).map(([id, images]) => ({
    id,
    label: id.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    images: images.sort((a, b) => a.name.localeCompare(b.name)),
  }))
}
