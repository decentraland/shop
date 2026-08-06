import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
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
    fireEvent.click(screen.getByTestId('import-list-all'))
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

  /**
   * The FAQ is the reason this page gets pasted to creators, and "all set" is exactly when it stops being a
   * to-do list and becomes reference. The early return used to stop at the empty card, so reaching all-set
   * took the explanation away at the moment it became shareable.
   */
  it('should still show the credits FAQ below the all-set state', () => {
    useImportable.mockReturnValue({ items: [], count: 0, isLoading: false })
    renderTool()

    expect(screen.getByTestId('import-empty')).toBeInTheDocument()
    expect(screen.getByText('Learn More About Credits')).toBeInTheDocument()
    expect(screen.getByText('What are Credits?')).toBeInTheDocument()
  })
})

/**
 * The server builds this feed from a materialized view on a 30s debounce, so asking it again the instant a
 * migration is signed gets the state from before the signature. That refetch is what kept re-adding the
 * rows the seller had just moved, so "all set" never arrived — and the 5-minute staleTime then pinned the
 * wrong answer in place. These cover the cache surgery that replaced it.
 */
describe('when a migration lands ahead of the server view', () => {
  const KEY = ['importable', session.address]
  const IMPORTABLE = { queryKey: ['importable'] }

  /**
   * `stale: true` makes every refetch answer the way the materialized view does inside its window — with
   * the migrated rows still on the list. That is the condition the ladder exists for, so it has to be
   * simulated rather than assumed: the real client would otherwise just return the pruned cache.
   */
  function renderWithCache({ stale = false } = {}) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    client.setQueryData(KEY, { creations: ITEMS, owned: [] })
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    // Counted by key, not by call: invalidateQueries goes through refetchQueries internally, so the six
    // grid refreshes at the end of the run would otherwise read as the tool interrogating the server.
    let asked = 0
    vi.spyOn(client, 'refetchQueries').mockImplementation(async (filters?: { queryKey?: readonly unknown[] }) => {
      if (filters?.queryKey?.[0] !== 'importable') return
      asked++
      if (stale) client.setQueryData(KEY, { creations: ITEMS, owned: [] })
    })
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <ImportListings />
        </MemoryRouter>
      </QueryClientProvider>
    )
    return { client, invalidate, asked: () => asked }
  }

  function rowsLeft(client: QueryClient) {
    return (client.getQueryData(KEY) as { creations: ImportItem[] }).creations.map(r => r.oldTradeId)
  }

  function run(label: string) {
    fireEvent.click(screen.getByTestId('import-list-all'))
    fireEvent.click(screen.getByRole('button', { name: label }))
  }

  it('should drop the listed rows from the cache instead of asking the server again', () => {
    const { client, invalidate, asked } = renderWithCache()
    run('finish clean')

    expect(rowsLeft(client)).toEqual([])
    // Asking on the way out is the bug: the answer is still pre-signature, so it undoes the prune above.
    expect(invalidate).not.toHaveBeenCalledWith(IMPORTABLE)
    expect(asked()).toBe(0)
  })

  // A decline is the seller saying no, not a migration. Those listings are still live, and pruning them
  // put the tool on a false "all set" until the reconcile brought them back.
  it('should keep every row the seller declined', () => {
    const { client } = renderWithCache()
    run('finish cancelled')

    expect(rowsLeft(client)).toEqual(['old-1', 'old-2', 'old-3'])
  })

  // Same for a partly failed run: the result carries counts, not which row was which, so there is no
  // honest way to pick the survivors — leave them all and let the server answer.
  it('should keep every row when only part of the run went through', () => {
    const { client } = renderWithCache()
    run('finish partial')

    expect(rowsLeft(client)).toEqual(['old-1', 'old-2', 'old-3'])
  })

  describe('and the reconcile ladder runs', () => {
    beforeEach(() => vi.useFakeTimers())
    afterEach(() => vi.useRealTimers())

    it('should ask the server again once the view has had time to settle', async () => {
      const { asked } = renderWithCache()
      run('finish clean')

      await vi.advanceTimersByTimeAsync(5_000)
      expect(asked()).toBe(1)
    })

    // The ladder is a ceiling, not a schedule: one agreeing answer ends it.
    it('should stop asking as soon as the server agrees', async () => {
      const { asked } = renderWithCache()
      run('finish clean')

      await vi.advanceTimersByTimeAsync(5_000)
      expect(asked()).toBe(1)

      await vi.advanceTimersByTimeAsync(60_000)
      expect(asked()).toBe(1)
    })

    /**
     * The regression the re-prune exists for. A refetch inside the view's window writes the migrated rows
     * straight back, so without pruning again the tool would flash the whole list back at 5s — exactly the
     * bug being fixed, just later than before.
     */
    it('should keep the migrated rows out of the tool while the server is still catching up', async () => {
      const { client, asked } = renderWithCache({ stale: true })
      run('finish clean')

      await vi.advanceTimersByTimeAsync(5_000)
      expect(rowsLeft(client)).toEqual([])
      expect(asked()).toBe(1)

      // …and it books the next rung rather than settling for its own guess.
      await vi.advanceTimersByTimeAsync(10_000)
      expect(rowsLeft(client)).toEqual([])
      expect(asked()).toBe(2)
    })

    // If the server is still calling them importable after the last rung, it is no longer our place to
    // argue: the rows come back rather than the tool insisting on a state nothing else agrees with.
    it("should take the server's word for it once the rungs run out", async () => {
      const { client, asked } = renderWithCache({ stale: true })
      run('finish clean')

      await vi.advanceTimersByTimeAsync(35_000)
      expect(asked()).toBe(3)
      expect(rowsLeft(client)).toEqual(['old-1', 'old-2', 'old-3'])

      await vi.advanceTimersByTimeAsync(60_000)
      expect(asked()).toBe(3)
    })

    /**
     * A seller who leaves rows unticked can come straight back for them, and that second run restarts the
     * ladder. The first run's ids have to survive the restart, or the next refetch writes those rows back
     * with nothing left that knows to prune them out again.
     */
    it('should keep rows from an earlier run out when a second run restarts the ladder', async () => {
      const { client, asked } = renderWithCache({ stale: true })

      // Move Galaxy Hat on its own…
      fireEvent.click(row('Nebula Jacket'))
      fireEvent.click(row('Comet Boots'))
      run('finish clean')
      expect(rowsLeft(client)).toEqual(['old-2', 'old-3'])

      // …then Nebula Jacket on its own, before the server has caught up with either.
      fireEvent.click(row('Galaxy Hat'))
      fireEvent.click(row('Nebula Jacket'))
      run('finish clean')

      await vi.advanceTimersByTimeAsync(5_000)
      expect(rowsLeft(client)).toEqual(['old-3'])
      expect(asked()).toBe(1)
    })
  })
})
