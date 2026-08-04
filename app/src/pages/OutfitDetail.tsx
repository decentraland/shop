import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { PreviewRenderer } from '@dcl/schemas'
import { useQuery } from '@tanstack/react-query'
import { Button } from '~/components/Button'
import { CreatorName } from '~/components/CreatorName'
import { CurrencyIcon } from '~/components/CurrencyIcon'
import { ErrorNotice } from '~/components/ErrorNotice'
import { OutfitPreview } from '~/components/OutfitPreview'
import { useProfile } from '~/hooks/useProfile'
import { Icon } from '~/components/Icon'
import { useOutfitCreatorAccess, useOutfitCart, useOutfitItems } from '~/hooks/useOutfits'
import { useSeo } from '~/hooks/useSeo'
import { track } from '~/lib/analytics'
import type { CatalogItem } from '~/lib/api'
import { categoryIcon, genderIcon } from '~/lib/itemIcons'
import { rarityDescription, rarityInk, rarityTint } from '~/lib/rarity'
import { BASE_FEMALE, BASE_MALE, type BodyShapeUrn } from '~/lib/bodyShape'
import {
  classifyOutfitItem,
  fetchOutfit,
  isOutfitsAvailable,
  listingIdentity,
  outfitItemKey,
  outfitRadialGradient,
  thumbnailUrl,
  type Outfit,
  type OutfitItemState
} from '~/lib/outfits'
import { itemUrn } from '~/lib/urn'
import { t } from '~/intl/i18n'
import { useCart } from '~/store/cart'
import { useWallet } from '~/store/wallet'
// The preview-mode toggle chrome is the item detail's — same control, same look (the page's Preview
// container positions it via [data-preview-toggle], like ItemDetail does).
import * as IP from '~/components/ItemPreview/ItemPreview.styles'
import * as S from './OutfitDetail.styles'

const PREVIEW_ID = 'outfit-detail-preview'

// An outfit as one shoppable page: the whole set worn live on the VIEWER's avatar, the item list
// with per-item availability, and one add-all CTA. A catalog outage renders a retry state — never
// "no longer available" (an outage is not a sell-out); only a pair the catalog no longer returns is.
export function OutfitDetail() {
  const { id } = useParams<{ id: string }>()
  const session = useWallet(s => s.session)
  const access = useOutfitCreatorAccess()
  const isCreator = access === 'creator'

  // Creators read signed so their drafts resolve too (the server 404s drafts for everyone else).
  const {
    data: outfit,
    isError,
    refetch
  } = useQuery({
    queryKey: ['outfit', id, isCreator],
    enabled: isOutfitsAvailable() && !!id,
    staleTime: 60_000,
    queryFn: () => fetchOutfit(id as string, isCreator && session ? session.identity : undefined)
  })

  // A draft 404s for everyone but its creator, and `access` settles AFTER the first fetch — so a
  // creator refreshing a draft link would flash the 404 before the signed refetch. Hold the verdict
  // (the skeleton below covers it) rather than delay the fetch, which is public and hot.
  const notFound = !isOutfitsAvailable() || !id || (outfit === null && access !== 'pending')
  useSeo(notFound ? { title: t('seo.outfit.notFoundTitle'), noindex: true } : outfit ? { title: outfit.name } : {})

  if (notFound) {
    return (
      <S.Empty data-testid="outfit-notfound">
        <S.EmptyIco name="cart" size={44} />
        <S.EmptyTitle>{t('outfits.detail.notFoundTitle')}</S.EmptyTitle>
        <p className="muted">{t('outfits.detail.notFoundBody')}</p>
        <Button as={Link} to="/assets" variant="purple">
          {t('notFound.cta')}
        </Button>
      </S.Empty>
    )
  }

  if (isError) {
    return (
      <S.Empty data-testid="outfit-detail-error">
        <ErrorNotice message={t('outfits.errors.generic')} />
        <Button variant="purple" onClick={() => void refetch()}>
          {t('outfits.detail.retry')}
        </Button>
      </S.Empty>
    )
  }

  if (!outfit) {
    return (
      <S.Root aria-busy="true" data-testid="outfit-detail-loading">
        <S.Main>
          <S.Preview>
            <span className="skeleton" style={{ position: 'absolute', inset: 0 }} aria-hidden />
          </S.Preview>
          <S.Info>
            <span className="skeleton" style={{ width: '60%', height: 32 }} aria-hidden />
            <span className="skeleton" style={{ width: '40%', height: 16 }} aria-hidden />
            <span className="skeleton" style={{ width: '100%', height: 48 }} aria-hidden />
          </S.Info>
        </S.Main>
      </S.Root>
    )
  }

  return <OutfitContent outfit={outfit} />
}

