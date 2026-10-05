import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import type { CancelledTrade } from '~/lib/cancelled-trades'

const ADDRESS = '0xabc0000000000000000000000000000000000abc'

let walletAddress: string | undefined
vi.mock('~/store/wallet', () => ({
  useWallet: (sel: (s: { session: { address: string } | null }) => unknown) =>
    sel({ session: walletAddress ? { address: walletAddress } : null })
}))

const useCancelledTrades = vi.fn()
vi.mock('~/hooks/useCancelledTrades', () => ({ useCancelledTrades: () => useCancelledTrades() }))

import { CancelledListingsBanner } from './CancelledListingsBanner'
import { CancelledListingsNotice } from './CancelledListingsNotice'
import { CANCELLED_LISTINGS_PROMPT, dismissPrompt, resetPrompt } from '~/lib/dismissed-prompts'

function rows(...types: CancelledTrade['type'][]): Pick<CancelledTrade, 'id' | 'type'>[] {
  return types.map((type, i) => ({ id: `t-${i}`, type }))
}

describe('when the banner is rendered', () => {
  let onDismiss: ReturnType<typeof vi.fn> | undefined

  beforeEach(() => {
    onDismiss = undefined
  })

  describe('and one listing was taken down', () => {
    beforeEach(() => {
      render(
        <MemoryRouter>
          <CancelledListingsBanner count={1} kind="listings" />
        </MemoryRouter>
      )
    })

    it('should say so in the singular', () => {
      expect(screen.getByTestId('cancelled-listings-banner')).toHaveTextContent(
        'One of your listings was taken down during a store upgrade. Put it back in a few clicks.'
      )
    })

    it('should link to the list of listings', () => {
      expect(screen.getByTestId('cancelled-listings-banner-cta')).toHaveAttribute('href', '/activity?section=listings')
    })

    it('should not offer to dismiss it', () => {
      expect(screen.queryByTestId('cancelled-listings-banner-dismiss')).not.toBeInTheDocument()
    })
  })

  describe('and several offers were taken down', () => {
    beforeEach(() => {
      render(
        <MemoryRouter>
          <CancelledListingsBanner count={3} kind="offers" />
        </MemoryRouter>
      )
    })

    it('should count the offers', () => {
      expect(screen.getByTestId('cancelled-listings-banner')).toHaveTextContent(
        '3 of your offers were taken down during a store upgrade. Put them back in a few clicks.'
      )
    })
  })

  describe('and the caller offers a way to dismiss it', () => {
    beforeEach(async () => {
      onDismiss = vi.fn()
      render(
        <MemoryRouter>
          <CancelledListingsBanner count={2} kind="mixed" onDismiss={onDismiss} />
        </MemoryRouter>
      )
      await userEvent.click(screen.getByTestId('cancelled-listings-banner-dismiss'))
    })

    it('should hand the dismissal back to the caller', () => {
      expect(onDismiss).toHaveBeenCalledTimes(1)
    })
  })
})

describe('when the notice decides whether to show', () => {
  let path: string

  beforeEach(() => {
    walletAddress = ADDRESS
    path = '/overview'
    useCancelledTrades.mockReturnValue({ trades: rows('public_item_order', 'bid'), count: 2 })
  })

  afterEach(() => {
    resetPrompt(CANCELLED_LISTINGS_PROMPT, ADDRESS)
  })

  function renderNotice() {
    render(
      <MemoryRouter initialEntries={[path]}>
        <CancelledListingsNotice />
      </MemoryRouter>
    )
  }

  describe('and the account has taken-down listings', () => {
    beforeEach(() => {
      renderNotice()
    })

    it('should show the banner for the mix it has', () => {
      expect(screen.getByTestId('cancelled-listings-banner')).toHaveAttribute('data-kind', 'mixed')
    })
  })

  describe('and the visitor is signed out', () => {
    beforeEach(() => {
      walletAddress = undefined
      renderNotice()
    })

    it('should show nothing', () => {
      expect(screen.queryByTestId('cancelled-listings-banner')).not.toBeInTheDocument()
    })
  })

  describe('and the count is not known yet', () => {
    beforeEach(() => {
      useCancelledTrades.mockReturnValue({ trades: [], count: undefined })
      renderNotice()
    })

    it('should show nothing', () => {
      expect(screen.queryByTestId('cancelled-listings-banner')).not.toBeInTheDocument()
    })
  })

  describe('and nothing was taken down', () => {
    beforeEach(() => {
      useCancelledTrades.mockReturnValue({ trades: [], count: 0 })
      renderNotice()
    })

    it('should show nothing', () => {
      expect(screen.queryByTestId('cancelled-listings-banner')).not.toBeInTheDocument()
    })
  })

  describe('and the account dismissed it before', () => {
    beforeEach(() => {
      dismissPrompt(CANCELLED_LISTINGS_PROMPT, ADDRESS)
      renderNotice()
    })

    it('should show nothing', () => {
      expect(screen.queryByTestId('cancelled-listings-banner')).not.toBeInTheDocument()
    })
  })

  describe('and the account is already on the list it points to', () => {
    beforeEach(() => {
      path = '/activity?section=listings'
      renderNotice()
    })

    it('should show nothing', () => {
      expect(screen.queryByTestId('cancelled-listings-banner')).not.toBeInTheDocument()
    })
  })

  describe('and the account dismisses it', () => {
    beforeEach(async () => {
      renderNotice()
      await userEvent.click(screen.getByTestId('cancelled-listings-banner-dismiss'))
    })

    it('should hide the banner', () => {
      expect(screen.queryByTestId('cancelled-listings-banner')).not.toBeInTheDocument()
    })

    it('should remember the choice for that account', () => {
      expect(JSON.parse(localStorage.getItem('shop:dismissed-prompts') ?? '{}')).toEqual({
        [ADDRESS]: [CANCELLED_LISTINGS_PROMPT]
      })
    })
  })
})
