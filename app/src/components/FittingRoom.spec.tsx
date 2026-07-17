import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useEffect } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { FittingRoom } from './FittingRoom'
import { useCart } from '~/store/cart'
import type { CatalogItem } from '~/lib/api'

// Pin chain (URN prefix) + stub the heavy 3D iframe with a probe that exposes the equipped urns.
vi.mock('~/config', () => ({ config: { chainId: 80002 } }))
vi.mock('~/lib/analytics', () => ({ track: vi.fn() }))
vi.mock('~/store/wallet', () => ({ useWallet: (sel: (s: unknown) => unknown) => sel({ session: undefined }) }))
vi.mock('~/hooks/useProfile', () => ({ useProfile: () => ({ data: undefined }) }))
vi.mock('~/components/LazyWearablePreview', () => ({
  WearablePreview: (p: { urns?: string[]; onLoad?: () => void }) => {
    // Fire onLoad async (like the real iframe), not during render.
    useEffect(() => {
      p.onLoad?.()
    }, [p.onLoad])
    return <div data-testid="wp" data-urns={(p.urns ?? []).join(',')} />
  }
}))

function item(over: Partial<CatalogItem> & { id: string }): CatalogItem {
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
    ...over
  }
}

const hatA = item({ id: 'a', name: 'Hat A', wearableCategory: 'hat', itemId: '10' })
const hatB = item({ id: 'b', name: 'Hat B', wearableCategory: 'hat', itemId: '11' })
const top = item({ id: 'c', name: 'Jacket', wearableCategory: 'upper_body', itemId: '12' })

function open(items: CatalogItem[]) {
  useCart.setState({ items, fittingOpen: true })
  return render(
    <MemoryRouter>
      <FittingRoom />
    </MemoryRouter>
  )
}

const urnsOf = () => screen.getByTestId('wp').getAttribute('data-urns') ?? ''

beforeEach(() => {
  useCart.setState({ items: [], fittingOpen: false })
})

describe('FittingRoom', () => {
  it('renders nothing when closed', () => {
    useCart.setState({ items: [hatA], fittingOpen: false })
    const { container } = render(
      <MemoryRouter>
        <FittingRoom />
      </MemoryRouter>
    )
    expect(container.firstChild).toBeNull()
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
