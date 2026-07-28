import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const setAuthorization = vi.fn()
vi.mock('~/lib/authorizations', () => ({
  setAuthorization: (...args: unknown[]) => setAuthorization(...args)
}))
vi.mock('~/lib/monitoring', () => ({ captureError: vi.fn() }))

import { AuthorizeStep } from '~/components/AuthorizeStep'

const auth = { kind: 'approval', contractAddress: '0xc', spenderAddress: '0xm', chainId: 80002 } as never
const signer = { tag: 'signer' } as never

function renderStep() {
  const onAuthorized = vi.fn()
  const onCancel = vi.fn()
  const onClose = vi.fn()
  render(
    <AuthorizeStep
      auth={auth}
      signer={signer}
      title="One quick approval first"
      name="Cool Hat"
      reason="why we need it"
      onAuthorized={onAuthorized}
      onCancel={onCancel}
      onClose={onClose}
    />
  )
  return { onAuthorized, onCancel, onClose }
}

beforeEach(() => {
  setAuthorization.mockReset()
})

describe('AuthorizeStep', () => {
  describe('when the grant succeeds', () => {
    it('should authorize (gasless, active) and advance via onAuthorized', async () => {
      setAuthorization.mockResolvedValue(undefined)
      const { onAuthorized } = renderStep()

      await userEvent.click(screen.getByTestId('authorize-step-action'))

      await waitFor(() =>
        expect(setAuthorization).toHaveBeenCalledWith(expect.objectContaining({ auth, signer, active: true }))
      )
      expect(onAuthorized).toHaveBeenCalledTimes(1)
    })
  })

  describe('when the user rejects the wallet prompt', () => {
    it('should stay on the step with a retry and not advance', async () => {
      setAuthorization.mockRejectedValueOnce({ code: 4001, message: 'User denied' })
      const { onAuthorized } = renderStep()

      await userEvent.click(screen.getByTestId('authorize-step-action'))

      await waitFor(() => expect(screen.getByText(/dismissed the approval/i)).toBeInTheDocument())
      expect(onAuthorized).not.toHaveBeenCalled()
      // The Authorize button is back (not stuck busy) so the user can retry.
      expect(screen.getByTestId('authorize-step-action')).toBeEnabled()
    })
  })

  describe('when the grant fails for another reason', () => {
    it('should show a generic error and not advance', async () => {
      setAuthorization.mockRejectedValueOnce(new Error('relayer down'))
      const { onAuthorized } = renderStep()

      await userEvent.click(screen.getByTestId('authorize-step-action'))

      await waitFor(() => expect(screen.getByText(/complete the approval/i)).toBeInTheDocument())
      expect(onAuthorized).not.toHaveBeenCalled()
    })
  })
})
