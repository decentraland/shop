import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import type { AuthIdentity } from '@dcl/crypto'
import type { PendingBatch, StudioGift } from '~/lib/studio'

// Only the two calls that reach the credits server are replaced; validation, batching and storage run for real.
vi.mock('~/lib/studio', async importOriginal => ({
  ...(await importOriginal<typeof import('~/lib/studio')>()),
  getMyStudio: vi.fn(),
  giftFromStudio: vi.fn()
}))

import { getMyStudio, giftFromStudio } from '~/lib/studio'
import { StudioGiftModal } from './StudioGiftModal'

const getMyStudioMock = vi.mocked(getMyStudio)
const giftFromStudioMock = vi.mocked(giftFromStudio)

const ACCOUNT = '0x' + '0e'.repeat(20)
const PLAYER_A = '0x' + 'a1'.repeat(20)
const PLAYER_B = '0x' + 'b2'.repeat(20)
const studio = {
  id: '0b5f1b1e-6a59-4c4f-9a3e-2f5d3c1b7e01',
  name: 'Pixel Forge',
  status: 'active' as const,
  balanceCents: 1_000_000,
  grantedCents: 0,
  grantCount: 0
}

const recentGifts = (gifts: StudioGift[]) => ({ studio, gifts, total: gifts.length, limits: { maxGrantCents: 50000 } })

/** The dialog as the studio page holds it: the saved batch kept in state and handed back on every change. */
function Harness(props: {
  initial: PendingBatch | null
  onPendingChange: (batch: PendingBatch | null) => void
  onClose: () => void
}) {
  const [pending, setPending] = useState(props.initial)
  return (
    <StudioGiftModal
      studio={studio}
      account={ACCOUNT}
      identity={{} as AuthIdentity}
      maxGrantCents={50000}
      pending={pending}
      onPendingChange={batch => {
        setPending(batch)
        props.onPendingChange(batch)
      }}
      onGifted={vi.fn()}
      onClose={props.onClose}
    />
  )
}

function renderModal(props: { pending?: PendingBatch | null } = {}) {
  const onPendingChange = vi.fn()
  const onClose = vi.fn()
  // A data router, as in the app: the dialog blocks leaving the page while gifts are being sent.
  const router = createMemoryRouter([
    {
      path: '/',
      element: <Harness initial={props.pending ?? null} onPendingChange={onPendingChange} onClose={onClose} />
    }
  ])
  render(<RouterProvider router={router} />)
  return { onPendingChange, onClose }
}

const type = (testId: string, value: string, index = 0) =>
  fireEvent.change(screen.getAllByTestId(testId)[index], { target: { value } })

function fillRow(account: string, credits: string, index = 0) {
  type('studio-gift-account', account, index)
  type('studio-gift-credits', credits, index)
}

beforeEach(() => {
  getMyStudioMock.mockReset()
  getMyStudioMock.mockResolvedValue(recentGifts([]))
  giftFromStudioMock.mockReset()
  window.localStorage.clear()
})

describe('when the total is typed to confirm the gifts', () => {
  beforeEach(async () => {
    renderModal()
    type('studio-gift-shared-reason', 'Top player')
    fillRow(PLAYER_A, '1250')
    fireEvent.click(screen.getByTestId('studio-gift-review'))
    await waitFor(() => expect(screen.getByTestId('studio-gift-send')).toBeInTheDocument())
  })

  it.each(['1,250', '1.250', '1250', ' 1 250 '])('should accept %s, however it is grouped', async typed => {
    type('studio-gift-confirm-total', typed)

    await waitFor(() => expect(screen.getByTestId('studio-gift-send')).toBeEnabled())
    expect(screen.queryByTestId('studio-gift-confirm-mismatch')).not.toBeInTheDocument()
  })

  it('should refuse a total that does not match, and say so', () => {
    type('studio-gift-confirm-total', '125')

    expect({
      sendEnabled: !screen.getByTestId('studio-gift-send').hasAttribute('disabled'),
      mismatch: screen.getByTestId('studio-gift-confirm-mismatch')
    }).toEqual({ sendEnabled: false, mismatch: expect.anything() })
  })
})

