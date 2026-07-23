import { Icon, type IconName } from '~/components/Icon'
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
import * as S from './CreatorHero.styles'

const LINK_ICON: Record<LinkType, IconName> = {
  website: 'website',
  twitter: 'twitter',
  discord: 'discord',
  facebook: 'facebook'
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
      ethAddress: profile?.ethAddress ?? address
    })
  )

  return (
    <S.Root aria-label={`${name} storefront`}>
      <S.Cover>
        <S.CoverImg src={cover} alt="" loading="eager" />
        <S.Scrim aria-hidden />
      </S.Cover>

      {(links.length > 0 || isOwner) && (
        <S.Links>
          {links.map(type => (
            <S.SocialLink
              key={type}
              data-testid="creator-hero-link"
              href={store?.links[type] ?? ''}
              target="_blank"
              rel="noopener noreferrer"
              title={t(`creator.link.${type}`)}
              aria-label={t(`creator.link.${type}`)}
            >
              <Icon name={LINK_ICON[type]} />
            </S.SocialLink>
          ))}
          {isOwner && (
            <S.Edit to="/store-settings" title={t('creator.editStore')} aria-label={t('creator.editStore')}>
              <Icon name="pen" />
            </S.Edit>
          )}
        </S.Links>
      )}

      <S.Body>
        {face ? (
          <S.Ava src={face} alt="" loading="eager" style={{ backgroundColor: avatarBg }} />
        ) : (
          <S.Ava as="span" aria-hidden style={{ backgroundColor: avatarBg }} />
        )}
        <div>
          <S.Name>{name}</S.Name>
          {description ? <S.Desc>{description}</S.Desc> : null}
        </div>
        <S.Actions>
          <S.View data-testid="creator-hero-view" href={profileUrl} target="_blank" rel="noopener noreferrer">
            {t('creator.viewProfile')}
          </S.View>
          <FollowButton address={address} className="creator-hero__follow" />
        </S.Actions>
      </S.Body>
    </S.Root>
  )
}

export default CreatorHero
