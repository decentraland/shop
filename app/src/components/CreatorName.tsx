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
export function CreatorName({ address, className }: { address: string; className?: string }) {
  const { data } = useProfile(address)
  const name = data?.name ? capitalizeFirst(data.name) : shortAddress(address)
  return <div className={className}>{t('search.byCreator', { name })}</div>
}

export default CreatorName