describe('when the rows repeat recent gifts of the studio', () => {
  it('should warn about them before the gifts are sent', async () => {
    getMyStudioMock.mockResolvedValue(
      recentGifts([
        {
          creditId: 'c-1',
          recipient: PLAYER_A,
          usdCents: 1000,
          reason: 'Top player',
          grantedBy: ACCOUNT,
          createdAt: Date.now()
        }
      ])
    )
    renderModal()
    type('studio-gift-shared-reason', 'Top player')
    fillRow(PLAYER_A, '100')

    fireEvent.click(screen.getByTestId('studio-gift-review'))

    expect(await screen.findByTestId('studio-gift-repeats')).toHaveTextContent('100 Credits')
  })

  it('should show only what the latest review found, even when an earlier one answers late', async () => {
    let answerFirst: (value: ReturnType<typeof recentGifts>) => void = () => undefined
    getMyStudioMock
      .mockImplementationOnce(() => new Promise(resolve => (answerFirst = resolve)))
      .mockResolvedValueOnce(recentGifts([]))
    renderModal()
    type('studio-gift-shared-reason', 'Top player')
    fillRow(PLAYER_A, '100')
    fireEvent.click(screen.getByTestId('studio-gift-review'))
    fireEvent.click(screen.getByText('Back'))
    fillRow(PLAYER_B, '100')
    fireEvent.click(screen.getByTestId('studio-gift-review'))
    await waitFor(() => expect(getMyStudioMock).toHaveBeenCalledTimes(2))

    answerFirst(
      recentGifts([
        {
          creditId: 'c-1',
          recipient: PLAYER_A,
          usdCents: 1000,
          reason: 'Top player',
          grantedBy: ACCOUNT,
          createdAt: Date.now()
        }
      ])
    )

    await waitFor(() => expect(screen.getByTestId('studio-gift-confirm-total')).toBeInTheDocument())
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(screen.queryByTestId('studio-gift-repeats')).not.toBeInTheDocument()
  })
})

describe('when a row is added and left blank', () => {
  it('should leave it out of the gifts instead of blocking the review', () => {
    renderModal()
    type('studio-gift-shared-reason', 'Top player')
    fillRow(PLAYER_A, '100')

    fireEvent.click(screen.getByTestId('studio-gift-add'))

    expect({
      reviewEnabled: !screen.getByTestId('studio-gift-review').hasAttribute('disabled'),
      summary: screen.getByTestId('studio-gift-summary').textContent
    }).toEqual({ reviewEnabled: true, summary: expect.stringMatching(/^1 player · 100 Credits/) })
  })
})

describe('when the rest of an unfinished list is forgotten', () => {
  const pending: PendingBatch = {
    studioId: studio.id,
    createdAt: 1,
    rows: [
      { key: 'k-1', account: PLAYER_A, credits: 10, reason: 'Top player', status: 'gifted' },
      { key: 'k-2', account: PLAYER_B, credits: 10, reason: 'Top player', status: 'unknown' }
    ]
  }

  beforeEach(() => {
    window.localStorage.setItem(`shop.studio.pendingGifts.${ACCOUNT}.${studio.id}`, JSON.stringify(pending))
  })

  it('should forget it once confirmed, and close', () => {
    vi.spyOn(window, 'confirm').mockReturnValueOnce(true)
    const { onPendingChange, onClose } = renderModal({ pending })

    fireEvent.click(screen.getByTestId('studio-gift-forget'))

    expect({
      cleared: onPendingChange.mock.calls,
      closed: onClose.mock.calls.length,
      stored: window.localStorage.getItem(`shop.studio.pendingGifts.${ACCOUNT}.${studio.id}`)
    }).toEqual({ cleared: [[null]], closed: 1, stored: null })
  })

  it('should keep it when the operator does not confirm', () => {
    vi.spyOn(window, 'confirm').mockReturnValueOnce(false)
    const { onPendingChange, onClose } = renderModal({ pending })

    fireEvent.click(screen.getByTestId('studio-gift-forget'))

    expect({ cleared: onPendingChange.mock.calls.length, closed: onClose.mock.calls.length }).toEqual({
      cleared: 0,
      closed: 0
    })
  })
})

describe('when Stop is pressed while gifts are being sent', () => {
  it('should finish the gift being sent and leave the rest for later', async () => {
    let release: () => void = () => undefined
    giftFromStudioMock.mockImplementationOnce(
      () => new Promise(resolve => (release = () => resolve({ replayed: false })))
    )
    renderModal()
    type('studio-gift-shared-reason', 'Top player')
    fillRow(PLAYER_A, '10')
    fireEvent.click(screen.getByTestId('studio-gift-add'))
    fillRow(PLAYER_B, '20', 1)
    fireEvent.click(screen.getByTestId('studio-gift-review'))
    await waitFor(() => expect(screen.getByTestId('studio-gift-confirm-total')).toBeInTheDocument())
    type('studio-gift-confirm-total', '30')
    await waitFor(() => expect(screen.getByTestId('studio-gift-send')).toBeEnabled())
    fireEvent.click(screen.getByTestId('studio-gift-send'))
    await waitFor(() => expect(giftFromStudioMock).toHaveBeenCalledTimes(1))

    fireEvent.click(screen.getByTestId('studio-gift-stop'))
    release()

    await waitFor(() => expect(screen.getByTestId('studio-gift-stopped')).toBeInTheDocument())
    expect({
      statuses: screen.getAllByTestId('studio-gift-outcome').map(row => row.getAttribute('data-status')),
      sent: giftFromStudioMock.mock.calls.length
    }).toEqual({ statuses: ['gifted', 'notSent'], sent: 1 })
  })
})
