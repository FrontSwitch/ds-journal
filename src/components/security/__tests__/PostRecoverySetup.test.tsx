import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { invoke } from '@tauri-apps/api/core'
import PostRecoverySetup from '../PostRecoverySetup'

const mockInvoke = vi.mocked(invoke)
const onComplete = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
})

function setup() {
  render(<PostRecoverySetup onComplete={onComplete} />)
}

describe('PostRecoverySetup', () => {
  it('set passphrase button is disabled when inputs are empty', () => {
    setup()
    expect(screen.getByRole('button', { name: /set passphrase/i })).toBeDisabled()
  })

  it('set passphrase button remains disabled with only one field filled', async () => {
    setup()
    await userEvent.type(screen.getAllByPlaceholderText(/passphrase/i)[0], 'secret')
    expect(screen.getByRole('button', { name: /set passphrase/i })).toBeDisabled()
  })

  it('shows mismatch error when passphrases differ', async () => {
    setup()
    await userEvent.type(screen.getAllByPlaceholderText(/new passphrase/i)[0], 'secret')
    await userEvent.type(screen.getByPlaceholderText(/confirm/i), 'different')
    await userEvent.click(screen.getByRole('button', { name: /set passphrase/i }))
    expect(screen.getByText(/do not match/i)).toBeInTheDocument()
  })

  it('does not call invoke on mismatch', async () => {
    setup()
    await userEvent.type(screen.getAllByPlaceholderText(/new passphrase/i)[0], 'abc')
    await userEvent.type(screen.getByPlaceholderText(/confirm/i), 'xyz')
    await userEvent.click(screen.getByRole('button', { name: /set passphrase/i }))
    expect(mockInvoke).not.toHaveBeenCalled()
  })

  it('shows recovery code display after successful submit', async () => {
    mockInvoke.mockResolvedValueOnce('AABB0011-CCDD2233-EEFF4455-66778899')
    setup()
    await userEvent.type(screen.getAllByPlaceholderText(/new passphrase/i)[0], 'correct-horse')
    await userEvent.type(screen.getByPlaceholderText(/confirm/i), 'correct-horse')
    await userEvent.click(screen.getByRole('button', { name: /set passphrase/i }))
    expect(await screen.findByText('AABB0011-CCDD2233-EEFF4455-66778899')).toBeInTheDocument()
  })

  it('calls onComplete after acknowledging recovery code', async () => {
    mockInvoke.mockResolvedValueOnce('AABB0011-CCDD2233-EEFF4455-66778899')
    setup()
    await userEvent.type(screen.getAllByPlaceholderText(/new passphrase/i)[0], 'correct-horse')
    await userEvent.type(screen.getByPlaceholderText(/confirm/i), 'correct-horse')
    await userEvent.click(screen.getByRole('button', { name: /set passphrase/i }))
    await screen.findByText('AABB0011-CCDD2233-EEFF4455-66778899')
    await userEvent.click(screen.getByRole('checkbox'))
    await userEvent.click(screen.getByRole('button', { name: /continue/i }))
    expect(onComplete).toHaveBeenCalledOnce()
  })
})
