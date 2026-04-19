import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'

const I18N_DIR = join(__dirname)
const REF_LOCALE = 'en'

type JsonValue = string | number | boolean | null | JsonObj | JsonValue[]
type JsonObj = { [key: string]: JsonValue }

function flatKeys(obj: JsonObj, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    typeof v === 'object' && v !== null && !Array.isArray(v)
      ? flatKeys(v as JsonObj, prefix ? `${prefix}.${k}` : k)
      : [prefix ? `${prefix}.${k}` : k]
  )
}

function loadLocale(locale: string): JsonObj {
  const raw = readFileSync(join(I18N_DIR, `${locale}.json`), 'utf8')
  return JSON.parse(raw) as JsonObj
}

function getLocales(): string[] {
  return readdirSync(I18N_DIR)
    .filter(f => f.endsWith('.json') && f !== `${REF_LOCALE}.json`)
    .map(f => f.replace('.json', ''))
}

const refKeys = flatKeys(loadLocale(REF_LOCALE))

describe('i18n', () => {
  for (const locale of getLocales()) {
    const localeKeys = new Set(flatKeys(loadLocale(locale)))

    // Hard failure: stale keys exist in the translation but not in EN.
    // These are dead weight and can confuse translators.
    it(`${locale}: no stale keys (keys removed from EN)`, () => {
      const stale = [...localeKeys].filter(k => !refKeys.includes(k))
      expect(stale, `Stale keys in ${locale}.json — remove them`).toEqual([])
    })

    // Soft check: missing keys just fall back to EN at runtime, so we
    // warn rather than fail. Check the console output to see what's untranslated.
    it(`${locale}: missing key count (informational)`, () => {
      const missing = refKeys.filter(k => !localeKeys.has(k))
      if (missing.length > 0) {
        console.warn(
          `[i18n] ${locale}.json is missing ${missing.length}/${refKeys.length} keys:\n` +
          missing.map(k => `  + ${k}`).join('\n')
        )
      }
      // Always passes — this is informational only
      expect(true).toBe(true)
    })
  }
})
