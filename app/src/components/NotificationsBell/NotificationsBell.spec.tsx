import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ShopNotification } from '~/lib/notifications'

const session = {
  address: '0xabc0000000000000000000000000000000000abc',
  chainId: 80002,
  signer: {} as never,
  web3Provider: {} as never,
  identity: { id: 'identity' } as never,
  providerType: 'injected' as never
}

let walletState: { session: typeof session | null }
vi.mock('~/store/wallet', () => ({
  useWallet: (sel?: (s: typeof walletState) => unknown) => (sel ? sel(walletState) : walletState)
}))

const fetchNotifications = vi.fn()
const markNotificationsRead = vi.fn()
vi.mock('~/lib/notifications', () => ({
  fetchNotifications: (...args: unknown[]) => fetchNotifications(...args),
  markNotificationsRead: (...args: unknown[]) => markNotificationsRead(...args)
}))

// The rows are decentraland-ui2's per-type renderers (MUI). Stubbed here so this spec is about the
// PANEL — its list, its order and its unread state — and doesn't need a MUI theme provider. The real
// renderers are driven in e2e/notifications.e2e.ts.
vi.mock('decentraland-ui2/dist/components/Notifications/utils', () => {
  const Row = ({ notification }: { notification: ShopNotification }) => (
    <div data-testid={`row-${notification.id}`}>{String((notification.metadata as { nftName: string }).nftName)}</div>
  )
  return { NotificationComponentByType: { item_sold: Row, royalties_earned: Row } }
})

import { NotificationsBell } from './NotificationsBell'

function notification(id: string, over: Partial<ShopNotification> = {}): ShopNotification {
  return {
    id,
    type: 'item_sold',
    address: session.address,
    timestamp: 1_750_000_000_000,
    read: true,
    created_at: '2026-06-15T10:00:00.000Z',
    updated_at: '2026-06-15T10:00:00.000Z',
    metadata: { nftName: `Item ${id}`, link: '/activity' },
    ...over
  }
}

// No MUI provider: the ui2 rows (the only part that needs one) are stubbed above, and the shop's own
// styled layer imports the theme directly.
function renderBell() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <NotificationsBell />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  walletState = { session }
  fetchNotifications.mockReset().mockResolvedValue([])
  markNotificationsRead.mockReset().mockResolvedValue(undefined)
})

