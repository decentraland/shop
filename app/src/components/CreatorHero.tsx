import { Link } from 'react-router-dom'
import { config } from '~/config'
import defaultCover from '~/assets/creator-covers/default-cover.jpeg'
import { useProfile } from '~/hooks/useProfile'
import { useStore } from '~/hooks/useStore'
import { useWallet } from '~/store/wallet'
import { FollowButton } from '~/components/FollowButton'
import { getAvatarBackgroundColor, getDisplayName } from '~/lib/avatarColor'
import { LINK_TYPES, type LinkType } from '~/lib/store'
import { shortAddress } from '~/lib/address'
import { t } from '~/intl/i18n'
import './creator-hero.css'

const LINK_ICON: Record<LinkType, string> = {
  website: 'ico-website',
  twitter: 'ico-twitter',
  discord: 'ico-discord',
  facebook: 'ico-facebook',
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
  // The social links the creator set in store settings, in display order (empty ones dropped).
  const links = LINK_TYPES.filter(type => store?.links[type])

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

      {(links.length > 0 || isOwner) && (
        <div className="creator-hero__links">
          {links.map(type => (
            <a
              key={type}
              className="creator-hero__link"
              href={store?.links[type] ?? ''}
              target="_blank"
              rel="noopener noreferrer"
              title={t(`creator.link.${type}`)}
              aria-label={t(`creator.link.${type}`)}
            >
              <span className={`ico ${LINK_ICON[type]}`} aria-hidden />
            </a>
          ))}
          {isOwner && (
            <Link
              className="creator-hero__link creator-hero__edit"
              to="/store-settings"
              title={t('creator.editStore')}
              aria-label={t('creator.editStore')}
            >
              <span className="ico ico-pen" aria-hidden />
            </Link>
          )}
        </div>
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
