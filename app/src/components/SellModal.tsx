import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Network, ProviderType } from '@dcl/schemas'
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'
import type { Session } from '~/lib/auth'
import type { MyAsset } from '~/lib/api'
import { postTrade } from '~/lib/api'
import { createUsdPeggedListing, ensureApproval } from '~/lib/trades'
import { fetchCollection } from '~/lib/collections'
import { useProfile } from '~/hooks/useProfile'
import { capitalizeFirst } from '~/lib/text'
import { shortAddress } from '~/lib/address'
import { toast } from '~/store/toast'
import { CurrencyIcon } from '~/components/CurrencyIcon'
import { Icon } from '~/components/Icon'
import { track, errorCode } from '~/lib/analytics'
import { captureError } from '~/lib/monitoring'
import { t } from '~/intl/i18n'
import { friendlyError } from '~/lib/errors'
import { ErrorNotice } from '~/components/ErrorNotice'
import * as S from './SellModal.styles'

// Default listing lifetime, copied from the marketplace (DEFAULT_EXPIRATION_IN_DAYS = 30). No maximum is
// enforced there, and the only minimum is "must be in the future" — mirrored below (min = tomorrow).
const DEFAULT_EXPIRATION_IN_DAYS = 30

// A local-midnight Date `days` from today (midnight avoids a timezone shifting the chosen day).
function midnightDaysFromNow(days: number): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + days)
  return d
}

