import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactElement } from 'react'

// The two network libs the control drives — mocked so we assert the calls, not the transport.
const { getNotifyRequest, createNotifyRequest, isNotifyAvailable, getConnectionEmail } = vi.hoisted(() => ({
  getNotifyRequest: vi.fn(),
  createNotifyRequest: vi.fn(),
  isNotifyAvailable: vi.fn(),
  getConnectionEmail: vi.fn()
}))
vi.mock('~/lib/notify', () => ({ getNotifyRequest, createNotifyRequest, isNotifyAvailable }))
// Mocked so the tracking side-effect can be asserted, and so the test can prove the email never rides it.
vi.mock('~/lib/analytics', () => ({ track: vi.fn() }))
vi.mock('~/lib/auth', async importOriginal => {
  const actual = await importOriginal<typeof import('~/lib/auth')>()
  return { ...actual, getConnectionEmail }
})

import { NotifyMe } from './NotifyMe'
import { track } from '~/lib/analytics'
import { useWallet } from '~/store/wallet'

const trackMock = vi.mocked(track)
import type { CatalogItem } from '~/lib/api'

function makeItem(overrides: Partial<CatalogItem> = {}): CatalogItem {
  return {
    id: 't1',
    name: 'Starry Shades',
    creator: '',
    contractAddress: '0xc',
    itemId: '5',
    category: 'wearable',
    rarity: 'legendary',
    network: 'MATIC',
    chainId: 80002,
    thumbnail: '',
    priceCredits: 0,
    gender: null,
    isSmart: false,
    ...overrides
  }
}

function renderNotify(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

beforeEach(() => {
  getNotifyRequest.mockReset().mockResolvedValue({ subscribed: false })
  createNotifyRequest.mockReset().mockResolvedValue(undefined)
  isNotifyAvailable.mockReset().mockReturnValue(true)
  getConnectionEmail.mockReset().mockResolvedValue(undefined)
  useWallet.setState({ session: null })
})
afterEach(() => {
  useWallet.setState({ session: null })
})

describe('NotifyMe', () => {
  it('shows a sign-in CTA (no email field) for a guest and opens the sign-in flow', () => {
    const signIn = vi.fn()
    useWallet.setState({ session: null, signIn })
    renderNotify(<NotifyMe item={makeItem()} />)

    expect(screen.getByTestId('notify-signin')).toBeTruthy()
    expect(screen.queryByTestId('notify-email')).toBeNull()
    fireEvent.click(screen.getByTestId('notify-signin'))
    expect(signIn).toHaveBeenCalledTimes(1)
  })

  it('submits the notify request for a signed-in user and confirms the subscription', async () => {
    useWallet.setState({ session: { address: '0xme', identity: {} } as never })
    renderNotify(<NotifyMe item={makeItem({ contractAddress: '0xc', itemId: '5', chainId: 80002 })} />)

    const input = await screen.findByTestId('notify-email')
    fireEvent.change(input, { target: { value: 'jane.doe@example.com' } })
    fireEvent.click(screen.getByTestId('notify-submit'))

    await waitFor(() => expect(createNotifyRequest).toHaveBeenCalledTimes(1))
    expect(createNotifyRequest.mock.calls[0][0]).toEqual({
      contractAddress: '0xc',
      itemId: '5',
      chainId: 80002,
      email: 'jane.doe@example.com'
    })
    await screen.findByTestId('notify-subscribed')
  })

  it('renders nothing when no shop-server host is configured — a subscription could not be stored', () => {
    isNotifyAvailable.mockReturnValue(false)
    useWallet.setState({ session: { address: '0xme', identity: {} } as never })
    const { container } = renderNotify(<NotifyMe item={makeItem()} />)

    expect(container.firstChild).toBeNull()
    expect(getNotifyRequest).not.toHaveBeenCalled()
  })

  it('renders the already-subscribed state (no input) when the account is already on the list', async () => {
    getNotifyRequest.mockResolvedValue({ subscribed: true, email: 'jane.doe@example.com' })
    useWallet.setState({ session: { address: '0xme', identity: {} } as never })
    renderNotify(<NotifyMe item={makeItem()} />)

    await screen.findByTestId('notify-subscribed')
    expect(screen.queryByTestId('notify-email')).toBeNull()
  })
})

describe('tracking notify requests', () => {
  beforeEach(() => {
    trackMock.mockClear()
    isNotifyAvailable.mockReturnValue(true)
    getNotifyRequest.mockResolvedValue({ subscribed: false })
    createNotifyRequest.mockResolvedValue(undefined)
  })

  it('records the request against the item, and never carries the email', async () => {
    useWallet.setState({ session: { address: '0xme', identity: {} } as never })
    renderNotify(<NotifyMe item={makeItem({ contractAddress: '0xc', itemId: '5', chainId: 80002 })} />)

    fireEvent.change(await screen.findByTestId('notify-email'), { target: { value: 'jane.doe@example.com' } })
    fireEvent.click(screen.getByTestId('notify-submit'))

    await waitFor(() =>
      expect(trackMock).toHaveBeenCalledWith('Shop Requested Notify', { item_id: '5', contract_address: '0xc' })
    )
    expect(JSON.stringify(trackMock.mock.calls)).not.toContain('@')
  })

  it('records nothing when the request fails', async () => {
    createNotifyRequest.mockRejectedValueOnce(new Error('nope'))
    useWallet.setState({ session: { address: '0xme', identity: {} } as never })
    renderNotify(<NotifyMe item={makeItem({ contractAddress: '0xc', itemId: '5', chainId: 80002 })} />)

    fireEvent.change(await screen.findByTestId('notify-email'), { target: { value: 'jane.doe@example.com' } })
    fireEvent.click(screen.getByTestId('notify-submit'))

    await waitFor(() => expect(createNotifyRequest).toHaveBeenCalled())
    expect(trackMock).not.toHaveBeenCalled()
  })
})
