import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProfile } from '~/hooks/useProfile'
import { capitalizeFirst } from '~/lib/text'
import { t } from '~/intl/i18n'

// Show a creator/seller by their DCL profile (avatar + name), falling back to a short address.
// Uses the shared useProfile query so many cards with the same creator dedupe to one fetch.
// `linkToProfile` makes it clickable → the creator's storefront (/assets/creator/:address); it stops
// propagation so it works inside a clickable card without also opening the item.
function shortAddress(addr: string): string {
  return /^0x[a-fA-F0-9]{40}$/.test(addr) ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr
}

// Deterministic, readable color derived from the address so each creator keeps a stable hue across
// the app (mid lightness so the white initial stays legible).
function colorForAddress(addr: string): string {
  let hash = 0
  for (let i = 0; i < addr.length; i++) hash = (hash * 31 + addr.charCodeAt(i)) >>> 0
  return `hsl(${hash % 360}, 52%, 45%)`
}

// The letter shown in the fallback avatar: the profile name's initial, else the first character of the
// address (skipping the 0x prefix). Always uppercase.
function initialFor(name: string | undefined, address: string): string {
  return (name?.trim()?.[0] || address.replace(/^0x/i, '')[0] || '?').toUpperCase()
}

export function CreatorBadge({
  address,
  className,
  linkToProfile,
  hidePrefix
}: {
  address?: string
  className?: string
  linkToProfile?: boolean
  /** Drop the "By " prefix (the PDP shows the bare creator name — see Figma 1052-151285). */
  hidePrefix?: boolean
}) {
  const navigate = useNavigate()
  const { data } = useProfile(address)
  const face = data?.avatar?.snapshots?.face256
  // Some profiles have no face snapshot, or one whose URL 404s (not deployed) — in both cases fall back
  // to a lettered avatar instead of a broken image. `broken` tracks a failed load; reset it when the
  // face url changes because list rows reuse component instances across different creators.
  const [broken, setBroken] = useState(false)
  useEffect(() => setBroken(false), [face])

  if (!address) return null
  // Capitalise the first letter of the display name ("bondi" → "Bondi"); leave a raw address as-is.
  const name = data?.name ? capitalizeFirst(data.name) : shortAddress(address)
  const showImage = !!face && !broken
  const ava = showImage ? (
    <img
      className="creator__ava"
      data-testid="creator-ava"
      src={face}
      alt=""
      loading="lazy"
      onError={() => setBroken(true)}
    />
  ) : (
    <span
      className="creator__ava creator__ava--letter"
      data-testid="creator-ava-letter"
      style={{ backgroundColor: colorForAddress(address) }}
      aria-hidden
    >
      {initialFor(data?.name, address)}
    </span>
  )
  const inner = (
    <>
      {ava}
      <span className="creator__name" data-testid="creator-name">
        {/* Reuse the shared "By {name}" message for the prefix; the name keeps its own styled span
            (creator__display), so we render the prefix with an empty name and the name separately. */}
        {hidePrefix ? null : t('search.byCreator', { name: '' })}
        <span className="creator__display">{name}</span>
      </span>
    </>
  )
  if (linkToProfile) {
    return (
      <button
        className={`creator creator--link${className ? ` ${className}` : ''}`}
        data-testid="creator"
        onClick={e => {
          e.stopPropagation()
          navigate(`/assets/creator/${address}`)
        }}
      >
        {inner}
      </button>
    )
  }
  return (
    <span className={`creator${className ? ` ${className}` : ''}`} data-testid="creator">
      {inner}
    </span>
  )
}
