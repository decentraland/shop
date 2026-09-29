import { useQuery } from '@tanstack/react-query'
import { fetchCreatorCollections } from '~/lib/collections'

/**
 * Whether this account has published a collection.
 *
 * `first: 1` — only the total is read, so this costs one small request and answers a question the store
 * dashboard's nav entry depends on: to a buyer that page is an empty room.
 *
 * Deliberately the PUBLIC collections feed rather than the builder one: the builder's needs a signed
 * identity and returns the creator's drafts too, and "has published something" is the question here.
 */
export function useIsCreator(address: string | undefined): boolean {
  const { data } = useQuery({
    queryKey: ['is-creator', address],
    enabled: !!address,
    queryFn: () => fetchCreatorCollections(address as string, { first: 1 }).then(page => page.total > 0),
    staleTime: 5 * 60_000
  })
  return data === true
}
