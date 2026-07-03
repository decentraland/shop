import { useNavigate } from 'react-router-dom'
import { useProfile } from '~/hooks/useProfile'

// Show a creator/seller by their DCL profile (avatar + name), falling back to a short address.
// Uses the shared useProfile query so many cards with the same creator dedupe to one fetch.
// `linkToProfile` makes it clickable → the creator's storefront (/creator/:address); it stops
// propagation so it works inside a clickable card without also opening the item.
function shortAddress(addr: string): string {
  return /^0x[a-fA-F0-9]{40}$/.test(addr) ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr
}

export function CreatorBadge({
  address,
  className,
  linkToProfile
}: {
  address?: string
  className?: string
  linkToProfile?: boolean
}) {
  const navigate = useNavigate()
  const { data } = useProfile(address)
  if (!address) return null
  const name = data?.name || shortAddress(address)
  const face = data?.avatar?.snapshots?.face256
  const inner = (
    <>
      {face ? (
        <img className="creator__ava" src={face} alt="" loading="lazy" />
      ) : (
        <span className="creator__ava creator__ava--ph" aria-hidden />
      )}
      <span className="creator__name">By {name}</span>
    </>
  )
  if (linkToProfile) {
    return (
      <button
        className={`creator creator--link${className ? ` ${className}` : ''}`}
        title={`View ${name}`}
        onClick={e => {
          e.stopPropagation()
          navigate(`/creator/${address}`)
        }}
      >
        {inner}
      </button>
    )
  }
  return <span className={`creator${className ? ` ${className}` : ''}`}>{inner}</span>
}
