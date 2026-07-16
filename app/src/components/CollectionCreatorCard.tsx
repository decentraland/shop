import { useState } from 'react'
import { config } from '~/config'
import { useProfile } from '~/hooks/useProfile'
import { getAvatarBackgroundColor, getDisplayName } from '~/lib/avatarColor'
import { captureError } from '~/lib/monitoring'
import { shortAddress } from '~/lib/address'
import { t } from '~/intl/i18n'
import './collection-creator-card.css'

export function CollectionCreatorCard({ address }: { address?: string }) {
  const { data: profile } = useProfile(address)
  const [copied, setCopied] = useState(false)

  if (!address) return null

  const name = profile?.name || shortAddress(address)
  const face = profile?.avatar?.snapshots?.face256
  const profileUrl = `${config.profileUrl}/${address}`

  // Deterministic per-user avatar backdrop — identical to CreatorHero / the in-world client
  // (ADR-292, see lib/avatarColor). Shows behind a transparent face snapshot and as the placeholder.
  const avatarBg = getAvatarBackgroundColor(
    getDisplayName({
      name: profile?.name,
      hasClaimedName: profile?.hasClaimedName,
      ethAddress: profile?.ethAddress ?? address
    })
  )

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(address as string)
      setCopied(true)
      // Revert the "Copied" affordance after a moment so the chip returns to its idle state.
      window.setTimeout(() => setCopied(false), 1500)
    } catch (err) {
      captureError(err, { flow: 'copy_creator_address' })
    }
  }

  return (
    <div className="creator-card">
      {face ? (
        <img className="creator-card__ava" src={face} alt="" loading="eager" style={{ backgroundColor: avatarBg }} />
      ) : (
        <span className="creator-card__ava creator-card__ava--ph" aria-hidden style={{ backgroundColor: avatarBg }} />
      )}

      <h2 className="creator-card__name" title={name}>
        {name}
      </h2>

      <button
        type="button"
        className="creator-card__account"
        onClick={() => void copyAddress()}
        title={copied ? t('collection.copied') : t('collection.copyAddress')}
        aria-label={copied ? t('collection.copied') : t('collection.copyAddress')}
      >
        <span className="creator-card__account-text">{shortAddress(address)}</span>
        <span className="ico ico-copy creator-card__copy" aria-hidden />
      </button>

      <a className="creator-card__view" href={profileUrl} target="_blank" rel="noopener noreferrer">
        {t('collection.viewProfile')}
      </a>
    </div>
  )
}

export default CollectionCreatorCard
