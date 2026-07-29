import { useState } from 'react'
import { config } from '~/config'
import { useProfile } from '~/hooks/useProfile'
import { getAvatarBackgroundColor, getDisplayName } from '~/lib/avatarColor'
import { Icon } from '~/components/Icon'
import { captureError } from '~/lib/monitoring'
import { shortAddress } from '~/lib/address'
import { t } from '~/intl/i18n'
import * as S from './CollectionCreatorCard.styles'

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
    <S.Root data-testid="creator-card">
      {face ? (
        <S.Ava src={face} alt="" loading="eager" style={{ backgroundColor: avatarBg }} />
      ) : (
        <S.Ava as="span" aria-hidden style={{ backgroundColor: avatarBg }} />
      )}

      <S.Name title={name}>{name}</S.Name>

      <S.Account
        type="button"
        onClick={() => void copyAddress()}
        title={copied ? t('collection.copied') : t('collection.copyAddress')}
        aria-label={copied ? t('collection.copied') : t('collection.copyAddress')}
      >
        <span>{shortAddress(address)}</span>
        <Icon name="copy" size={16} />
      </S.Account>

      <S.View data-testid="creator-card-view" href={profileUrl} target="_blank" rel="noopener noreferrer">
        {t('collection.viewProfile')}
      </S.View>
    </S.Root>
  )
}

export default CollectionCreatorCard
