import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Network } from '@dcl/schemas'
import type { Session } from '~/lib/auth'
import type { PublishableItem } from '~/lib/builder'
import { postTrade } from '~/lib/api'
import { itemRoute } from '~/lib/routes'
import { createPrimaryUsdPeggedListing, ensureMinter, isMarketplaceMinter } from '~/lib/trades'
import { toast } from '~/store/toast'
import { config } from '~/config'
import { CURRENCY } from '~/lib/currency'
import { CurrencyIcon } from '~/components/CurrencyIcon'
import { Icon } from '~/components/Icon'
import { isManagedWallet } from '~/lib/wallet'
import { useProfile } from '~/hooks/useProfile'
import { capitalizeFirst } from '~/lib/text'
import { shortAddress } from '~/lib/address'
import { track, errorCode } from '~/lib/analytics'
import { captureError } from '~/lib/monitoring'
import { t } from '~/intl/i18n'
import { friendlyError } from '~/lib/errors'
import { ErrorNotice } from '~/components/ErrorNotice'
import * as S from './PrimaryListModal.styles'

const SIX_MONTHS_MS = 1000 * 60 * 60 * 24 * 182

export function PrimaryListModal({
  item,
  session,
  onListed,
  onClose
}: {
  item: PublishableItem
  session: Session
  // Fired the instant the primary listing goes live (mirrors SellModal.onListed). The PDP uses it to show
  // the just-listed price immediately instead of flashing "not for sale" while the feed's MV catches up.
  onListed?: (credits: number) => void
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [price, setPrice] = useState('10') // whole credits
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // null = still checking; true/false = whether this collection is already enabled for Shop sales.
  const [enabled, setEnabled] = useState<boolean | null>(null)
  // Set once the listing is live — swaps the form for a success view.
  const [listedCredits, setListedCredits] = useState<number | null>(null)

  const chainId = config.chainId
  // Self-custody wallets pop approvals/confirmations; managed wallets (Magic, thirdweb) don't — gate
  // the wallet-flow wording so managed users never see MetaMask-style "two confirmations" copy. Shared
  // helper so the classification stays consistent across the buy/sell/publish flows.
  const isManaged = isManagedWallet(session)

  // The creator is the viewer themselves (this modal only opens for your own collection item) — show
  // their profile name (or short address) as "By {creator}" on the asset card, matching SellModal.
  const { data: creatorProfile } = useProfile(session.address)
  const creatorName = creatorProfile?.name ? capitalizeFirst(creatorProfile.name) : shortAddress(session.address)

  const priceValue = Number(price)
  const priceValid = Number.isInteger(priceValue) && priceValue > 0
  // USD equivalent hint (1 credit = $0.10).
  const usdHint = priceValid ? `$${(priceValue / 10).toFixed(2)}` : '$0'

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const ok = await isMarketplaceMinter({ contractAddress: item.contractAddress, chainId })
        if (!cancelled) setEnabled(ok)
      } catch {
        if (!cancelled) setEnabled(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [item.contractAddress, chainId])

  async function publish() {
    setError(null)
    const value = Number(price)
    if (!Number.isInteger(value) || value <= 0) {
      setError(t('primaryList.errorWholeNumber'))
      return
    }
    setBusy(true)
    try {
      // Minter prereq: the Shop can only fulfil sales of this collection once it's enabled. This is a
      // one-time step per collection; skipped automatically if already enabled.
      if (!enabled) {
        setStatus(t('primaryList.statusEnabling'))
        await ensureMinter({ signer: session.signer, contractAddress: item.contractAddress, chainId })
        setEnabled(true)
      }

      setStatus(t('primaryList.statusPublishing'))
      const trade = await createPrimaryUsdPeggedListing({
        signer: session.signer,
        item: {
          contractAddress: item.contractAddress,
          itemId: item.blockchainItemId,
          network: Network.MATIC,
          chainId
        },
        usdPrice: value / 10, // credits → USD (1 credit = $0.10)
        uses: item.remainingSupply,
        expiresAtMs: Date.now() + SIX_MONTHS_MS
      })

      setStatus(t('primaryList.statusFinishing'))
      await postTrade(trade, session.identity)

      setStatus(null)
      setListedCredits(value) // already whole credits
      track('Shop Listed Item', {
        item_id: item.blockchainItemId,
        contract_address: item.contractAddress,
        price_credits: value,
        price_usd: value / 10,
        listing_type: 'primary',
        is_primary: true
      })
      toast.success(t('primaryList.toastOnSale', { name: item.name }))
      onListed?.(value)
      void queryClient.invalidateQueries({ queryKey: ['publishable-items'] })
      void queryClient.invalidateQueries({ queryKey: ['collection-sale-state'] })
      // A freshly-published item must appear (and be buyable) in the browse/catalog grids, the homepage
      // featured row and the cart cross-sell right away — without these it stays hidden until each list's
      // staleTime lapses. Mirrors ImportListings.afterMigrate.
      void queryClient.invalidateQueries({ queryKey: ['shop-items'] })
      void queryClient.invalidateQueries({ queryKey: ['catalog-items'] })
      void queryClient.invalidateQueries({ queryKey: ['overview-listings'] })
      void queryClient.invalidateQueries({ queryKey: ['upsell-listings'] })
    } catch (e) {
      captureError(e, { flow: 'list_primary' })
      track('Shop Listing Failed', { listing_type: 'primary', error_code: errorCode(e) })
      setError(friendlyError(e, t('primaryList.errorGeneric')))
      setStatus(null)
    } finally {
      setBusy(false)
    }
  }

  function viewInShop() {
    onClose()
    // A primary listing is item-level → the generic /item page (blockchainItemId is an itemId).
    navigate(itemRoute(item.contractAddress, item.blockchainItemId))
  }

  // Wallet-aware CTA. Idle wording still reflects the minter prereq (first listing from a collection
  // enables it); the busy label mirrors SellModal — managed wallets publish silently ("Publishing…"),
  // self-custody wallets must confirm in-wallet ("Confirm listing").
  const cta =
    enabled === null
      ? t('primaryList.checking')
      : busy
        ? isManaged
          ? t('primaryList.publishing')
          : t('primaryList.confirmListing')
        : enabled === false
          ? t('primaryList.enableAndPutOnSale')
          : t('primaryList.putOnSale')

  // ---- Success view ----------------------------------------------------------------------------
  if (listedCredits !== null) {
    return (
      <S.Scrim onClick={onClose} role="presentation">
        <S.Card
          onClick={e => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label={t('primaryList.successTitle')}
        >
          <S.Head>
            <S.Title>{t('primaryList.successTitle')}</S.Title>
            <S.Close onClick={onClose} aria-label={t('getCredits.done')}>
              <Icon name="close" className="ico" />
            </S.Close>
          </S.Head>
          <S.SuccessBanner>
            <S.SuccessCheck aria-hidden>
              <Icon name="check" className="ico" />
            </S.SuccessCheck>
            <S.SuccessText>
              <b>{item.name}</b>
            </S.SuccessText>
            <S.SuccessDetail>
              {t('primaryList.listedFor')}{' '}
              <strong>
                <CurrencyIcon className="ccy-mark" /> {listedCredits}
              </strong>{' '}
              {t('primaryList.dotAvailable', { count: item.remainingSupply })}
            </S.SuccessDetail>
          </S.SuccessBanner>
          <S.Actions>
            <S.OutlineBtn onClick={onClose}>{t('getCredits.done')}</S.OutlineBtn>
            <S.PurpleBtn onClick={viewInShop}>{t('primaryList.viewInShop')}</S.PurpleBtn>
          </S.Actions>
        </S.Card>
      </S.Scrim>
    )
  }

  return (
    <S.Scrim onClick={busy ? undefined : onClose} role="presentation">
      <S.Card
        data-testid="modal"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={t('primaryList.publishTitle', { name: item.name })}
      >
        <S.Head>
          <S.Title>{t('primaryList.publishTitle', { name: item.name })}</S.Title>
          <S.Close onClick={onClose} disabled={busy} aria-label={t('primaryList.cancel')}>
            <Icon name="close" className="ico" />
          </S.Close>
        </S.Head>

        <S.Subtitle>
          {t('primaryList.fromCollection', {
            collectionName: item.collectionName,
            count: item.remainingSupply
          })}
        </S.Subtitle>

        <S.AssetCard>
          <S.Thumb>{item.thumbnail ? <img src={item.thumbnail} alt="" /> : null}</S.Thumb>
          <S.AssetInfo>
            <S.AssetName>{item.name}</S.AssetName>
            {creatorName ? <S.AssetBy>{t('primaryList.byCreator', { name: creatorName })}</S.AssetBy> : null}
          </S.AssetInfo>
        </S.AssetCard>

        <S.Field>
          <S.FieldLabel>{t('primaryList.priceShort')}</S.FieldLabel>
          <S.InputBox aria-invalid={price.length > 0 && !priceValid}>
            <CurrencyIcon className="ccy" />
            <S.PriceInput
              type="number"
              min="1"
              step="1"
              inputMode="numeric"
              value={price}
              onChange={e => setPrice(e.target.value)}
              disabled={busy}
              aria-label={t('primaryList.priceLabel', { currency: CURRENCY.name })}
            />
            <S.UsdHint aria-hidden>{usdHint}</S.UsdHint>
          </S.InputBox>
        </S.Field>

        <S.Note>
          {t('primaryList.pricedInWhole', { currency: CURRENCY.name, currencySingular: CURRENCY.nameSingular })}
        </S.Note>

        {enabled === false && !busy ? (
          <S.Note>
            {isManaged
              ? t('primaryList.firstTimeManaged', { collectionName: item.collectionName })
              : t('primaryList.firstTimeConfirm', { collectionName: item.collectionName })}
          </S.Note>
        ) : enabled === true && !busy ? (
          <S.Note>{isManaged ? t('primaryList.readyManaged') : t('primaryList.readyConfirm')}</S.Note>
        ) : null}

        {status ? <S.Status>{status}</S.Status> : null}
        <ErrorNotice message={error} />

        <S.PrimaryBtn onClick={() => void publish()} disabled={busy || enabled === null || !priceValid}>
          {cta}
        </S.PrimaryBtn>
      </S.Card>
    </S.Scrim>
  )
}
