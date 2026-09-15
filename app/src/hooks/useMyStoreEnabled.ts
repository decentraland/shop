import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { getIsMyStoreEnabled } from '~/lib/featureFlags'

/**
 * Whether the creator's store dashboard is on, with the read's own state.
 *
 * The page needs the difference between "off" and "not answered yet": it closes itself when the flag says
 * no, and a pending read that defaulted to no would bounce every visitor off the page before the file
 * arrives.
 */
export function useMyStoreFlag(): UseQueryResult<boolean> {
  return useQuery({ queryKey: ['flag', 'shop-my-store'], queryFn: getIsMyStoreEnabled })
}

/**
 * Whether the creator's store dashboard is on.
 *
 * Fails closed while the answer is in flight, so the nav entry never flashes in and out on a slow flag
 * read — a link that appears a beat late is worse than one that appears once.
 */
export function useMyStoreEnabled(): boolean {
  return useMyStoreFlag().data === true
}
