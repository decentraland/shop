import { useFollows } from '~/store/follows'
import { Button } from '~/components/Button'
import { t } from '~/intl/i18n'

// Follow / Following toggle for a creator. Client-side only (localStorage) — see store/follows.
// Reuses the shared button styles: outlined when not following, ghost once followed.
export function FollowButton({ address, className = '' }: { address: string; className?: string }) {
  const following = useFollows(s => s.followed.includes(address.toLowerCase()))
  const toggle = useFollows(s => s.toggle)

  if (!address) return null

  return (
    <Button
      type="button"
      size="sm"
      variant={following ? 'ghost' : 'outline'}
      className={className || undefined}
      aria-pressed={following}
      title={following ? t('creator.unfollowTitle') : t('creator.followTitle')}
      onClick={() => toggle(address)}
    >
      {following ? t('creator.following') : t('creator.follow')}
    </Button>
  )
}

export default FollowButton
