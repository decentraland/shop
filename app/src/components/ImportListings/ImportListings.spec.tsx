import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ImportItem } from '~/lib/import'

const session = {
  address: '0xabc0000000000000000000000000000000000abc',
  chainId: 80002,
  signer: {} as never,
  web3Provider: {} as never,
  identity: {} as never,
  providerType: 'injected' as never
}

// The tool reaches ~/lib/import through the migrate modal, which pulls decentraland-transactions at
// module load; stub it so the module graph resolves.
vi.mock('decentraland-transactions', () => ({
  ContractName: { OffChainMarketplaceV2: 'OffChainMarketplaceV2' },
  getContract: () => ({ address: '0xmarket', name: 'DecentralandMarketplacePolygon', version: '1', abi: [] })
}))

vi.mock('~/store/wallet', () => ({
  useWallet: (sel?: (s: { session: typeof session | null }) => unknown) => (sel ? sel({ session }) : { session })
}))

const useImportable = vi.fn()
vi.mock('~/hooks/useImportable', () => ({
  useImportable: () => useImportable()
}))

// Stands in for the run itself: the outcomes below are what the real modal reports through onDone, and
// what the tool does with them (which toast, if any) is the thing under test.
vi.mock('~/components/MigrateModal', () => ({
  MigrateModal: ({ onDone }: { onDone: (r: { listed: number; failed: number; cancelled: number }) => void }) => (
    <div>
      <button onClick={() => onDone({ listed: 3, failed: 0, cancelled: 0 })}>finish clean</button>
      <button onClick={() => onDone({ listed: 2, failed: 1, cancelled: 0 })}>finish partial</button>
      <button onClick={() => onDone({ listed: 0, failed: 3, cancelled: 0 })}>finish failed</button>
      <button onClick={() => onDone({ listed: 0, failed: 0, cancelled: 3 })}>finish cancelled</button>
    </div>
  )
}))

import { ImportListings } from './ImportListings'
import { useToast } from '~/store/toast'

function item(overrides: Partial<ImportItem> = {}): ImportItem {
  return {
    oldTradeId: 'old-1',
    listingType: 'primary',
    contractAddress: '0xc0113c7104',
    itemId: '0',
    tokenId: null,
    name: 'Galaxy Hat',
    thumbnail: '',
    rarity: 'epic',
    category: 'wearable',
    wearableCategory: 'hat',
    manaWei: '100000000000000000000',
    available: 100,
    network: 'MATIC',
    chainId: 80002,
    suggestedCredits: 270,
    ...overrides
  }
}

const ITEMS = [
  item(),
  item({ oldTradeId: 'old-2', name: 'Nebula Jacket', suggestedCredits: 135 }),
  item({ oldTradeId: 'old-3', name: 'Comet Boots', suggestedCredits: 60 })
]

function renderTool() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ImportListings />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

function selectAll(): HTMLInputElement {
  return screen.getByTestId('import-select-all')
}
function row(name: string): HTMLInputElement {
  return screen.getByLabelText(`Include ${name}`)
}

beforeEach(() => {
  vi.clearAllMocks()
  useToast.setState({ toasts: [] })
  useImportable.mockReturnValue({ items: ITEMS, count: ITEMS.length, isLoading: false })
})

