import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Network } from '@dcl/schemas'
import type { Session } from '~/lib/auth'
import type { MyAsset } from '~/lib/api'
import { postTrade } from '~/lib/api'
import { createUsdPeggedListing, ensureApproval } from '~/lib/trades'
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

// yyyy-MM-dd in local time (the value shape a native <input type="date"> expects), avoiding a UTC shift.
function toDateInputValue(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function daysFromNow(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return toDateInputValue(d)
}

export function SellModal({ asset, session, onClose }: { asset: MyAsset; session: Session; onClose: () => void }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [price, setPrice] = useState('10') // whole credits
  const [expiresAt, setExpiresAt] = useState(() => daysFromNow(DEFAULT_EXPIRATION_IN_DAYS)) // yyyy-MM-dd
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [listedCredits, setListedCredits] = useState<number | null>(null)

  const priceValue = Number(price)
  const priceValid = Number.isInteger(priceValue) && priceValue > 0
  // Match the marketplace: a listing that expires at/before now is invalid.
  const expiresMs = expiresAt ? new Date(`${expiresAt} 00:00:00`).getTime() : NaN
  const dateValid = !!expiresAt && expiresMs > Date.now()
  const minDate = daysFromNow(1) // "must be in the future"
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
      setStatus(t('sellModal.statusPreparing'))
      await ensureApproval({
        signer: session.signer,
        contractAddress: asset.contractAddress,
        chainId: asset.chainId
      })

      setStatus(t('sellModal.statusListing'))
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

      setStatus(t('sellModal.statusPublishing'))
      await postTrade(trade, session.identity)

      setStatus(null)
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
    } catch (e) {
      captureError(e, { flow: 'list_secondary' })
      track('Shop Listing Failed', { listing_type: 'secondary', error_code: errorCode(e) })
      setError(friendlyError(e, t('sellModal.errorGeneric')))
      setStatus(null)
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
          <S.AssetName>{asset.name}</S.AssetName>
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
            <S.InputBox aria-invalid={!!expiresAt && !dateValid}>
              <S.DateInput
                type="date"
                min={minDate}
                value={expiresAt}
                onChange={e => setExpiresAt(e.target.value)}
                disabled={busy}
                aria-label={t('sellModal.expirationLabel')}
              />
              <Icon name="clock" className="cal" aria-hidden />
            </S.InputBox>
          </S.Field>
        </S.Fields>

        {status ? <S.Status>{status}</S.Status> : null}
        <ErrorNotice message={error} />

        <S.PrimaryBtn onClick={() => void list()} disabled={busy || !priceValid || !dateValid}>
          {busy ? t('sellModal.listing') : t('sellModal.putUpForSale')}
        </S.PrimaryBtn>
      </S.Card>
    </S.Scrim>
  )
}

export default SellModal
