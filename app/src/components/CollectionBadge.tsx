import { useNavigate } from 'react-router-dom'

// The collection a PDP item belongs to (avatar + name), linking to the collection storefront. Mirrors
// CreatorBadge's lettered-avatar fallback: collections have no dedicated cover image in the shop feed,
// so we render a deterministic gradient-free coloured initial keyed off the contract address so the
// same collection keeps a stable hue across the app. Renders nothing until the name resolves.

// Deterministic, readable colour derived from the contract (mid lightness so the white initial stays
// legible) — same scheme as CreatorBadge so creator/collection avatars sit consistently side by side.
function colorForAddress(addr: string): string {
  let hash = 0
  for (let i = 0; i < addr.length; i++) hash = (hash * 31 + addr.charCodeAt(i)) >>> 0
  return `hsl(${hash % 360}, 52%, 45%)`
}

export function CollectionBadge({
  contractAddress,
  name,
  className,
}: {
  contractAddress?: string
  name?: string
  className?: string
}) {
  const navigate = useNavigate()
  if (!contractAddress || !name) return null
  const initial = (name.trim()[0] || '?').toUpperCase()
  return (
    <button
      className={`creator creator--link${className ? ` ${className}` : ''}`}
      onClick={e => {
        e.stopPropagation()
        navigate(`/collection/${contractAddress}`)
      }}
    >
      <span
        className="creator__ava creator__ava--letter"
        style={{ backgroundColor: colorForAddress(contractAddress) }}
        aria-hidden
      >
        {initial}
      </span>
      <span className="creator__name">{name}</span>
    </button>
  )
}

export default CollectionBadge
