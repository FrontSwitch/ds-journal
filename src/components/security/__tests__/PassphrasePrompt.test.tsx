import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { invoke } from '@tauri-apps/api/core'
import PassphrasePrompt from '../PassphrasePrompt'

const mockInvoke = vi.mocked(invoke)

const DEFAULT_PROPS = {
  onUnlock: vi.fn(),
  onUnlockRecovery: vi.fn(),
  onReset: vi.fn(),
  defaultRemember: false,
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ── Passphrase mode ───────────────────────────────────────────────────────────

describe('PassphrasePrompt — passphrase mode', () => {
  it('unlock button is disabled when input is empty', () => {
    render(<PassphrasePrompt {...DEFAULT_PROPS} />)
    expect(screen.getByRole('button', { name: /unlock/i })).toBeDisabled()
  })

  it('unlock button enables once passphrase is typed', async () => {
    render(<PassphrasePrompt {...DEFAULT_PROPS} />)
    await userEvent.type(screen.getByPlaceholderText(/passphrase/i), 'mysecret')
    expect(screen.getByRole('button', { name: /unlock/i })).toBeEnabled()
  })

  it('calls onUnlock with key and remember=false on success', async () => {
    mockInvoke.mockResolvedValueOnce('raw:abc123')
    render(<PassphrasePrompt {...DEFAULT_PROPS} />)
    await userEvent.type(screen.getByPlaceholderText(/passphrase/i), 'correct')
    await userEvent.click(screen.getByRole('button', { name: /unlock/i }))
    expect(DEFAULT_PROPS.onUnlock).toHaveBeenCalledWith('raw:abc123', false)
  })

  it('shows error on wrong passphrase', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('bad key'))
    render(<PassphrasePrompt {...DEFAULT_PROPS} />)
    await userEvent.type(screen.getByPlaceholderText(/passphrase/i), 'wrong')
    await userEvent.click(screen.getByRole('button', { name: /unlock/i }))
    expect(screen.getByText(/wrong passphrase/i)).toBeInTheDocument()
  })
})

// ── Forgot passphrase / DELETE confirmation ───────────────────────────────────

describe('PassphrasePrompt — DELETE confirmation', () => {
  async function openResetBox() {
    render(<PassphrasePrompt {...DEFAULT_PROPS} />)
    await userEvent.click(screen.getByRole('button', { name: /forgot passphrase/i }))
  }

  it('shows reset warning after clicking forgot passphrase', async () => {
    await openResetBox()
    expect(screen.getByText(/permanently delete/i)).toBeInTheDocument()
  })

  it('delete button is disabled when confirm input is empty', async () => {
    await openResetBox()
    expect(screen.getByRole('button', { name: /delete everything/i })).toBeDisabled()
  })

  it('delete button remains disabled with wrong text', async () => {
    await openResetBox()
    await userEvent.type(screen.getByPlaceholderText(/type delete/i), 'delete')
    expect(screen.getByRole('button', { name: /delete everything/i })).toBeDisabled()
  })

  it('delete button remains disabled with partial text', async () => {
    await openResetBox()
    await userEvent.type(screen.getByPlaceholderText(/type delete/i), 'DEL')
    expect(screen.getByRole('button', { name: /delete everything/i })).toBeDisabled()
  })

  it('delete button enables only when DELETE is typed exactly', async () => {
    await openResetBox()
    await userEvent.type(screen.getByPlaceholderText(/type delete/i), 'DELETE')
    expect(screen.getByRole('button', { name: /delete everything/i })).toBeEnabled()
  })

  it('calls onReset when DELETE typed and button clicked', async () => {
    await openResetBox()
    await userEvent.type(screen.getByPlaceholderText(/type delete/i), 'DELETE')
    await userEvent.click(screen.getByRole('button', { name: /delete everything/i }))
    expect(DEFAULT_PROPS.onReset).toHaveBeenCalledOnce()
  })

  it('cancel hides the reset box', async () => {
    await openResetBox()
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(screen.queryByPlaceholderText(/type delete/i)).not.toBeInTheDocument()
  })

  it('cancel clears the confirm input so it does not reappear pre-filled', async () => {
    await openResetBox()
    await userEvent.type(screen.getByPlaceholderText(/type delete/i), 'DELETE')
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }))
    // Open reset box again
    await userEvent.click(screen.getByRole('button', { name: /forgot passphrase/i }))
    expect(screen.getByPlaceholderText(/type delete/i)).toHaveValue('')
  })
})

// ── Recovery code mode ────────────────────────────────────────────────────────

describe('PassphrasePrompt — recovery code mode', () => {
  async function switchToRecovery() {
    render(<PassphrasePrompt {...DEFAULT_PROPS} />)
    await userEvent.click(screen.getByRole('button', { name: /use recovery code/i }))
  }

  it('switches to recovery mode and shows code input', async () => {
    await switchToRecovery()
    // In recovery mode the input type is 'text' (not password), placeholder is the code format
    expect(screen.getByRole('textbox')).toBeInTheDocument()
  })

  it('unlock button disabled when recovery input is empty', async () => {
    await switchToRecovery()
    expect(screen.getByRole('button', { name: /unlock with recovery/i })).toBeDisabled()
  })

  it('calls onUnlockRecovery with key on success', async () => {
    mockInvoke.mockResolvedValueOnce('raw:deadbeef')
    await switchToRecovery()
    await userEvent.type(screen.getByRole('textbox'), 'AABB0011-CCDD2233-EEFF4455-66778899')
    await userEvent.click(screen.getByRole('button', { name: /unlock with recovery/i }))
    expect(DEFAULT_PROPS.onUnlockRecovery).toHaveBeenCalledWith('raw:deadbeef')
  })

  it('shows error on invalid recovery code', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('bad code'))
    await switchToRecovery()
    await userEvent.type(screen.getByRole('textbox'), 'WRONG-CODE-HERE-XXXX')
    await userEvent.click(screen.getByRole('button', { name: /unlock with recovery/i }))
    expect(screen.getByText(/invalid recovery code/i)).toBeInTheDocument()
  })

  it('can switch back to passphrase mode', async () => {
    await switchToRecovery()
    await userEvent.click(screen.getByRole('button', { name: /use passphrase/i }))
    expect(screen.getByPlaceholderText(/passphrase/i)).toBeInTheDocument()
  })
})
