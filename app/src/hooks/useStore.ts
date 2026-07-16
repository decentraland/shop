import { useQuery } from '@tanstack/react-query'
import { fetchStore, type CreatorStore } from '~/lib/store'

export type { CreatorStore }

// A creator's store banner data (cover + description + links) for the storefront hero. Cached like
// the profile query — stores change rarely, so a long staleTime avoids refetching on navigation.
export function useStore(address?: string) {
  return useQuery({
    queryKey: ['store', address?.toLowerCase()],
    enabled: !!address,
    staleTime: 5 * 60_000,
    queryFn: (): Promise<CreatorStore> => fetchStore(address!)
  })
}
