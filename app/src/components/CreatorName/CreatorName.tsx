import { useProfile } from '~/hooks/useProfile'
import { shortAddress } from '~/lib/address'
import { capitalizeFirst } from '~/lib/text'
import { t } from '~/intl/i18n'

/**
 * Text-only "By {creator}" line for the buy-modal / cart line rows (Figma 1179-182656 shows a bare
 * "By Soul Magic" — no avatar). Resolves the creator address → DCL profile display name via the shared
 * useProfile query (dedupes with the cards + CreatorBadge elsewhere), falling back to a truncated
 * address only when the profile has no name.
 */
export function CreatorName({ address, ...rest }: { address: string } & React.HTMLAttributes<HTMLDivElement>) {
  const { data, isLoading } = useProfile(address)
  // The truncated address is the answer for a creator with NO profile name — it is not a loading state.
  // Rendering it while the lookup is still in flight made a freshly-loaded browse grid publish a raw
  // `0x…` line on every card (measured: 48/48) and then swap each one for the real name as the Catalyst
  // replies. Hold the line's height with a blank for that window so the value is written once. `isLoading`
  // (not `isPending`) is what distinguishes it: a query disabled for a missing address stays pending
  // forever and must still fall through rather than render a permanent blank.
  if (isLoading) return <div {...rest}>&nbsp;</div>
  const name = data?.name ? capitalizeFirst(data.name) : shortAddress(address)
  return <div {...rest}>{t('search.byCreator', { name })}</div>
}

export default CreatorName
