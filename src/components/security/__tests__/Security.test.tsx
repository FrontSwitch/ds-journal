import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { invoke } from '@tauri-apps/api/core'
import { useAppStore } from '../../../store/app'
import Security from '../../settings/Security'

const mockInvoke = vi.mocked(invoke)
const onClose = vi.fn()

// Reset store and mocks between tests
beforeEach(() => {
  vi.clearAllMocks()
  useAppStore.setState({
    config: {
      ...useAppStore.getState().config,
      security: { encryptDatabase: false, rememberPassphrase: false },
    },
  })
})

function setup() {
  render(<Security onClose={onClose} />)
}

// ── Unencrypted state ─────────────────────────────────────────────────────────

describe('Security — unencrypted DB', () => {
  it('shows unencrypted status', () => {
    setup()
    expect(screen.getByText(/not encrypted/i)).toBeInTheDocument()
  })

  it('shows the Enable Encryption section', () => {
    setup()
    expect(screen.getByText(/enable encryption/i)).toBeInTheDocument()
  })

  it('does not show Change Passphrase section', () => {
    setup()
    expect(screen.queryByText(/change passphrase/i)).not.toBeInTheDocument()
  })

  it('encrypt button disabled when passphrase fields are empty', () => {
    setup()
    expect(screen.getByRole('button', { name: /encrypt database/i })).toBeDisabled()
  })

  it('encrypt button disabled when only new passphrase filled', async () => {
    setup()
    const inputs = screen.getAllByPlaceholderText(/passphrase/i)
    await userEvent.type(inputs[0], 'mypassphrase')
    expect(screen.getByRole('button', { name: /encrypt database/i })).toBeDisabled()
  })

  it('encrypt button enabled when both fields filled', async () => {
    setup()
    const inputs = screen.getAllByPlaceholderText(/passphrase/i)
    await userEvent.type(inputs[0], 'mypassphrase')
    await userEvent.type(inputs[1], 'mypassphrase')
    expect(screen.getByRole('button', { name: /encrypt database/i })).toBeEnabled()
  })

  it('shows mismatch error when passphrases differ', async () => {
    setup()
    const inputs = screen.getAllByPlaceholderText(/passphrase/i)
    await userEvent.type(inputs[0], 'passA')
    await userEvent.type(inputs[1], 'passB')
    await userEvent.click(screen.getByRole('button', { name: /encrypt database/i }))
    expect(screen.getByText(/do not match/i)).toBeInTheDocument()
    expect(mockInvoke).not.toHaveBeenCalled()
  })

  it('calls db_setup_encryption with the passphrase on submit', async () => {
    mockInvoke
      .mockResolvedValueOnce(true)             // vault_exists (useEffect)
      .mockResolvedValueOnce({ key: 'raw:abc', recovery_code: 'AABB0011-CCDD2233-EEFF4455-66778899' })
    setup()
    const inputs = screen.getAllByPlaceholderText(/passphrase/i)
    await userEvent.type(inputs[0], 'correct-horse')
    await userEvent.type(inputs[1], 'correct-horse')
    await userEvent.click(screen.getByRole('button', { name: /encrypt database/i }))
    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith('db_setup_encryption', expect.objectContaining({
        passphrase: 'correct-horse',
      }))
    )
  })
})

// ── Encrypted state (vault mode) ──────────────────────────────────────────────

describe('Security — encrypted DB', () => {
  beforeEach(() => {
    useAppStore.setState({
      config: {
        ...useAppStore.getState().config,
        security: { encryptDatabase: true, rememberPassphrase: false },
      },
    })
    // vault_exists → true
    mockInvoke.mockResolvedValue(true)
  })

  it('shows encrypted status', async () => {
    setup()
    await waitFor(() => expect(screen.getByText(/database is encrypted/i)).toBeInTheDocument())
  })

  it('shows Change Passphrase section once vault_exists resolves', async () => {
    setup()
    await screen.findByRole('button', { name: /change passphrase/i })
  })

  it('does not show Enable Encryption section', async () => {
    setup()
    await screen.findByRole('button', { name: /change passphrase/i })
    expect(screen.queryByText(/enable encryption/i)).not.toBeInTheDocument()
  })

  it('shows Disable Encryption section', async () => {
    setup()
    await screen.findByRole('button', { name: /disable encryption/i })
  })
})

// ── Change passphrase ─────────────────────────────────────────────────────────

describe('Security — change passphrase', () => {
  beforeEach(() => {
    useAppStore.setState({
      config: {
        ...useAppStore.getState().config,
        security: { encryptDatabase: true, rememberPassphrase: false },
      },
    })
    mockInvoke.mockResolvedValue(true) // vault_exists
  })

  it('change button disabled until all three fields filled', async () => {
    setup()
    await screen.findByRole('button', { name: /change passphrase/i })
    expect(screen.getByRole('button', { name: /change passphrase/i })).toBeDisabled()
  })

  it('shows mismatch error when new passphrases differ', async () => {
    setup()
    await screen.findByRole('button', { name: /change passphrase/i })
    const inputs = screen.getAllByPlaceholderText(/passphrase/i)
    // current, new, confirm
    await userEvent.type(inputs[0], 'current-pass')
    await userEvent.type(inputs[1], 'new-pass-A')
    await userEvent.type(inputs[2], 'new-pass-B')
    await userEvent.click(screen.getByRole('button', { name: /change passphrase/i }))
    expect(screen.getByText(/do not match/i)).toBeInTheDocument()
  })

  it('verifies current passphrase before rewrapping', async () => {
    // db_open_passphrase rejects → error shown, db_rewrap_passphrase NOT called
    mockInvoke
      .mockResolvedValueOnce(true)          // vault_exists
      .mockRejectedValueOnce(new Error('wrong passphrase'))
    setup()
    await screen.findByRole('button', { name: /change passphrase/i })
    const inputs = screen.getAllByPlaceholderText(/passphrase/i)
    await userEvent.type(inputs[0], 'wrong-current')
    await userEvent.type(inputs[1], 'new-pass')
    await userEvent.type(inputs[2], 'new-pass')
    await userEvent.click(screen.getByRole('button', { name: /change passphrase/i }))
    await waitFor(() =>
      expect(mockInvoke).not.toHaveBeenCalledWith('db_rewrap_passphrase', expect.anything())
    )
  })
})

// ── Legacy upgrade ────────────────────────────────────────────────────────────

describe('Security — legacy upgrade (encrypted, no vault)', () => {
  beforeEach(() => {
    useAppStore.setState({
      config: {
        ...useAppStore.getState().config,
        security: { encryptDatabase: true, rememberPassphrase: false },
      },
    })
    mockInvoke.mockResolvedValue(false) // vault_exists → false = legacy
  })

  it('shows Upgrade Encryption section', async () => {
    setup()
    await screen.findByRole('button', { name: /upgrade encryption/i })
  })

  it('does not show Change Passphrase for legacy DB', async () => {
    setup()
    await screen.findByRole('button', { name: /upgrade encryption/i })
    expect(screen.queryByRole('button', { name: /change passphrase/i })).not.toBeInTheDocument()
  })
})
