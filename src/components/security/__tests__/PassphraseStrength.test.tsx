import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import PassphraseStrength from '../PassphraseStrength'

// ── Empty state ───────────────────────────────────────────────────────────────

describe('PassphraseStrength — empty', () => {
  it('shows the hint text when passphrase is empty', () => {
    render(<PassphraseStrength passphrase="" />)
    expect(screen.getByText(/try 4.6 random words/i)).toBeInTheDocument()
  })

  it('does not render the strength bar when empty', () => {
    render(<PassphraseStrength passphrase="" />)
    expect(document.querySelector('.pass-strength-bar')).not.toBeInTheDocument()
  })
})

// ── Weak passphrase ───────────────────────────────────────────────────────────

describe('PassphraseStrength — weak input', () => {
  // "password1" scores 0 with zxcvbn
  it('shows Very weak label for "password1"', () => {
    render(<PassphraseStrength passphrase="password1" />)
    expect(screen.getByText(/very weak/i)).toBeInTheDocument()
  })

  it('shows hint for weak passphrase', () => {
    render(<PassphraseStrength passphrase="password1" />)
    expect(screen.getByText(/try 4.6 random words/i)).toBeInTheDocument()
  })

  it('shows crack time for weak passphrase', () => {
    render(<PassphraseStrength passphrase="password1" />)
    expect(screen.getByText(/to crack/i)).toBeInTheDocument()
  })

  // "amazon12*" scores 1–2 — still shows hint
  it('shows hint for fair passphrase (score < 3)', () => {
    render(<PassphraseStrength passphrase="amazon12*" />)
    expect(screen.getByText(/try 4.6 random words/i)).toBeInTheDocument()
  })
})

// ── Strong passphrase ─────────────────────────────────────────────────────────

describe('PassphraseStrength — strong input', () => {
  // Classic correct-horse-battery-staple: zxcvbn scores 3 or 4
  const STRONG = 'correct horse battery staple'

  it('shows Strong or Very strong label', () => {
    render(<PassphraseStrength passphrase={STRONG} />)
    expect(screen.getByText(/strong/i)).toBeInTheDocument()
  })

  it('does not show hint for strong passphrase', () => {
    render(<PassphraseStrength passphrase={STRONG} />)
    expect(screen.queryByText(/try 4.6 random words/i)).not.toBeInTheDocument()
  })

  it('shows crack time for strong passphrase', () => {
    render(<PassphraseStrength passphrase={STRONG} />)
    expect(screen.getByText(/to crack/i)).toBeInTheDocument()
  })
})
