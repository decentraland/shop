import { Link } from 'react-router-dom'
import { config } from '~/config'
import defaultCover from '~/assets/default-cover.jpeg'
import { useProfile } from '~/hooks/useProfile'
import { useStore } from '~/hooks/useStore'
import { useWallet } from '~/store/wallet'
import { FollowButton } from '~/components/FollowButton'
import { getAvatarBackgroundColor, getDisplayName } from '~/lib/avatarColor'
import { t } from '~/intl/i18n'
import './creator-hero.css'

// The storefront banner at the top of a creator page: cover image + centered avatar, name,
// description and a "View profile" link out to the creator's public Decentraland profile.
// Name/avatar come from the DCL profile (useProfile); cover/description from the store entity
// (useStore). Everything degrades gracefully — no cover → a bundled default cover image, no
// description → the line is hidden, no profile name → the short address (same rule as CreatorBadge).
function shortAddress(addr: string): string {
  return /^0x[a-fA-F0-9]{40}$/.test(addr) ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : addr
}

export function CreatorHero({ address }: { address: string }) {
  const { data: profile } = useProfile(address)
  const { data: store } = useStore(address)
  // Only the store's own creator can edit it — show the pen only when the signed-in account matches
  // the profile being viewed (case-insensitive, same rule as isOwnListing).
  const selfAddress = useWallet(s => s.session?.address)
  const isOwner = !!selfAddress && selfAddress.toLowerCase() === address.toLowerCase()

  const name = profile?.name || shortAddress(address)
  const face = profile?.avatar?.snapshots?.face256
  const cover = store?.cover || defaultCover
  const description = store?.description
  const profileUrl = `${config.profileUrl}/${address}`

  // Deterministic per-user avatar backdrop — identical to the in-world client + decentraland.org
  // navbar (ADR-292, see lib/avatarColor). Shows behind a transparent face snapshot and as the
  // placeholder fill. Applied inline because the color is derived from the profile at runtime.
  const avatarBg = getAvatarBackgroundColor(
    getDisplayName({
      name: profile?.name,
      hasClaimedName: profile?.hasClaimedName,
      ethAddress: profile?.ethAddress ?? address,
    })
  )

  return (
    <section className="creator-hero" aria-label={`${name} storefront`}>
      <div className="creator-hero__cover">
        <img className="creator-hero__cover-img" src={cover} alt="" loading="eager" />
        <div className="creator-hero__scrim" aria-hidden />
      </div>

      {isOwner && (
        <Link
          className="creator-hero__edit"
          to="/store-settings"
          title={t('creator.editStore')}
          aria-label={t('creator.editStore')}
        >
          <span className="ico ico-pen" aria-hidden />
        </Link>
      )}

      <div className="creator-hero__body">
        {face ? (
          <img className="creator-hero__ava" src={face} alt="" loading="eager" style={{ backgroundColor: avatarBg }} />
        ) : (
          <span className="creator-hero__ava creator-hero__ava--ph" aria-hidden style={{ backgroundColor: avatarBg }} />
        )}
        <div>
          <h2 className="creator-hero__name">{name}</h2>
          {description ? <p className="creator-hero__desc">{description}</p> : null}
        </div>
        <div className="creator-hero__actions">
          <a className="creator-hero__view" href={profileUrl} target="_blank" rel="noopener noreferrer">
            {t('creator.viewProfile')}
          </a>
          <FollowButton address={address} className="creator-hero__follow" />
        </div>
      </div>
    </section>
  )
}

export default CreatorHero
