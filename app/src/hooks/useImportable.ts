import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useWallet } from '~/store/wallet'
import { fetchImportable, type ImportItem } from '~/lib/import'
import { useSecondaryListings } from '~/hooks/useSecondaryListings'

/**
 * The signed-in seller's classic (MANA-priced) listings the Shop can take over, as ONE flat list.
 *
 * `count` stays `undefined` until the answer is known, so a caller can tell "none" apart from "not yet"
 * — the migration chip has to render nothing at all in the second case, and a zero is not nothing.
 */
export function useImportable(): { items: ImportItem[]; count: number | undefined; isLoading: boolean } {
  const address = useWallet(s => s.session?.address)
  const secondaryListings = useSecondaryListings()

  const { data, isLoading } = useQuery({
    queryKey: ['importable', address],
    queryFn: () => fetchImportable(address as string),
    enabled: !!address,
    // Which listings a seller still has on the old pricing changes only when they migrate one (which
    // invalidates this key) or list one elsewhere. Re-reading it per mount bought nothing and cost an
    // oracle read on top of the fetch, since lib/import prices every row on the way out.
    staleTime: 5 * 60_000
  })

  // The secondary half is dropped unless the Shop TAKES resale listings. Importing one creates a Shop
  // listing, so this is the seller's permission (`useSecondaryListings`) and never the buyer's — the Shop
  // can be selling other people's resales while still refusing to hold any of its own. Both the count and
  // the tool's rows come from this one list, so the badge can never promise more rows than the tool shows.
  const items = useMemo(
    () => [...(data?.creations ?? []), ...(secondaryListings ? (data?.owned ?? []) : [])],
    [data, secondaryListings]
  )

  return { items, count: data ? items.length : undefined, isLoading }
}
