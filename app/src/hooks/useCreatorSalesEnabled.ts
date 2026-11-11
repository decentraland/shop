import { useQuery } from '@tanstack/react-query'

import { FeatureFlag, getIsFeatureEnabled } from '~/lib/featureFlags'

/**
 * Whether the Shop shows creators the "put on sale" flow and their running sales.
 *
 * `false` while loading, on error and for the absent flag, which is also the shipped default, so a slow flag
 * read never flashes a control the release is not meant to have.
 */
export function useCreatorSalesEnabled(): boolean {
  const { data } = useQuery({
    queryKey: ['feature-flag', FeatureFlag.SHOP_CREATOR_SALES],
    queryFn: () => getIsFeatureEnabled(FeatureFlag.SHOP_CREATOR_SALES),
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    retry: 1
  })

  return data === true
}

/**
 * Whether creator coupons also discount MANA listings for buyers. Both flags, like the catalogue request: a
 * creator is only offered a discount on a MANA listing when a buyer would actually see it.
 */
export function useLegacyCouponsEnabled(): boolean | undefined {
  const creatorSales = useCreatorSalesEnabled()
  const { data, isPending } = useQuery({
    queryKey: ['feature-flag', FeatureFlag.SHOP_LEGACY_COUPONS],
    queryFn: () => getIsFeatureEnabled(FeatureFlag.SHOP_LEGACY_COUPONS),
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    retry: 1
  })

  // Undefined while it loads, so a surface that would flip MANA listings from blocked to discountable can wait.
  if (!creatorSales) return false
  return isPending ? undefined : data === true
}
