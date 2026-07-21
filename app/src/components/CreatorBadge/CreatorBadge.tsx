import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProfile } from '~/hooks/useProfile'
import { capitalizeFirst } from '~/lib/text'
import { t } from '~/intl/i18n'
import * as S from './badge.styles'

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
  /** Drop the "By " prefix (the PDP shows the bare creator name). */
  hidePrefix?: boolean
}) {
  const navigate = useNavigate()
  const { data } = useProfile(address)
  const face = data?.avatar?.snapshots?.face256
  // Some profiles have no face snapshot, or one whose URL 404s (not deployed) — in both cases fall back
  // to a lettered avatar instead of a broken image. `broken` resets when the face url changes because
  // list rows reuse component instances across different creators.
  const [broken, setBroken] = useState(false)
  useEffect(() => setBroken(false), [face])

  if (!address) return null
  const name = data?.name ? capitalizeFirst(data.name) : shortAddress(address)
  const showImage = !!face && !broken
  const ava = showImage ? (
    <S.AvaImg data-avatar data-testid="creator-ava" src={face} alt="" loading="lazy" onError={() => setBroken(true)} />
  ) : (
    <S.Ava
      data-avatar
      data-letter
      data-testid="creator-ava-letter"
      style={{ backgroundColor: colorForAddress(address) }}
      aria-hidden
    >
      {initialFor(data?.name, address)}
    </S.Ava>
  )
  const inner = (
    <>
      {ava}
      <S.Name data-testid="creator-name">
        {hidePrefix ? null : t('search.byCreator', { name: '' })}
        <S.Display data-testid="creator-display">{name}</S.Display>
      </S.Name>
    </>
  )
  if (linkToProfile) {
    return (
      <S.Root
        as="button"
        data-link
        className={className}
        data-testid="creator"
        onClick={e => {
          e.stopPropagation()
          navigate(`/assets/creator/${address}`)
        }}
      >
        {inner}
      </S.Root>
    )
  }
  return (
    <S.Root className={className} data-testid="creator">
      {inner}
    </S.Root>
  )
}
