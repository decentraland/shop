import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useEffect } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { FittingRoom } from './FittingRoom'
import { useCart, type CartItem } from '~/store/cart'

// Pin chain (URN prefix) + stub the heavy 3D iframe with a probe that exposes the equipped urns.
vi.mock('~/config', () => ({ config: { chainId: 80002 } }))
vi.mock('~/lib/analytics', () => ({ track: vi.fn() }))
const { session, profileData, fetchWearableRules } = vi.hoisted(() => ({
  session: { value: undefined as { address: string } | undefined },
  profileData: { value: undefined as { avatar?: Record<string, unknown> } | undefined },
  fetchWearableRules: vi.fn()
}))
vi.mock('~/store/wallet', () => ({
  useWallet: (sel: (s: unknown) => unknown) => sel({ session: session.value })
}))
vi.mock('~/hooks/useProfile', () => ({ useProfile: () => ({ data: profileData.value, isFetched: true }) }))
vi.mock('~/lib/wearable-rules', async importOriginal => ({
  ...(await importOriginal<typeof import('~/lib/wearable-rules')>()),
  fetchWearableRules
}))
vi.mock('~/components/LazyWearablePreview', () => ({
  WearablePreview: (p: {
    urns?: string[]
    type?: string
    unity?: boolean
    profile?: string
    bodyShape?: string
    skin?: string
    onLoad?: () => void
  }) => {
    // Fire onLoad async (like the real iframe), not during render.
    useEffect(() => {
      p.onLoad?.()
    }, [p.onLoad])
    return (
      <div
        data-testid="wp"
        data-urns={(p.urns ?? []).join(',')}
        data-type={p.type}
        data-unity={String(!!p.unity)}
        data-profile={p.profile}
        data-bodyshape={p.bodyShape}
        data-skin={p.skin}
      />
    )
  }
}))

function item(over: Partial<CartItem> & { id: string }): CartItem {
  return {
    name: over.id,
    creator: '',
    contractAddress: '0xc',
    itemId: '1',
    category: 'wearable',
    rarity: 'common',
    network: 'MATIC',
    chainId: 80002,
    thumbnail: '',
    priceCredits: 5,
    gender: null,
    isSmart: false,
    quantity: 1,
    ...over
  }
}

const hatA = item({ id: 'a', name: 'Hat A', wearableCategory: 'hat', itemId: '10' })
const hatB = item({ id: 'b', name: 'Hat B', wearableCategory: 'hat', itemId: '11' })
const top = item({ id: 'c', name: 'Jacket', wearableCategory: 'upper_body', itemId: '12' })

function open(items: CartItem[]) {
  useCart.setState({ items, fittingOpen: true })
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <FittingRoom />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

const urnsOf = () => screen.getByTestId('wp').getAttribute('data-urns') ?? ''

beforeEach(() => {
  useCart.setState({ items: [], fittingOpen: false })
  session.value = undefined
  profileData.value = undefined
  fetchWearableRules.mockReset()
  fetchWearableRules.mockResolvedValue([])
})

describe('FittingRoom', () => {
  it('renders nothing when closed', () => {
    useCart.setState({ items: [hatA], fittingOpen: false })
    const { container } = render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <FittingRoom />
        </MemoryRouter>
      </QueryClientProvider>
    )
    expect(container.firstChild).toBeNull()
  })

  it('always previews on the avatar, and not with the Unity renderer', () => {
    open([hatA, top])
    const wp = screen.getByTestId('wp')
    expect(wp).toHaveAttribute('data-type', 'avatar')
    // Unity/aang previews one urn in its marketplace mode and opens on the item-alone view, ignoring `type`.
    expect(wp).toHaveAttribute('data-unity', 'false')
  })

  it('equips one item per slot by default (two hats → only one worn)', () => {
    open([hatA, hatB, top])
    const urns = urnsOf()
    // hat slot has only one urn; the jacket is also on.
    expect(urns).toContain(':12') // jacket
    expect((urns.match(/:1[01]/g) ?? []).length).toBe(1) // exactly one of the two hats
  })

  it('swaps same-slot items when toggling the other one on', async () => {
    open([hatA, hatB, top])
    // hatA is worn by default; turn hatB on → hatA comes off (same slot).
    const rowB = screen.getByText('Hat B').closest('[data-testid="fitting-row"]') as HTMLElement
    await userEvent.click(within(rowB).getByRole('checkbox'))
    const urns = urnsOf()
    expect(urns).toContain(':11') // hatB now on
    expect(urns).not.toContain(':10') // hatA swapped off
  })

  it('flags same-slot items with a conflict hint', () => {
    open([hatA, hatB, top])
    expect(screen.getAllByText(/1 per slot/i)).toHaveLength(2) // both hats
  })

  it("disables the toggle for an emote (can't be worn)", () => {
    const emote = item({ id: 'e', name: 'Dance', category: 'emote', wearableCategory: 'dance', itemId: '99' })
    open([top, emote])
    const emoteRow = screen.getByText('Dance').closest('[data-testid="fitting-row"]') as HTMLElement
    expect(within(emoteRow).getByRole('checkbox')).toBeDisabled()
    expect(urnsOf()).not.toContain(':99') // emote never equipped
  })

  it('removes an item from the cart', async () => {
    open([hatA, top])
    const rowA = screen.getByText('Hat A').closest('[data-testid="fitting-row"]') as HTMLElement
    await userEvent.click(within(rowA).getByRole('button', { name: /remove hat a/i }))
    expect(useCart.getState().items.map(i => i.id)).toEqual(['c'])
  })
})

