import { useFollows } from '~/store/follows'
import { Button } from '~/components/Button'
import { useFollowsEnabled } from '~/hooks/useFollowsEnabled'
import { t } from '~/intl/i18n'

// Follow / Following toggle for a creator. Client-side only (localStorage) — see store/follows.
// Reuses the shared button styles: outlined when not following, ghost once followed.
// Gated here rather than at each call site so no consumer can surface follows while the flag is off.
export function FollowButton({ address, className = '' }: { address: string; className?: string }) {
  const enabled = useFollowsEnabled()
  const following = useFollows(s => s.followed.includes(address.toLowerCase()))
  const toggle = useFollows(s => s.toggle)

  if (!enabled || !address) return null

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
