import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ShopNotification } from '~/lib/notifications'
import { ItemDiscountedNotification } from './ItemDiscountedNotification'

const track = vi.fn()
vi.mock('~/lib/analytics', () => ({ track: (...args: unknown[]) => track(...args) }))

// ui2's row chrome needs a MUI theme; stubbed to the props this component decides.
vi.mock('decentraland-ui2/dist/components/Notifications/NotificationItem', () => ({
  NotificationItemText: (props: { title: ReactNode; description: ReactNode; descriptionHref?: string }) => (
    <div data-testid="row">
      <span data-testid="row-title">{props.title}</span>
      <a data-testid="row-link" data-href={props.descriptionHref} onClick={e => e.preventDefault()}>
        <span data-testid="row-description">{props.description}</span>
      </a>
    </div>
  )
}))
vi.mock('decentraland-ui2/dist/components/Notifications/utils', () => ({ getBGColorByRarity: () => '#000' }))
vi.mock('decentraland-ui2/dist/components/Icon', () => ({ SparklesIcon: () => null }))

function notification(metadata: Record<string, unknown> = {}): ShopNotification {
  return {
    id: 'n1',
    type: 'item_discounted',
    address: '0xabc',
    timestamp: 1_750_000_000_000,
    read: false,
    created_at: '2026-10-09T10:00:00.000Z',
    updated_at: '2026-10-09T10:00:00.000Z',
    metadata: {
      image: 'https://example.com/thumb.png',
      rarity: 'epic',
      nftName: 'Pumpkin Hat',
      contractAddress: '0xcol',
      itemId: '1',
      link: 'https://decentraland.org/shop/item/0xcol/1',
      discountPct: 30,
      listPrice: '1500',
      salePrice: '1050',
      ...metadata
    }
  }
}

beforeEach(() => track.mockReset())

describe('ItemDiscountedNotification', () => {
  it('says which favorite is on sale, by how much and for what price, and links to the item', () => {
    render(<ItemDiscountedNotification notification={notification()} locale="en" renderProfile={a => a} />)
    expect(screen.getByTestId('row-title').textContent).toBe('A favorite is on sale')
    expect(screen.getByTestId('row-description').textContent).toBe(
      'Pumpkin Hat is 30% off: 1,050 Credits instead of 1,500.'
    )
    expect(screen.getByTestId('row-link').getAttribute('data-href')).toBe('https://decentraland.org/shop/item/0xcol/1')
  })

  it('names the item generically when it has no name', () => {
    render(
      <ItemDiscountedNotification
        notification={notification({ nftName: undefined })}
        locale="en"
        renderProfile={a => a}
      />
    )
    expect(screen.getByTestId('row-description').textContent).toMatch(/^An item you saved is 30% off/)
  })

  describe('when the row is clicked', () => {
    it('should track a click on the link with the item and the discount', async () => {
      render(<ItemDiscountedNotification notification={notification()} locale="en" renderProfile={a => a} />)
      await userEvent.click(screen.getByTestId('row-description'))
      expect(track).toHaveBeenCalledWith('Shop Clicked Favorite Discount Notification', {
        contract_address: '0xcol',
        item_id: '1',
        discount_pct: 30
      })
    })

    it('should not track a click outside the link', async () => {
      render(<ItemDiscountedNotification notification={notification()} locale="en" renderProfile={a => a} />)
      await userEvent.click(screen.getByTestId('row-title'))
      expect(track).not.toHaveBeenCalled()
    })
  })

  describe('when the metadata is unusable', () => {
    it.each([
      ['a missing sale price', { salePrice: undefined }],
      ['a non-numeric list price', { listPrice: 'abc' }],
      ['a missing discount', { discountPct: undefined }],
      ['an out-of-range discount', { discountPct: 150 }],
      ['a non-https link', { link: 'javascript:alert(1)' }]
    ])('should render nothing for %s', (_label, metadata) => {
      render(<ItemDiscountedNotification notification={notification(metadata)} locale="en" renderProfile={a => a} />)
      expect(screen.queryByTestId('item-discounted-notification')).toBeNull()
    })

    it('should still render with an unknown rarity, without a rarity color', () => {
      render(
        <ItemDiscountedNotification
          notification={notification({ rarity: 'bogus' })}
          locale="en"
          renderProfile={a => a}
        />
      )
      expect(screen.getByTestId('item-discounted-notification')).toBeTruthy()
    })
  })
})
