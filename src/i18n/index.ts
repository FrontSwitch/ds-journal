import en from './en.json'

// Auto-discover all locale JSON files at build time via Vite glob import.
// Adding a new .json file to this directory is all that's needed — no manual list.
const localeModules = import.meta.glob<{ default: Record<string, unknown> }>(
  './*.json',
  { eager: true }
)

// Build locale data map: { en: {...}, es: {...}, ... }
const localeData: Record<string, Record<string, unknown>> = {
  en: en as unknown as Record<string, unknown>,
}
for (const [path, mod] of Object.entries(localeModules)) {
  const code = path.replace('./', '').replace('.json', '')
  if (code !== 'en') localeData[code] = mod.default
}

// Display names for known locales; unknown codes show as the code itself.
const LOCALE_DISPLAY_NAMES: Record<string, string> = {
  en: 'English',
  es: 'Español',
}

export interface LocaleOption { value: string; label: string }

// Exported for use in the config REGISTRY options list.
export const AVAILABLE_LOCALES: LocaleOption[] = [
  { value: 'en', label: 'English' },
  ...Object.keys(localeData)
    .filter(code => code !== 'en')
    .sort()
    .map(code => ({ value: code, label: LOCALE_DISPLAY_NAMES[code] ?? code })),
  { value: 'xx', label: '[xx] Pseudo-locale (test)' },
]

// ── Active locale ─────────────────────────────────────────────────────────────

// Module-level variable; set synchronously at the top of App's render so all
// child t() calls in the same render pass see the updated value.
let activeLocale = 'en'

export function setLocale(code: string): void {
  activeLocale = code
}

// ── Resolution ────────────────────────────────────────────────────────────────

function lookupIn(obj: Record<string, unknown>, parts: string[]): string | undefined {
  const val = parts.reduce((o: unknown, k) => {
    if (o && typeof o === 'object') return (o as Record<string, unknown>)[k]
    return undefined
  }, obj as unknown)
  return typeof val === 'string' ? val : undefined
}

function resolve(key: string): string {
  const parts = key.split('.')

  // xx pseudo-locale: wrap every English string in ⟦…⟧ to spot hardcoded strings.
  if (activeLocale === 'xx') {
    const enVal = lookupIn(localeData.en, parts)
    if (enVal !== undefined) return `⟦${enVal}⟧`
    console.warn(`[i18n] missing English key: ${key}`)
    return `⟦${key}⟧`
  }

  // Try active locale first.
  if (activeLocale !== 'en' && localeData[activeLocale]) {
    const val = lookupIn(localeData[activeLocale], parts)
    if (val !== undefined) return val
    if (activeLocale !== 'en') console.warn(`[i18n] missing translation (${activeLocale}): ${key}`)
  }

  // Fall back to English.
  const enVal = lookupIn(localeData.en, parts)
  if (enVal !== undefined) return enVal

  console.warn(`[i18n] missing key: ${key}`)
  return key
}

// ── Public API ────────────────────────────────────────────────────────────────

// Recursive type that produces all dot-notation leaf paths from the English JSON shape.
type Leaves<T, P extends string = ''> = {
  [K in keyof T]: K extends string
    ? T[K] extends string
      ? P extends '' ? K : `${P}.${K}`
      : Leaves<T[K], P extends '' ? K : `${P}.${K}`>
    : never
}[keyof T]

export type StringKey = Leaves<typeof en>

/** Look up a string. Supports {{var}} interpolation. */
export function t(key: StringKey, vars?: Record<string, string | number>): string {
  const val = resolve(key)
  if (!vars) return val
  return val.replace(/\{\{(\w+)\}\}/g, (_, k) => String(vars[k] ?? k))
}

/** Plural lookup. Uses {key}One for n===1, {key}Other otherwise.
 *  e.g. tn('backup.copy', 1) → "copy",  tn('backup.copy', 3) → "copies"
 */
export function tn(baseKey: string, count: number, vars?: Record<string, string | number>): string {
  const key = count === 1 ? `${baseKey}One` : `${baseKey}Other`
  const val = resolve(key)
  const merged = { n: count, ...vars }
  return val.replace(/\{\{(\w+)\}\}/g, (_, k) => String(merged[k as keyof typeof merged] ?? k))
}
