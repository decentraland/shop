import { config } from '~/config'
import { useProfile } from '~/hooks/useProfile'
import { getAvatarBackgroundColor, getDisplayName } from '~/lib/avatarColor'
import { CopyButton } from '~/components/CopyButton'
import { shortAddress } from '~/lib/address'
import { t } from '~/intl/i18n'
import * as S from './CollectionCreatorCard.styles'

export function CollectionCreatorCard({ address }: { address?: string }) {
  const { data: profile } = useProfile(address)

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

  return (
    <S.Root data-testid="creator-card">
      {face ? (
        <S.Ava src={face} alt="" loading="eager" style={{ backgroundColor: avatarBg }} />
      ) : (
        <S.Ava as="span" aria-hidden style={{ backgroundColor: avatarBg }} />
      )}

      <S.Name title={name}>{name}</S.Name>

      <CopyButton
        value={address}
        label={t('collection.copyAddress')}
        flow="copy_creator_address"
        testId="creator-card-copy"
      >
        <span>{shortAddress(address)}</span>
      </CopyButton>

      <S.View data-testid="creator-card-view" href={profileUrl} target="_blank" rel="noopener noreferrer">
        {t('collection.viewProfile')}
      </S.View>
    </S.Root>
  )
}

export default CollectionCreatorCard