describe('NotificationsBell', () => {
  it('renders nothing when signed out — there is no one to notify', () => {
    walletState = { session: null }
    renderBell()
    expect(screen.queryByTestId('notifications-bell')).toBeNull()
  })

  describe('when the panel is opened', () => {
    it('renders a single chronological list, newest first, with no tab controls', async () => {
      // Deliberately out of order: the panel's order must come from the timestamp, not the array.
      fetchNotifications.mockResolvedValue([
        notification('third', { timestamp: 1_000 }),
        notification('first', { timestamp: 3_000 }),
        notification('second', { timestamp: 2_000 })
      ])
      renderBell()
      await userEvent.click(await screen.findByTestId('notifications-bell'))

      const rows = await screen.findAllByTestId('notification-item')
      expect(rows.map(r => r.querySelector('[data-testid^="row-"]')?.getAttribute('data-testid'))).toEqual([
        'row-first',
        'row-second',
        'row-third'
      ])
      // One list, not one per tab.
      expect(screen.getAllByTestId('notifications-list')).toHaveLength(1)
      // No seen/unseen switch of any kind: no tab roles, and none of the tab copy.
      expect(screen.queryAllByRole('tab')).toHaveLength(0)
      expect(screen.queryAllByRole('tablist')).toHaveLength(0)
      expect(screen.queryByText(/newest/i)).toBeNull()
      expect(screen.queryByText(/^read$/i)).toBeNull()
      expect(screen.queryByText(/previous/i)).toBeNull()
    })

    it('marks unread rows and leaves read ones alone', async () => {
      fetchNotifications.mockResolvedValue([
        notification('unread-a', { timestamp: 3_000, read: false }),
        notification('read-b', { timestamp: 2_000, read: true }),
        notification('unread-c', { timestamp: 1_000, read: false })
      ])
      renderBell()
      await userEvent.click(await screen.findByTestId('notifications-bell'))

      const rows = await screen.findAllByTestId('notification-item')
      expect(rows.map(r => r.getAttribute('data-unread'))).toEqual(['true', 'false', 'true'])
    })

    it('skips a notification type it has no renderer for instead of blanking the panel', async () => {
      fetchNotifications.mockResolvedValue([
        notification('known', { timestamp: 2_000 }),
        notification('alien', { timestamp: 1_000, type: 'some_future_type' })
      ])
      renderBell()
      await userEvent.click(await screen.findByTestId('notifications-bell'))

      expect(await screen.findAllByTestId('notification-item')).toHaveLength(1)
      expect(screen.getByTestId('row-known')).toBeTruthy()
    })

    it('shows the empty state when the service has nothing', async () => {
      renderBell()
      await userEvent.click(await screen.findByTestId('notifications-bell'))
      expect(await screen.findByTestId('notifications-empty')).toHaveTextContent(/no notifications yet/i)
      expect(screen.queryAllByTestId('notification-item')).toHaveLength(0)
    })
  })

  describe('the unread badge', () => {
    it('counts only the unread ones', async () => {
      fetchNotifications.mockResolvedValue([
        notification('a', { read: false }),
        notification('b', { read: false }),
        notification('c', { read: true })
      ])
      renderBell()
      expect(await screen.findByTestId('notifications-badge')).toHaveTextContent('2')
    })

    it('caps the count at 99+', async () => {
      fetchNotifications.mockResolvedValue(
        Array.from({ length: 120 }, (_, i) => notification(`n${i}`, { read: false, timestamp: i }))
      )
      renderBell()
      expect(await screen.findByTestId('notifications-badge')).toHaveTextContent('99+')
    })

    it('is absent when everything has been read', async () => {
      fetchNotifications.mockResolvedValue([notification('a', { read: true })])
      renderBell()
      await screen.findByTestId('notifications-bell')
      await waitFor(() => expect(fetchNotifications).toHaveBeenCalled())
      expect(screen.queryByTestId('notifications-badge')).toBeNull()
    })
  })

  // With the tabs gone the unread dot is the only thing that says which rows are new, so marking has to
  // wait for the panel to close — which is also what the marketplace does.
  describe('mark as read', () => {
    it('does NOT mark anything read merely by opening the panel', async () => {
      fetchNotifications.mockResolvedValue([notification('a', { read: false })])
      renderBell()
      await userEvent.click(await screen.findByTestId('notifications-bell'))

      const [row] = await screen.findAllByTestId('notification-item')
      expect(row.getAttribute('data-unread')).toBe('true')
      expect(screen.getByTestId('notifications-badge')).toHaveTextContent('1')
      expect(markNotificationsRead).not.toHaveBeenCalled()
    })

    it('marks the unread ones read when the panel closes', async () => {
      fetchNotifications.mockResolvedValue([
        notification('unread-a', { timestamp: 2_000, read: false }),
        notification('read-b', { timestamp: 1_000, read: true })
      ])
      renderBell()
      const bell = await screen.findByTestId('notifications-bell')
      await userEvent.click(bell)
      await screen.findAllByTestId('notification-item')
      await userEvent.click(bell)

      await waitFor(() => expect(markNotificationsRead).toHaveBeenCalledTimes(1))
      // Only the unread id is sent, and only once.
      expect(markNotificationsRead.mock.calls[0][1]).toEqual(['unread-a'])
      // The cache flipped optimistically, so reopening shows nothing unread and the badge is gone.
      expect(screen.queryByTestId('notifications-badge')).toBeNull()
      await userEvent.click(bell)
      const rows = await screen.findAllByTestId('notification-item')
      expect(rows.map(r => r.getAttribute('data-unread'))).toEqual(['false', 'false'])
    })

    it('closes on Escape and marks read on the way out', async () => {
      fetchNotifications.mockResolvedValue([notification('a', { read: false })])
      renderBell()
      await userEvent.click(await screen.findByTestId('notifications-bell'))
      await screen.findAllByTestId('notification-item')

      await userEvent.keyboard('{Escape}')
      await waitFor(() => expect(screen.queryByTestId('notifications-panel')).toBeNull())
      expect(markNotificationsRead).toHaveBeenCalledTimes(1)
    })

    it('closes on an outside click and marks read on the way out', async () => {
      fetchNotifications.mockResolvedValue([notification('a', { read: false })])
      renderBell()
      await userEvent.click(await screen.findByTestId('notifications-bell'))
      await screen.findAllByTestId('notification-item')

      await userEvent.click(document.body)
      await waitFor(() => expect(screen.queryByTestId('notifications-panel')).toBeNull())
      expect(markNotificationsRead).toHaveBeenCalledTimes(1)
    })

    it('does not call the service when there is nothing unread to mark', async () => {
      fetchNotifications.mockResolvedValue([notification('a', { read: true })])
      renderBell()
      const bell = await screen.findByTestId('notifications-bell')
      await userEvent.click(bell)
      await screen.findAllByTestId('notification-item')
      await userEvent.click(bell)

      await waitFor(() => expect(screen.queryByTestId('notifications-panel')).toBeNull())
      expect(markNotificationsRead).not.toHaveBeenCalled()
    })
  })
})