export function SellModal({
  asset,
  session,
  creator,
  onListed,
  onClose
}: {
  asset: MyAsset
  session: Session
  // The item's creator address (passed from the PDP). Shown as "By {name}" on the asset card.
  creator?: string
  // Fired with the whole-credit price the moment the listing is published — lets the PDP show the new
  // price immediately and refetch its money/manage queries authoritatively (fixes the stale-price bug).
  onListed?: (credits: number) => void
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  // Creator name for the asset card. Prefer the address the PDP passes; only if it's absent (modal opened
  // without a creator in scope) fall back to the collection's creator (one extra cached lookup).
  const { data: collectionMeta } = useQuery({
    queryKey: ['collection-meta', asset.contractAddress],
    enabled: !creator && !!asset.contractAddress,
    staleTime: 5 * 60_000,
    queryFn: () => fetchCollection(asset.contractAddress)
  })
  const creatorAddress = creator || collectionMeta?.creator
  const { data: creatorProfile } = useProfile(creatorAddress)
  const creatorName = creatorAddress
    ? creatorProfile?.name
      ? capitalizeFirst(creatorProfile.name)
      : shortAddress(creatorAddress)
    : null
  const [price, setPrice] = useState('10') // whole credits
  const [expiresDate, setExpiresDate] = useState<Date | null>(() => midnightDaysFromNow(DEFAULT_EXPIRATION_IN_DAYS))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [listedCredits, setListedCredits] = useState<number | null>(null)

  // Managed (web2/OTP) wallets sign with no popup — never show them "confirm in wallet" language; a
  // self-custody wallet must approve, so it does. (Same rule as the Edit-price CTA in ItemDetail.)
  const isManagedWallet =
    session.providerType === ProviderType.MAGIC || session.providerType === ProviderType.MAGIC_TEST

  const priceValue = Number(price)
  const priceValid = Number.isInteger(priceValue) && priceValue > 0
  // Match the marketplace: a listing that expires at/before now is invalid.
  const expiresMs = expiresDate ? expiresDate.getTime() : NaN
  const dateValid = !!expiresDate && expiresMs > Date.now()
  const minDate = midnightDaysFromNow(1) // "must be in the future"
  // USD equivalent hint (1 credit = $0.10).
  const usdHint = priceValid ? `$${(priceValue / 10).toFixed(2)}` : '$0'

  async function list() {
    setError(null)
    if (!priceValid) {
      setError(t('sellModal.errorWholeNumber'))
      return
    }
    if (!dateValid) {
      setError(t('sellModal.invalidDate'))
      return
    }
    setBusy(true)
    try {
      await ensureApproval({
        signer: session.signer,
        contractAddress: asset.contractAddress,
        chainId: asset.chainId
      })

      const trade = await createUsdPeggedListing({
        signer: session.signer,
        nft: {
          contractAddress: asset.contractAddress,
          tokenId: asset.tokenId,
          network: asset.network as Network,
          chainId: asset.chainId
        },
        usdPrice: priceValue / 10, // credits → USD (1 credit = $0.10)
        expiresAtMs: expiresMs
      })

      await postTrade(trade, session.identity)

      setListedCredits(priceValue) // already whole credits
      track('Shop Listed Item', {
        item_id: asset.itemId ?? asset.tokenId ?? null,
        contract_address: asset.contractAddress,
        price_credits: priceValue,
        price_usd: priceValue / 10,
        listing_type: 'secondary',
        is_primary: false
      })
      toast.success(t('sellModal.toastOnSale', { name: asset.name }))
      void queryClient.invalidateQueries({ queryKey: ['my-assets', session.address] })
      // Let the PDP show the new price at once and refetch its own money/manage queries.
      onListed?.(priceValue)
    } catch (e) {
      captureError(e, { flow: 'list_secondary' })
      track('Shop Listing Failed', { listing_type: 'secondary', error_code: errorCode(e) })
      setError(friendlyError(e, t('sellModal.errorGeneric')))
    } finally {
      setBusy(false)
    }
  }

  function goToMyItems() {
    onClose()
    navigate('/my-assets')
  }

  // Success state (Figma 1528-306276): green banner + manage-from-My-Items copy + My items / Done actions.
  if (listedCredits !== null) {
    return (
      <S.Scrim onClick={onClose} role="presentation">
        <S.Card
          onClick={e => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label={t('sellModal.successHeader')}
        >
          <S.Head>
            <S.Title>{t('sellModal.successHeader')}</S.Title>
            <S.Close onClick={onClose} aria-label={t('getCredits.done')}>
              <Icon name="close" className="ico" />
            </S.Close>
          </S.Head>
          <S.SuccessBanner>
            <S.SuccessCheck aria-hidden>
              <Icon name="check" className="ico" />
            </S.SuccessCheck>
            <S.SuccessText>
              <b>{t('sellModal.successOnSale')}</b> {t('sellModal.successManage')}
            </S.SuccessText>
          </S.SuccessBanner>
          <S.Actions>
            <S.OutlineBtn onClick={goToMyItems}>{t('sellModal.myItems')}</S.OutlineBtn>
            <S.PurpleBtn onClick={onClose}>{t('getCredits.done')}</S.PurpleBtn>
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
        aria-label={t('sellModal.sellProduct')}
      >
        <S.Head>
          <S.Title>{t('sellModal.sellProduct')}</S.Title>
          <S.Close onClick={onClose} disabled={busy} aria-label={t('sellModal.cancel')}>
            <Icon name="close" className="ico" />
          </S.Close>
        </S.Head>

        <S.Subtitle>{t('sellModal.subtitle')}</S.Subtitle>

        <S.AssetCard>
          <S.Thumb>{asset.image ? <img src={asset.image} alt="" /> : null}</S.Thumb>
          <S.AssetInfo>
            <S.AssetName>{asset.name}</S.AssetName>
            {creatorName ? <S.AssetBy>{t('sellModal.byCreator', { name: creatorName })}</S.AssetBy> : null}
          </S.AssetInfo>
        </S.AssetCard>

        <S.Fields>
          <S.Field>
            <S.FieldLabel>{t('sellModal.priceShort')}</S.FieldLabel>
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
                aria-label={t('sellModal.priceLabel', { currency: 'credits' })}
              />
              <S.UsdHint aria-hidden>{usdHint}</S.UsdHint>
            </S.InputBox>
          </S.Field>

          <S.Field>
            <S.FieldLabel>{t('sellModal.expirationLabel')}</S.FieldLabel>
            <S.DateField data-invalid={!!expiresDate && !dateValid}>
              <DatePicker
                selected={expiresDate}
                onChange={setExpiresDate}
                minDate={minDate}
                dateFormat="MM/dd/yyyy"
                placeholderText="MM/DD/YYYY"
                disabled={busy}
                showIcon
                showPopperArrow={false}
                todayButton={t('sellModal.today')}
                ariaLabelledBy={undefined}
                aria-label={t('sellModal.expirationLabel')}
              />
            </S.DateField>
          </S.Field>
        </S.Fields>

        <ErrorNotice message={error} />

        <S.PrimaryBtn onClick={() => void list()} disabled={busy || !priceValid || !dateValid}>
          {busy
            ? isManagedWallet
              ? t('sellModal.puttingOnSale')
              : t('sellModal.confirmListing')
            : t('sellModal.putUpForSale')}
        </S.PrimaryBtn>
      </S.Card>
    </S.Scrim>
  )
}

export default SellModal
