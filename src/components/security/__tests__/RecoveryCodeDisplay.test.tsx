import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import RecoveryCodeDisplay from '../RecoveryCodeDisplay'

const CODE = 'AABB0011-CCDD2233-EEFF4455-66778899'

function setup() {
  const onAcknowledged = vi.fn()
  render(<RecoveryCodeDisplay recoveryCode={CODE} onAcknowledged={onAcknowledged} />)
  return { onAcknowledged }
}

describe('RecoveryCodeDisplay', () => {
  it('shows the recovery code', () => {
    setup()
    expect(screen.getByText(CODE)).toBeInTheDocument()
  })

  it('continue button is disabled until checkbox is checked', () => {
    setup()
    expect(screen.getByRole('button', { name: /continue/i })).toBeDisabled()
  })

  it('continue button enables after checking the acknowledge box', async () => {
    setup()
    await userEvent.click(screen.getByRole('checkbox'))
    expect(screen.getByRole('button', { name: /continue/i })).toBeEnabled()
  })

  it('calls onAcknowledged when continue is clicked after acknowledging', async () => {
    const { onAcknowledged } = setup()
    await userEvent.click(screen.getByRole('checkbox'))
    await userEvent.click(screen.getByRole('button', { name: /continue/i }))
    expect(onAcknowledged).toHaveBeenCalledOnce()
  })

  it('does not call onAcknowledged if checkbox not checked', async () => {
    const { onAcknowledged } = setup()
    // button is disabled so click has no effect
    await userEvent.click(screen.getByRole('button', { name: /continue/i }))
    expect(onAcknowledged).not.toHaveBeenCalled()
  })

  it('unchecking the box re-disables the continue button', async () => {
    setup()
    await userEvent.click(screen.getByRole('checkbox'))
    await userEvent.click(screen.getByRole('checkbox'))
    expect(screen.getByRole('button', { name: /continue/i })).toBeDisabled()
  })
})
