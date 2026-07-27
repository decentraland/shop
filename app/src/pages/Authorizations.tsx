import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useWallet } from '~/store/wallet'
import { fetchMyAssets, type MyAsset } from '~/lib/api'
import {
  getAuthorizationStatus,
  setAuthorization,
  getCreditsAuthorization,
  getManaMarketplaceAuthorization,
  getCollectionSellingAuthorization,
  getCollectionMintingAuthorization,
  type ShopAuthorizationDescriptor
} from '~/lib/authorizations'
import { fetchCreatorCollections, type CreatorCollection } from '~/lib/builder'
import type { AuthIdentity } from '@dcl/crypto'
import { showsWalletConfirmations } from '~/lib/wallet-kind'
import { config } from '~/config'
import { CurrencyIcon } from '~/components/CurrencyIcon'
import manaSymbol from '~/assets/mana-matic.svg'
import { Icon } from '~/components/Icon'
import { toast } from '~/store/toast'
import { friendlyError } from '~/lib/errors'
import { captureError } from '~/lib/monitoring'
import { useSeo } from '~/hooks/useSeo'
import { t } from '~/intl/i18n'
import type { ReactNode } from 'react'
import type { ethers } from 'ethers'
import * as S from './Authorizations.styles'

// One authorization row: reads its live on-chain status and toggles it (grant / revoke). Only reached
// for self-custody users — managed (web2) users never see this page's controls.
function AuthorizationRow({
  descriptor,
  owner,
  signer,
  name,
  description,
  image,
  icon
}: {
  descriptor: ShopAuthorizationDescriptor
  owner: string
  signer: ethers.providers.JsonRpcSigner
  name: string
  description: string
  image?: string
  icon?: ReactNode
}) {
  const queryClient = useQueryClient()
  const [busy, setBusy] = useState(false)

  const {
    data: active,
    isLoading,
    refetch
  } = useQuery({
    queryKey: ['authorization', descriptor.id, owner],
    queryFn: () => getAuthorizationStatus(descriptor, owner),
    staleTime: 30_000
  })

  async function toggle() {
    if (busy || isLoading) return
    const next = !active
    setBusy(true)
    try {
      await setAuthorization({ auth: descriptor, signer, active: next })
      await refetch()
      queryClient.setQueryData(['authorization', descriptor.id, owner], next)
      toast.success(
        next ? t('authorizations.toastActivated', { name }) : t('authorizations.toastDeactivated', { name })
      )
    } catch (e) {
      captureError(e, { flow: 'authorizations', step: next ? 'grant' : 'revoke' })
      toast.error(friendlyError(e, t('authorizations.errorGeneric')))
    } finally {
      setBusy(false)
    }
  }

  const statusText = isLoading
    ? t('authorizations.checking')
    : active
      ? t('authorizations.active')
      : t('authorizations.inactive')

  return (
    <S.Row data-testid={`authorization-${descriptor.id}`} data-active={!!active}>
      <S.Thumb>{image ? <img src={image} alt="" /> : icon}</S.Thumb>
      <S.RowInfo>
        <S.RowName title={name}>{name}</S.RowName>
        <S.RowDesc>{description}</S.RowDesc>
      </S.RowInfo>
      <S.Control>
        <S.RowStatus data-active={!!active}>{statusText}</S.RowStatus>
        {busy ? (
          <S.Spinner aria-label={t('authorizations.working')} />
        ) : (
          <S.Toggle
            type="button"
            data-testid={`authorization-toggle-${descriptor.id}`}
            data-active={!!active}
            role="switch"
            aria-checked={!!active}
            aria-label={
              active ? t('authorizations.deactivateAria', { name }) : t('authorizations.activateAria', { name })
            }
            disabled={isLoading}
            onClick={() => void toggle()}
          />
        )}
      </S.Control>
    </S.Row>
  )
}

// Distinct collections the owner holds collectibles in — one selling authorization per collection.
function useOwnedCollections(owner: string | undefined) {
  return useQuery({
    queryKey: ['owned-collections', owner],
    enabled: !!owner,
    staleTime: 60_000,
    queryFn: async () => {
      const [wearables, emotes] = await Promise.all([
        fetchMyAssets(owner!, { category: 'wearable', first: 96 }),
        fetchMyAssets(owner!, { category: 'emote', first: 96 })
      ])
      const byCollection = new Map<string, MyAsset>()
      for (const asset of [...wearables.assets, ...emotes.assets]) {
        const key = asset.contractAddress.toLowerCase()
        if (!byCollection.has(key)) byCollection.set(key, asset)
      }
      return [...byCollection.values()]
    }
  })
}

// The published collections the owner PUBLISHES from — one minting authorization per collection.
// Same source the primary-publish flow (PrimaryListModal / ItemDetail) reads, deduped by on-chain
// collection address so a creator sees exactly one "For minting" row per collection.
function usePublishableCollections(owner: string | undefined, identity: AuthIdentity | undefined) {
  return useQuery({
    queryKey: ['creator-collections', owner],
    enabled: !!owner && !!identity,
    staleTime: 60_000,
    queryFn: async () => {
      const collections = await fetchCreatorCollections(owner!, identity!)
      const byCollection = new Map<string, CreatorCollection>()
      for (const collection of collections) {
        const key = collection.contractAddress.toLowerCase()
        if (!byCollection.has(key)) byCollection.set(key, collection)
      }
      return [...byCollection.values()]
    }
  })
}