/**
 * DRESSING THE SHOPPER'S OWN AVATAR.
 *
 * Handing the preview `profile=<address>` lets it load their avatar — and honour what their own wearables
 * hide. An equipped skin covers the whole body, so the hat they opened the fitting room to see rendered
 * nowhere and nothing said why. When something of theirs is in the way we build the list ourselves instead.
 */
describe('FittingRoom — on a real avatar', () => {
  const ADDRESS = '0xshopper'
  const SKIN = 'urn:skin'
  const BROWS = 'urn:brows'

  function withAvatar(wearables: string[]) {
    session.value = { address: ADDRESS }
    profileData.value = {
      avatar: {
        bodyShape: 'urn:decentraland:off-chain:base-avatars:BaseMale',
        wearables,
        skin: { color: { r: 1, g: 0.5, b: 0 } }
      }
    }
  }

  it('should take off the skin that hides the item and keep the rest of the avatar', async () => {
    withAvatar([SKIN, BROWS])
    fetchWearableRules.mockResolvedValue([
      { urn: SKIN, category: 'skin', hides: ['hat'], replaces: [] },
      { urn: BROWS, category: 'eyebrows', hides: [], replaces: [] }
    ])

    open([hatA])
    await vi.waitFor(() =>
      expect(screen.getByTestId('wp')).toHaveAttribute(
        'data-urns',
        `${BROWS},urn:decentraland:amoy:collections-v2:0xc:10`
      )
    )

    const wp = screen.getByTestId('wp')
    // Composed by us, so the address is no longer what the preview loads — and the avatar's own body shape
    // and colours travel with the list, or it would come back as a stranger.
    expect(wp).toHaveAttribute('data-profile', 'default')
    expect(wp).toHaveAttribute('data-bodyshape', 'urn:decentraland:off-chain:base-avatars:BaseMale')
    expect(wp).toHaveAttribute('data-skin', 'ff8000')
  })

  it('should leave the avatar to the preview when nothing of theirs is in the way', async () => {
    withAvatar([BROWS])
    fetchWearableRules.mockResolvedValue([{ urn: BROWS, category: 'eyebrows', hides: [], replaces: [] }])

    open([hatA])
    await vi.waitFor(() => expect(screen.getByTestId('wp')).toHaveAttribute('data-profile', ADDRESS))

    const wp = screen.getByTestId('wp')
    // Only the try-on urn: the rest of the outfit comes from the profile the preview loads.
    expect(wp).toHaveAttribute('data-urns', 'urn:decentraland:amoy:collections-v2:0xc:10')
    expect(wp).not.toHaveAttribute('data-bodyshape')
  })

  it('should fall back to the plain profile when the rules cannot be read', async () => {
    withAvatar([SKIN])
    fetchWearableRules.mockResolvedValue([])

    open([hatA])

    // No rules means we know nothing, and guessing would strip a wearable for no reason.
    await vi.waitFor(() => expect(screen.getByTestId('wp')).toHaveAttribute('data-profile', ADDRESS))
    expect(fetchWearableRules).toHaveBeenCalled()
  })
})
