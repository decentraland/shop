import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useWallet } from '~/store/wallet'
import { fetchImportable, type ImportItem } from '~/lib/import'
import { useSecondarySales } from '~/hooks/useSecondarySales'

/**
 * The signed-in seller's classic (MANA-priced) listings the Shop can take over, as ONE flat list.
 *
 * `count` stays `undefined` until the answer is known, so a caller can tell "none" apart from "not yet"
 * — the migration chip has to render nothing at all in the second case, and a zero is not nothing.
 */
export function useImportable(): { items: ImportItem[]; count: number | undefined; isLoading: boolean } {
  const address = useWallet(s => s.session?.address)
  const secondarySales = useSecondarySales()

  const { data, isLoading } = useQuery({
    queryKey: ['importable', address],
    queryFn: () => fetchImportable(address as string),
    enabled: !!address,
    // Which listings a seller still has on the old pricing changes only when they migrate one (which
    // invalidates this key) or list one elsewhere. Re-reading it per mount bought nothing and cost an
    // oracle read on top of the fetch, since lib/import prices every row on the way out.
    staleTime: 5 * 60_000
  })

  // The secondary half is dropped while resales are off, so no surface can offer to move a resale the
  // Shop does not sell. Both the count and the tool's rows come from this one list, so the badge can
  // never promise more rows than the tool then shows.
  const items = useMemo(
    () => [...(data?.creations ?? []), ...(secondarySales ? (data?.owned ?? []) : [])],
    [data, secondarySales]
  )

  return { items, count: data ? items.length : undefined, isLoading }
}
