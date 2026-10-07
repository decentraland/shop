import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import type { SaleableCollection } from '~/lib/saleableCollections'

const announcement = vi.fn()
const dismiss = vi.fn()
const hide = vi.fn()
const track = vi.fn()
vi.mock('~/hooks/useDiscountsAnnouncement', () => ({ useDiscountsAnnouncement: () => announcement() }))
vi.mock('~/lib/analytics', () => ({ track: (...args: unknown[]) => track(...args) }))

import { DiscountsAnnouncementHost } from './DiscountsAnnouncementHost'

const collection: SaleableCollection = {
  contractAddress: '0xaa',
  name: 'Neon Runners',
  listedCount: 1,
  examplePriceCredits: 20,
  items: [{ key: 'a', name: 'Item a', thumbnail: '', priceCredits: 20, state: 'discounted', remainingSupply: 5 }]
}

function Where() {
  const location = useLocation()
  return <span data-testid="where">{location.pathname + location.search}</span>
}

function mount() {
  render(
    <MemoryRouter initialEntries={['/overview']}>
      <DiscountsAnnouncementHost />
      <Routes>
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  announcement.mockReturnValue({ collection, dismiss, hide })
})

describe('when the announcement has a collection to show', () => {
  it('should record that it was shown, once', async () => {
    mount()
    await screen.findByTestId('discounts-announcement')
    // Reported from the dialog's mount effect, which runs just after it reaches the DOM.
    await waitFor(() =>
      expect(track.mock.calls.filter(call => call[0] === 'Shop Discounts Announcement Shown')).toEqual([
        ['Shop Discounts Announcement Shown', { collection: '0xaa' }]
      ])
    )
  })

  it('should open the discount flow on that collection, in the store, leaving the store to retire it', async () => {
    mount()
    fireEvent.click(await screen.findByTestId('discounts-announcement-create'))
    expect(hide).toHaveBeenCalledOnce()
    expect(dismiss).not.toHaveBeenCalled()
    expect(track).toHaveBeenCalledWith('Shop Discounts Announcement Clicked', { collection: '0xaa' })
    expect(screen.getByTestId('where').textContent).toBe('/my-store?tab=collections&discount=0xaa')
  })

  it('should retire itself when put off for later', async () => {
    mount()
    fireEvent.click(await screen.findByTestId('discounts-announcement-later'))
    expect(dismiss).toHaveBeenCalledOnce()
    expect(track).toHaveBeenCalledWith('Shop Discounts Announcement Dismissed', { collection: '0xaa' })
  })
})

describe('when there is nothing to announce', () => {
  it('should render nothing', () => {
    announcement.mockReturnValue({ collection: null, dismiss, hide })
    mount()
    expect(screen.queryByTestId('discounts-announcement')).toBeNull()
    expect(track).not.toHaveBeenCalled()
  })
})
