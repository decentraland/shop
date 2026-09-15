import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { RemoveListingModal } from '~/components/RemoveListingModal'
import { WrongNetworkError } from '~/lib/network'

vi.mock('~/lib/monitoring', () => ({ captureError: vi.fn() }))

function renderModal(opts: { managed?: boolean; cancel: () => Promise<'ok' | 'relay-pending'> }) {
  const onClose = vi.fn()
  render(
    <RemoveListingModal
      name="Cool Hat"
      managed={opts.managed ?? false}
      canPayGas={!opts.managed}
      cancel={opts.cancel}
      onClose={onClose}
    />
  )
  return { onClose }
}

describe('RemoveListingModal', () => {
  describe('when the seller confirms', () => {
    it('should lock the dialog while working and close once the listing is down', async () => {
      let finish!: () => void
      const cancel = vi.fn(() => new Promise<'ok'>(resolve => (finish = () => resolve('ok'))))
      const { onClose } = renderModal({ cancel })

      expect(cancel).not.toHaveBeenCalled()
      await userEvent.click(screen.getByTestId('remove-confirm'))

      expect(screen.getByTestId('remove-confirm')).toBeDisabled()
      expect(screen.getByRole('button', { name: /^cancel$/i })).toBeDisabled()
      finish()
      await waitFor(() => expect(onClose).toHaveBeenCalled())
    })
  })

  describe('when the fee-less removal is still pending', () => {
    it('should keep the fee-less submit closed and offer only the paid path', async () => {
      renderModal({ cancel: vi.fn().mockResolvedValue('relay-pending') })

      await userEvent.click(screen.getByTestId('remove-confirm'))

      await screen.findByTestId('cancel-gasless-failed')
      expect(screen.getByTestId('remove-confirm')).toBeDisabled()
      expect(screen.getByTestId('cancel-pay-gas')).toBeEnabled()
    })
  })

  describe('when it fails for a managed user', () => {
    it('should show the generic error inside the dialog, never wallet wording', async () => {
      const { onClose } = renderModal({
        managed: true,
        cancel: vi.fn().mockRejectedValue(new WrongNetworkError(1, 137))
      })

      await userEvent.click(screen.getByTestId('remove-confirm'))

      const alert = await screen.findByRole('alert')
      expect(alert.textContent).toMatch(/couldn.t remove the listing/i)
      expect(alert.textContent).not.toMatch(/wallet|network/i)
      expect(onClose).not.toHaveBeenCalled()
      expect(screen.getByTestId('remove-confirm')).toBeEnabled()
    })
  })
})