export function Authorizations() {
  useSeo({ title: t('authorizations.title'), noindex: true })
  const { session, signIn } = useWallet()
  const chainId = config.chainId
  const selfCustody = showsWalletConfirmations(session?.providerType)

  const { data: collections, isLoading: loadingCollections } = useOwnedCollections(
    selfCustody ? session?.address : undefined
  )

  const { data: publishableCollections, isLoading: loadingPublishable } = usePublishableCollections(
    selfCustody ? session?.address : undefined,
    selfCustody ? session?.identity : undefined
  )

  if (!session) {
    return (
      <S.Empty>
        <Icon name="info" size={40} color="var(--muted-2)" />
        <S.EmptyTitle>{t('authorizations.signInTitle')}</S.EmptyTitle>
        <p className="muted">{t('authorizations.signInBody')}</p>
        <S.EmptyCta variant="purple" onClick={() => signIn()}>
          {t('storeSettings.signIn')}
        </S.EmptyCta>
      </S.Empty>
    )
  }

  // Managed (web2) users never grant approvals themselves — everything happens under the hood. Show a
  // reassuring, jargon-free state rather than wallet controls (CONVENTIONS.md web2-first rule).
  if (!selfCustody) {
    return (
      <S.Empty>
        <Icon name="check" size={40} color="var(--ok)" />
        <S.EmptyTitle>{t('authorizations.managedTitle')}</S.EmptyTitle>
        <p className="muted">{t('authorizations.managedBody')}</p>
        <S.EmptyCta as={Link} to="/assets" variant="purple">
          {t('authorizations.managedCta')}
        </S.EmptyCta>
      </S.Empty>
    )
  }

  const credits = getCreditsAuthorization(chainId)
  const manaSpend = getManaMarketplaceAuthorization(chainId)

  return (
    <S.Section>
      <S.Head>
        <S.Title>{t('authorizations.title')}</S.Title>
        <S.Intro>{t('authorizations.intro')}</S.Intro>
      </S.Head>

      <S.Group>
        <S.GroupTitle>{t('authorizations.buyingTitle')}</S.GroupTitle>
        <S.List>
          <AuthorizationRow
            descriptor={credits}
            owner={session.address}
            signer={session.signer}
            name={t('authorizations.creditsName')}
            description={t('authorizations.creditsDesc')}
            icon={<CurrencyIcon className="ccy-mark" />}
          />
          {/* Granted the first time someone pays in MANA. Listed whether or not it is active, so the
              permission is always visible and revocable rather than only discoverable at checkout. */}
          <AuthorizationRow
            descriptor={manaSpend}
            owner={session.address}
            signer={session.signer}
            name={t('authorizations.manaName')}
            description={t('authorizations.manaDesc')}
            icon={<S.ThumbMark src={manaSymbol} alt="" aria-hidden />}
          />
        </S.List>
      </S.Group>

      <S.Group>
        <S.GroupTitle>{t('authorizations.sellingTitle')}</S.GroupTitle>
        {loadingCollections ? (
          <S.List aria-busy="true" aria-label={t('authorizations.checking')}>
            {Array.from({ length: 3 }).map((_, i) => (
              <S.RowSkeleton key={i} aria-hidden />
            ))}
          </S.List>
        ) : collections && collections.length > 0 ? (
          <S.List>
            {collections.map(asset => (
              <AuthorizationRow
                key={asset.contractAddress}
                descriptor={getCollectionSellingAuthorization(asset.contractAddress, chainId)}
                owner={session.address}
                signer={session.signer}
                name={asset.name || t('authorizations.collectionFallback')}
                description={t('authorizations.sellingDesc')}
                image={asset.image}
                icon={<Icon name="pen" size={18} />}
              />
            ))}
          </S.List>
        ) : (
          <S.EmptyHint>{t('authorizations.sellingEmpty')}</S.EmptyHint>
        )}
      </S.Group>

      <S.Group>
        <S.GroupTitle>{t('authorizations.mintingTitle')}</S.GroupTitle>
        {loadingPublishable ? (
          <S.List aria-busy="true" aria-label={t('authorizations.checking')}>
            {Array.from({ length: 3 }).map((_, i) => (
              <S.RowSkeleton key={i} aria-hidden />
            ))}
          </S.List>
        ) : publishableCollections && publishableCollections.length > 0 ? (
          <S.List>
            {publishableCollections.map(collection => (
              <AuthorizationRow
                key={collection.contractAddress}
                descriptor={getCollectionMintingAuthorization(collection.contractAddress, chainId)}
                owner={session.address}
                signer={session.signer}
                name={collection.name || t('authorizations.collectionFallback')}
                description={t('authorizations.mintingDesc')}
                icon={<Icon name="pen" size={18} />}
              />
            ))}
          </S.List>
        ) : (
          <S.EmptyHint>{t('authorizations.mintingEmpty')}</S.EmptyHint>
        )}
      </S.Group>
    </S.Section>
  )
}