describe('Select all', () => {
  it('should be a native checkbox named for what it selects', () => {
    renderTool()
    // The visible label is "Select All", which says nothing about WHAT out of context.
    const box: HTMLInputElement = screen.getByLabelText('Select all listings to move')
    expect(box).toBe(selectAll())
    expect(box.type).toBe('checkbox')
  })

  it('should report every row selected when the tool opens', () => {
    renderTool()
    expect(selectAll().checked).toBe(true)
    expect(selectAll().indeterminate).toBe(false)
    for (const name of ['Galaxy Hat', 'Nebula Jacket', 'Comet Boots']) expect(row(name).checked).toBe(true)
  })

  it('should report MIXED — not unchecked — while only some rows are selected', () => {
    renderTool()
    fireEvent.click(row('Nebula Jacket'))

    expect(selectAll().checked).toBe(false)
    // The native property, which is what assistive tech reads as "mixed"; the attribute only drives
    // the dash in CSS.
    expect(selectAll().indeterminate).toBe(true)
    expect(selectAll()).toHaveAttribute('data-indeterminate', 'true')
  })

  it('should report plainly unchecked once no row is selected', () => {
    renderTool()
    for (const name of ['Galaxy Hat', 'Nebula Jacket', 'Comet Boots']) fireEvent.click(row(name))

    expect(selectAll().checked).toBe(false)
    expect(selectAll().indeterminate).toBe(false)
  })

  it('should clear every row when it is ticked, and tick every row again when it is not', () => {
    renderTool()
    fireEvent.click(selectAll())
    for (const name of ['Galaxy Hat', 'Nebula Jacket', 'Comet Boots']) expect(row(name).checked).toBe(false)

    fireEvent.click(selectAll())
    for (const name of ['Galaxy Hat', 'Nebula Jacket', 'Comet Boots']) expect(row(name).checked).toBe(true)
  })

  it('should select ALL rows from a partial selection, not invert it', () => {
    renderTool()
    fireEvent.click(row('Nebula Jacket'))
    fireEvent.click(selectAll())

    for (const name of ['Galaxy Hat', 'Nebula Jacket', 'Comet Boots']) expect(row(name).checked).toBe(true)
    expect(selectAll().indeterminate).toBe(false)
  })

  it('should be operable from the keyboard', async () => {
    const user = userEvent.setup()
    renderTool()
    selectAll().focus()
    await user.keyboard(' ')

    for (const name of ['Galaxy Hat', 'Nebula Jacket', 'Comet Boots']) expect(row(name).checked).toBe(false)
  })

  // Every row the tool shows can be migrated: the one kind of listing that cannot (a resale, while the
  // Shop does not offer resales) is dropped upstream in useImportable, so it is never a row at all.
  // Nothing here is disabled, and Select all therefore has nothing to skip.
  it('should leave no row disabled for it to skip', () => {
    renderTool()
    for (const name of ['Galaxy Hat', 'Nebula Jacket', 'Comet Boots']) expect(row(name).disabled).toBe(false)
  })
})

describe('when the run comes back', () => {
  function finish(label: string) {
    renderTool()
    fireEvent.click(screen.getByRole('button', { name: /list all/i }))
    fireEvent.click(screen.getByRole('button', { name: label }))
    return useToast.getState().toasts
  }

  it('should confirm a clean run', () => {
    expect(finish('finish clean')).toEqual([expect.objectContaining({ kind: 'success' })])
  })

  // The point of the split: a run with a failure in it is never announced as an update, whether or not
  // some items made it through.
  it('should report a failure as one, not as an update', () => {
    expect(finish('finish failed')).toEqual([expect.objectContaining({ kind: 'error' })])
  })

  it('should report a partly failed run as a failure too', () => {
    expect(finish('finish partial')).toEqual([expect.objectContaining({ kind: 'error' })])
  })

  // Declining every prompt is a choice, not an outcome to announce either way.
  it('should say nothing when the seller declined every item', () => {
    expect(finish('finish cancelled')).toEqual([])
  })
})

describe('when the seller has nothing left to move', () => {
  // Reachable now that Activity's chip is gated on HAVING listings rather than on having migratable ones:
  // before, the seller this state is written for could not open the section at all.
  it('should show the all-set state instead of an empty list', () => {
    useImportable.mockReturnValue({ items: [], count: 0, isLoading: false })
    renderTool()

    expect(screen.getByText('You are all set!')).toBeInTheDocument()
    expect(screen.getByText('You can manage your listings from “My Items” section.')).toBeInTheDocument()
    expect(screen.queryByTestId('import-select-all')).not.toBeInTheDocument()
  })

  // The CREATIONS tab, not the page default: My Items opens on Wearables, which is the wrong shelf for a
  // seller who came here to look at the listings they just moved.
  it('should point the way out at My Items, on the creations tab', () => {
    useImportable.mockReturnValue({ items: [], count: 0, isLoading: false })
    renderTool()

    expect(screen.getByRole('link', { name: 'My Items' }).getAttribute('href')).toBe('/my-items?section=creations')
  })
})