type ItemRow = { key: string; item: CatalogItem | null; state: OutfitItemState | 'missing' }

// The AssetCard attribute chips on an outfit item row: rarity, smart, category, gender.
function ItemChips({ item }: { item: CatalogItem }) {
  const catIco = categoryIcon(item)
  const genderIco = genderIcon(item.gender)
  return (
    <S.AttrChips>
      {item.rarity ? (
        <S.AttrChip
          data-variant="rarity"
          style={{ background: rarityTint(item.rarity), color: rarityInk(item.rarity) }}
          title={rarityDescription(item.rarity)}
        >
          {item.rarity}
        </S.AttrChip>
      ) : null}
      {item.isSmart ? (
        <S.AttrChip data-variant="smart">
          <Icon name="smart" size={13} />
          {t('assetCard.smart')}
        </S.AttrChip>
      ) : null}
      {catIco ? (
        <S.AttrChip data-variant="icon">
          <Icon name={catIco} />
        </S.AttrChip>
      ) : null}
      {genderIco ? (
        <S.AttrChip data-variant="icon">
          <Icon name={genderIco} />
        </S.AttrChip>
      ) : null}
    </S.AttrChips>
  )
}

function OutfitContent({ outfit }: { outfit: Outfit }) {
  const resolution = useOutfitItems(outfit)
  const { split, availableCount, totalCredits, addOutfit, isAdding } = useOutfitCart(outfit, resolution)
  const address = useWallet(s => s.session?.address)
  const cartItems = useCart(s => s.items)
  // Compared on the cross-feed identity, so an item added from the browse grid (keyed by trade id)
  // still reads as "in your cart" on a look that resolved it from the /v2 catalog.
  const cartKeys = useMemo(() => new Set(cartItems.map(listingIdentity)), [cartItems])

  // Null unless the outfit carries a real stored hash, so a draft/malformed value reads as "no
  // artwork" everywhere below rather than pointing an <img> at a URL that cannot resolve.
  const thumb = thumbnailUrl(outfit.thumbnailHash)

  // "On avatar / Look": the live try-on vs the creator's uploaded artwork. Overlay controls only
  // for Babylon — Unity ships its own in-scene (same rule as the item detail); defaulting to UNITY
  // means the Unity path never briefly flashes the toggle before the preview reports.
  const [view, setView] = useState<'avatar' | 'item'>('avatar')
  const [renderer, setRenderer] = useState<PreviewRenderer>(PreviewRenderer.UNITY)
  const showControls = renderer === PreviewRenderer.BABYLON && !!thumb

  const viewedRef = useRef<string | null>(null)
  useEffect(() => {
    if (viewedRef.current === outfit.id) return
    viewedRef.current = outfit.id
    track('Shop Outfit Viewed', { outfit_id: outfit.id, item_count: outfit.items.length })
  }, [outfit.id, outfit.items.length])

  // The record's items in their authored order, each with its live catalog item (or none — a pair the
  // catalog no longer returns) and what the CTA can do with it. On a resolution ERROR nothing is
  // classified — the list area shows the retry state instead.
  const rows: ItemRow[] = useMemo(
    () =>
      outfit.items.map(ref => {
        const key = outfitItemKey(ref)
        const item = resolution.byKey.get(key) ?? null
        return { key, item, state: item ? classifyOutfitItem(item, { address, cartKeys }) : 'missing' }
      }),
    [outfit, resolution.byKey, address, cartKeys]
  )

  // Preview: the whole set worn on the viewer's own avatar ('default' mannequin when signed out),
  // regardless of purchasability — only unresolved pairs can't appear. Wait for the profile lookup
  // so the iframe mounts once, with the final profile.
  const { data: avatar, isFetched: profileFetched } = useProfile(address)
  const profileResolved = !address || profileFetched
  const hasAvatar = !!address && !!avatar
  const profile = hasAvatar ? address : 'default'
  const mannequinShape: BodyShapeUrn | undefined =
    outfit.bodyShape === 'female' ? BASE_FEMALE : outfit.bodyShape === 'male' ? BASE_MALE : undefined

  const urns = useMemo(
    () => rows.map(row => (row.item ? itemUrn(row.item) : null)).filter((urn): urn is string => !!urn),
    [rows]
  )

  const total = outfit.items.length
  const settled = !resolution.isLoading && !resolution.isError
  const purchasable = split.purchasable.length

  return (
    <S.Root data-testid="outfit-detail">
      <S.Crumbs aria-label={t('outfits.detail.breadcrumbAria')}>
        <S.Crumb to="/overview">{t('nav.overview')}</S.Crumb>
        <span aria-hidden>{'>'}</span>
        <S.Crumb to="/overview">{t('outfits.detail.breadcrumbLooks')}</S.Crumb>
        <span aria-hidden>{'>'}</span>
        <S.CrumbCurrent>{outfit.name}</S.CrumbCurrent>
      </S.Crumbs>

      <S.Main>
        {/* The creator's two stops as a radial glow back BOTH branches: the live preview renders on
            a transparent background and the uploaded thumbnail is transparent too. */}
        <S.Preview data-testid="outfit-detail-preview" style={{ background: outfitRadialGradient(outfit) }}>
          {/* The uploaded artwork: chosen via the toggle, or the fallback when nothing wearable
              resolved (outage, or every pair delisted). */}
          {thumb && (view === 'item' || (!resolution.isLoading && urns.length === 0)) ? (
            <S.PreviewFallback src={thumb} alt={outfit.name} />
          ) : (
            <OutfitPreview
              id={PREVIEW_ID}
              profile={profile}
              bodyShape={hasAvatar ? undefined : mannequinShape}
              urns={urns}
              enabled={profileResolved && !resolution.isLoading}
              onRenderer={setRenderer}
            />
          )}
          {showControls ? (
            <IP.Toggle
              data-preview-toggle
              data-testid="outfit-detail-toggle"
              role="group"
              aria-label={t('itemPreview.previewMode')}
            >
              <IP.ToggleButton
                type="button"
                data-active={view === 'avatar' || undefined}
                aria-pressed={view === 'avatar'}
                aria-label={t('itemPreview.onAvatar')}
                onClick={() => setView('avatar')}
              >
                <IP.ToggleIcon name="view-avatar" size={18} />
                <IP.ToggleLabel>{t('itemPreview.onAvatar')}</IP.ToggleLabel>
              </IP.ToggleButton>
              <IP.ToggleButton
                type="button"
                data-active={view === 'item' || undefined}
                aria-pressed={view === 'item'}
                aria-label={t('itemPreview.item')}
                onClick={() => setView('item')}
              >
                <IP.ToggleIcon name="view-item" size={18} />
                <IP.ToggleLabel>{t('itemPreview.item')}</IP.ToggleLabel>
              </IP.ToggleButton>
            </IP.Toggle>
          ) : null}
        </S.Preview>

        <S.Info>
          <S.Title>{outfit.name}</S.Title>
          <S.Meta data-testid="outfit-detail-meta">{t('outfits.detail.itemsCount', { count: total })}</S.Meta>

          {resolution.isError ? (
            <S.ResolveError>
              <ErrorNotice message={t('outfits.detail.resolveError')} testId="outfit-detail-resolve-error" />
              <Button variant="outline" data-testid="outfit-detail-retry" onClick={resolution.retry}>
                {t('outfits.detail.retry')}
              </Button>
            </S.ResolveError>
          ) : (
            <>
              <S.ListScroll>
                <S.Items>
                  {rows.map(row => (
                    <S.ItemCard key={row.key} data-testid="outfit-detail-item" data-state={row.state}>
                      {row.item ? (
                        <>
                          <S.ItemOverlayLink
                            to={`/item/${row.item.contractAddress}/${row.item.itemId}`}
                            state={{ item: row.item }}
                            aria-label={row.item.name}
                          />
                          <S.ItemThumb src={row.item.thumbnail} alt="" loading="lazy" />
                          <S.ItemBody>
                            <S.ItemName>{row.item.name}</S.ItemName>
                            {row.item.creator ? (
                              <S.ItemAuthor to={`/assets/creator/${row.item.creator}`}>
                                <CreatorName address={row.item.creator} />
                              </S.ItemAuthor>
                            ) : null}
                            <S.ItemPriceRow>
                              {row.state !== 'unavailable' ? (
                                <S.ItemPrice>
                                  <CurrencyIcon size={15} />
                                  {row.item.priceCredits.toLocaleString()}
                                </S.ItemPrice>
                              ) : null}
                              {row.state === 'unavailable' ? (
                                <S.ItemBadge>{t('outfits.card.unavailable')}</S.ItemBadge>
                              ) : row.state === 'own_listing' ? (
                                <S.ItemBadge>{t('outfits.detail.yourListing')}</S.ItemBadge>
                              ) : row.state === 'in_cart' ? (
                                <S.ItemBadge>{t('outfits.detail.inCart')}</S.ItemBadge>
                              ) : null}
                              <ItemChips item={row.item} />
                            </S.ItemPriceRow>
                          </S.ItemBody>
                        </>
                      ) : (
                        <>
                          <S.ItemThumbEmpty className={resolution.isLoading ? 'skeleton' : undefined} aria-hidden />
                          <S.ItemBody>
                            {resolution.isLoading ? (
                              <S.ItemName>
                                <span className="skeleton" style={{ display: 'block', width: '70%', height: 14 }} />
                              </S.ItemName>
                            ) : (
                              <>
                                <S.ItemName className="muted">{t('outfits.card.unavailable')}</S.ItemName>
                                <S.ItemPriceRow>
                                  <S.ItemBadge>{t('outfits.card.unavailable')}</S.ItemBadge>
                                </S.ItemPriceRow>
                              </>
                            )}
                          </S.ItemBody>
                        </>
                      )}
                    </S.ItemCard>
                  ))}
                </S.Items>
                {settled && split.ownListing.length > 0 ? (
                  <S.Hint className="muted small">{t('outfits.detail.yourListingHint')}</S.Hint>
                ) : null}
              </S.ListScroll>

              <S.CtaBar data-testid="outfit-detail-ctabar">
                <S.TotalRow>
                  <S.TotalLabel>{t('outfits.detail.totalPrice')}</S.TotalLabel>
                  {resolution.isLoading ? (
                    <span className="skeleton" style={{ width: 64, height: 26 }} aria-hidden />
                  ) : (
                    <S.TotalValue>
                      <CurrencyIcon size={22} />
                      {totalCredits.toLocaleString()}
                    </S.TotalValue>
                  )}
                </S.TotalRow>
                {resolution.isLoading ? (
                  <span className="skeleton" style={{ width: '100%', height: 52, borderRadius: 26 }} aria-hidden />
                ) : (
                  <S.Cta
                    variant="purple"
                    data-testid="outfit-detail-cta"
                    onClick={addOutfit}
                    disabled={isAdding || purchasable === 0}
                    aria-busy={isAdding || undefined}
                  >
                    {isAdding
                      ? t('outfits.card.adding')
                      : purchasable > 0
                        ? t('outfits.detail.addCount', { count: purchasable })
                        : availableCount > 0
                          ? t('outfits.detail.nothingToAdd')
                          : t('outfits.card.unavailable')}
                    {!isAdding && purchasable > 0 ? (
                      <S.CtaPrice>
                        <CurrencyIcon size={16} />
                        {totalCredits.toLocaleString()}
                      </S.CtaPrice>
                    ) : null}
                  </S.Cta>
                )}
              </S.CtaBar>
            </>
          )}
        </S.Info>
      </S.Main>
    </S.Root>
  )
}

export default OutfitDetail
