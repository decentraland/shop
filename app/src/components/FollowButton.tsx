import { useFollows } from '~/store/follows'

// Follow / Following toggle for a creator. Client-side only (localStorage) — see store/follows.
// Reuses the shared button styles: outlined when not following, ghost once followed.
export function FollowButton({ address, className = '' }: { address: string; className?: string }) {
  const following = useFollows(s => s.followed.includes(address.toLowerCase()))
  const toggle = useFollows(s => s.toggle)

  if (!address) return null

  return (
    <button
      type="button"
      className={`btn btn--sm ${following ? 'btn--ghost' : 'btn--outline'} ${className}`.trim()}
      aria-pressed={following}
      title={following ? 'Unfollow creator' : 'Follow creator'}
      onClick={() => toggle(address)}
    >
      {following ? 'Following' : 'Follow'}
    </button>
  )
}

export default FollowButton
