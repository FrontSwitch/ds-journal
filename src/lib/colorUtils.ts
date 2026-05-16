function hexToRgb(hex: string): [number, number, number] | null {
  const h = hex.replace('#', '')
  if (h.length !== 6) return null
  const m = h.match(/.{2}/g)
  if (!m) return null
  return [parseInt(m[0], 16), parseInt(m[1], 16), parseInt(m[2], 16)]
}

function linearize(c: number): number {
  const s = c / 255
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

function luminance([r, g, b]: [number, number, number]): number {
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b)
}

function contrastRatio(l1: number, l2: number): number {
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1]
  return (hi + 0.05) / (lo + 0.05)
}

function rgbToHsl([r, g, b]: [number, number, number]): [number, number, number] {
  const rn = r / 255, gn = g / 255, bn = b / 255
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = 0
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6
  else if (max === gn) h = ((bn - rn) / d + 2) / 6
  else h = ((rn - gn) / d + 4) / 6
  return [h, s, l]
}

function hue2rgb(p: number, q: number, t: number): number {
  if (t < 0) t += 1
  if (t > 1) t -= 1
  if (t < 1/6) return p + (q - p) * 6 * t
  if (t < 1/2) return q
  if (t < 2/3) return p + (q - p) * (2/3 - t) * 6
  return p
}

function hslToRgb([h, s, l]: [number, number, number]): [number, number, number] {
  if (s === 0) {
    const v = Math.round(l * 255)
    return [v, v, v]
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  return [
    Math.round(hue2rgb(p, q, h + 1/3) * 255),
    Math.round(hue2rgb(p, q, h) * 255),
    Math.round(hue2rgb(p, q, h - 1/3) * 255),
  ]
}

function rgbToHex([r, g, b]: [number, number, number]): string {
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')
}

// Returns color adjusted so it meets WCAG 4.5:1 contrast against --bg-panel.
// Preserves hue and saturation; shifts lightness only as much as needed.
export function readableColor(color: string | null | undefined): string {
  if (!color) return 'var(--text-muted)'

  const bgRaw = getComputedStyle(document.documentElement).getPropertyValue('--bg-panel').trim()
  const fgRgb = hexToRgb(color)
  const bgRgb = hexToRgb(bgRaw)
  if (!fgRgb || !bgRgb) return color

  const bgL = luminance(bgRgb)
  if (contrastRatio(luminance(fgRgb), bgL) >= 4.5) return color

  const [h, s, l] = rgbToHsl(fgRgb)
  const bgIsDark = bgL < 0.18  // Mocha/Frappé panels are ~0.05–0.15

  // Binary search lightness toward readable end
  let lo = bgIsDark ? l : 0
  let hi = bgIsDark ? 1 : l
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2
    const adjL = luminance(hslToRgb([h, s, mid]))
    if (contrastRatio(adjL, bgL) >= 4.5) {
      if (bgIsDark) hi = mid; else lo = mid
    } else {
      if (bgIsDark) lo = mid; else hi = mid
    }
  }
  return rgbToHex(hslToRgb([h, s, (lo + hi) / 2]))
}
