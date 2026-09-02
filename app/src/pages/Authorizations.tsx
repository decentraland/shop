import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useWallet } from '~/store/wallet'
import { fetchContractRegistry, fetchMyAssets, type ContractRegistry, type MyAsset } from '~/lib/api'
import { shortAddress } from '~/lib/address'
import {
  getAuthorizationStatus,
  setAuthorization,
  getCreditsAuthorization,
  getManaMarketplaceAuthorization,
  getCollectionSellingAuthorization,
  getCollectionMintingAuthorization,
  getLegacyMarketplaceAuthorizations,
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
import { theme } from '~/styles/theme'

// One authorization row: reads its live on-chain status and toggles it (grant / revoke). Only reached
// for self-custody users — managed (web2) users never see this page's controls.
function AuthorizationRow({
  descriptor,
  owner,
  signer,
  name,
  description,
  image,
  icon,
  revokeOnly = false
}: {
  descriptor: ShopAuthorizationDescriptor
  owner: string
  signer: ethers.providers.JsonRpcSigner
  name: string
  description: string
  image?: string
  icon?: ReactNode
  /**
   * Render nothing unless the grant is live. Used for superseded marketplace versions: they can no longer
   * receive a grant, so a row for one nobody holds is noise — but a row for one somebody DOES hold is the
   * only way to take it back.
   */
  revokeOnly?: boolean
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

  if (revokeOnly && !active) {
    return null
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

// A collection missing from this list is a seller who cannot list at all, so the holdings are paged
// through in full rather than sampled. The ceiling exists only so a wallet with an unbounded number of
// collectibles cannot hang the page — and when it bites, the list says so instead of quietly dropping
// collections.
const OWNED_PAGE_SIZE = 500
const OWNED_MAX_PAGES = 10
const OWNED_CEILING = OWNED_PAGE_SIZE * OWNED_MAX_PAGES

// Every collectible the owner holds in one category. The first page reports the true `total`, so the
// remaining pages are known up front and fetched at once instead of walking the offsets one by one.
async function fetchOwnedCategory(owner: string, category: string) {
  const firstPage = await fetchMyAssets(owner, { category, first: OWNED_PAGE_SIZE })
  const pages = Math.min(Math.ceil(firstPage.total / OWNED_PAGE_SIZE), OWNED_MAX_PAGES)
  const rest = await Promise.all(
    Array.from({ length: Math.max(0, pages - 1) }, (_, i) =>
      fetchMyAssets(owner, { category, first: OWNED_PAGE_SIZE, skip: (i + 1) * OWNED_PAGE_SIZE })
    )
  )
  return {
    assets: [...firstPage.assets, ...rest.flatMap(page => page.assets)],
    truncated: firstPage.total > OWNED_CEILING
  }
}

// Distinct collections the owner holds collectibles in — one selling authorization per collection
// (setApprovalForAll is per contract; there is no finer granularity to offer).
function useOwnedCollections(owner: string | undefined) {
  return useQuery({
    queryKey: ['owned-collections', owner],
    enabled: !!owner,
    staleTime: 60_000,
    queryFn: async () => {
      const [wearables, emotes] = await Promise.all([
        fetchOwnedCategory(owner!, 'wearable'),
        fetchOwnedCategory(owner!, 'emote')
      ])
      const byCollection = new Map<string, MyAsset>()
      for (const asset of [...wearables.assets, ...emotes.assets]) {
        const key = asset.contractAddress.toLowerCase()
        if (!byCollection.has(key)) byCollection.set(key, asset)
      }
      return {
        collections: [...byCollection.values()],
        truncated: wearables.truncated || emotes.truncated,
        // What the notice reports. The ceiling is per category, so the number actually read is the
        // only figure that is true for the list the user is looking at.
        scanned: wearables.assets.length + emotes.assets.length
      }
    }
  })
}

// The registry is effectively static (it only grows when a collection is approved) and is fetched
// whole, so keep it for the session rather than re-downloading it per visit.
function useContractRegistry(enabled: boolean) {
  return useQuery({
    queryKey: ['contract-registry'],
    enabled,
    staleTime: Infinity,
    gcTime: Infinity,
    queryFn: fetchContractRegistry
  })
}

// What to title a collection row. Never the name of an item the owner happens to hold in it: which
// item that would be depends on the holdings endpoint's ordering, so the same collection would be
// titled differently between loads, and the row's scope (the whole collection) would read as one
// item. Precedence: the registry's real name → the shortened address, which is unique and stable so
// two collections are still tellable apart → the generic label, only when the address is unusable.
function collectionLabel(contractAddress: string, registry: ContractRegistry | undefined): string {
  const name = registry?.get(contractAddress.toLowerCase())
  if (name) return name
  const short = shortAddress(contractAddress)
  return short === contractAddress ? t('authorizations.collectionFallback') : short
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

  const { data: owned, isLoading: loadingCollections } = useOwnedCollections(selfCustody ? session?.address : undefined)

  // Gate the list on the registry too: a row that renders with a shortened address and then swaps to
  // the collection's name reads as a bug. A failed registry request resolves loading all the same, so
  // the rows still appear (with the address fallback).
  const { data: registry, isLoading: loadingRegistry } = useContractRegistry(!!selfCustody && !!session?.address)

  const { data: publishableCollections, isLoading: loadingPublishable } = usePublishableCollections(
    selfCustody ? session?.address : undefined,
    selfCustody ? session?.identity : undefined
  )

  if (!session) {
    return (
      <S.Empty>
        <Icon name="info" size={40} color={theme.colors.muted2} />
        <S.EmptyTitle>{t('authorizations.signInTitle')}</S.EmptyTitle>
        <S.EmptyBody>{t('authorizations.signInBody')}</S.EmptyBody>
        <S.EmptyCta variant="white" onClick={() => signIn()}>
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
        <Icon name="check" size={40} color={theme.colors.ok} />
        <S.EmptyTitle>{t('authorizations.managedTitle')}</S.EmptyTitle>
        <S.EmptyBody>{t('authorizations.managedBody')}</S.EmptyBody>
        <S.EmptyCta as={Link} to="/items" variant="white">
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
          {/* Superseded marketplace versions. An allowance granted before the current one shipped stays live
              on chain, and buying an older listing still grants one at checkout, so without these rows it
              could never be seen or revoked. Shown only when actually granted. */}
          {getLegacyMarketplaceAuthorizations(manaSpend, chainId).map(legacy => (
            <AuthorizationRow
              key={legacy.id}
              descriptor={legacy}
              owner={session.address}
              signer={session.signer}
              name={t('authorizations.manaName')}
              description={t('authorizations.manaDesc')}
              icon={<S.ThumbMark src={manaSymbol} alt="" aria-hidden />}
              revokeOnly
            />
          ))}
        </S.List>
      </S.Group>

      <S.Group>
        <S.GroupTitle>{t('authorizations.sellingTitle')}</S.GroupTitle>
        {/* The ceiling is only reachable by a wallet with an extreme number of collectibles, but when it
            is reached the seller has to be told — a collection they cannot see is a sale they cannot make. */}
        {owned?.truncated ? (
          <S.Notice data-testid="authorizations-selling-truncated">
            {t('authorizations.sellingTruncated', { count: owned.scanned })}
          </S.Notice>
        ) : null}
        {loadingCollections || loadingRegistry ? (
          <S.List aria-busy="true" aria-label={t('authorizations.checking')}>
            {Array.from({ length: 3 }).map((_, i) => (
              <S.RowSkeleton key={i} aria-hidden />
            ))}
          </S.List>
        ) : owned && owned.collections.length > 0 ? (
          <S.List>
            {owned.collections.flatMap(asset => {
              const current = getCollectionSellingAuthorization(asset.contractAddress, chainId)
              return [current, ...getLegacyMarketplaceAuthorizations(current, chainId)].map((descriptor, index) => (
                <AuthorizationRow
                  key={descriptor.id}
                  descriptor={descriptor}
                  owner={session.address}
                  signer={session.signer}
                  name={collectionLabel(asset.contractAddress, registry)}
                  description={t('authorizations.sellingDesc')}
                  image={asset.image}
                  icon={<Icon name="pen" size={18} />}
                  revokeOnly={index > 0}
                />
              ))
            })}
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
            {publishableCollections.flatMap(collection => {
              const current = getCollectionMintingAuthorization(collection.contractAddress, chainId)
              return [current, ...getLegacyMarketplaceAuthorizations(current, chainId)].map((descriptor, index) => (
                <AuthorizationRow
                  key={descriptor.id}
                  descriptor={descriptor}
                  owner={session.address}
                  signer={session.signer}
                  name={collection.name || t('authorizations.collectionFallback')}
                  description={t('authorizations.mintingDesc')}
                  icon={<Icon name="pen" size={18} />}
                  revokeOnly={index > 0}
                />
              ))
            })}
          </S.List>
        ) : (
          <S.EmptyHint>{t('authorizations.mintingEmpty')}</S.EmptyHint>
        )}
      </S.Group>
    </S.Section>
  )
}
