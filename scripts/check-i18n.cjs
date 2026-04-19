#!/usr/bin/env node
/**
 * Usage:
 *   node scripts/check-i18n.cjs           # check all non-EN locales
 *   node scripts/check-i18n.cjs es        # check a specific locale
 *   node scripts/check-i18n.cjs es --json # machine-readable output
 */

const fs = require('fs')
const path = require('path')

const I18N_DIR = path.join(__dirname, '../src/i18n')
const REF_LOCALE = 'en'

function flatKeys(obj, prefix = '') {
  return Object.entries(obj).flatMap(([k, v]) =>
    typeof v === 'object' && v !== null && !Array.isArray(v)
      ? flatKeys(v, prefix ? `${prefix}.${k}` : k)
      : [prefix ? `${prefix}.${k}` : k]
  )
}

function loadLocale(locale) {
  const file = path.join(I18N_DIR, `${locale}.json`)
  if (!fs.existsSync(file)) {
    console.error(`File not found: ${file}`)
    process.exit(1)
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function compare(locale, refKeys) {
  const data = loadLocale(locale)
  const keys = new Set(flatKeys(data))
  const missing = refKeys.filter(k => !keys.has(k))
  const stale   = [...keys].filter(k => !refKeys.includes(k))
  return { locale, total: refKeys.length, missing, stale }
}

// ── Main ──────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2).filter(a => !a.startsWith('--'))
const jsonMode = process.argv.includes('--json')

const ref = loadLocale(REF_LOCALE)
const refKeys = flatKeys(ref)

let locales = args.length
  ? args
  : fs.readdirSync(I18N_DIR)
      .filter(f => f.endsWith('.json') && f !== `${REF_LOCALE}.json`)
      .map(f => f.replace('.json', ''))

const results = locales.map(l => compare(l, refKeys))

if (jsonMode) {
  console.log(JSON.stringify(results, null, 2))
  process.exit(0)
}

let anyStale = false
for (const { locale, total, missing, stale } of results) {
  const pct = Math.round(((total - missing.length) / total) * 100)
  console.log(`\n── ${locale}.json ─── ${pct}% complete (${total - missing.length}/${total} keys)`)

  if (stale.length) {
    anyStale = true
    console.log(`  STALE (${stale.length}) — keys not in EN, should be removed:`)
    stale.forEach(k => console.log(`    - ${k}`))
  }

  if (missing.length) {
    console.log(`  MISSING (${missing.length}):`)
    missing.forEach(k => console.log(`    + ${k}`))
  }

  if (!stale.length && !missing.length) {
    console.log('  ✓ Complete')
  }
}

console.log('')
process.exit(anyStale ? 1 : 0)
