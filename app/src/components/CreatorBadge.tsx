import { useProfile } from '~/hooks/useProfile'

// Show a creator/seller by their DCL profile (avatar + name), falling back to a short address.
// Uses the shared useProfile query so many cards with the same creator dedupe to one fetch.
function shortAddress(addr: string): string {
  return /^0x[a-fA-F0-9]{40}$/.test(addr) ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr
}

export function CreatorBadge({ address, className }: { address?: string; className?: string }) {
  const { data } = useProfile(address)
  if (!address) return null
  const name = data?.name || shortAddress(address)
  const face = data?.avatar?.snapshots?.face256
  return (
    <span className={`creator${className ? ` ${className}` : ''}`}>
      {face ? (
        <img className="creator__ava" src={face} alt="" loading="lazy" />
      ) : (
        <span className="creator__ava creator__ava--ph" aria-hidden />
      )}
      <span className="creator__name">By {name}</span>
    </span>
  )
}
