import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '~/components/Button'
import { Network } from '@dcl/schemas'
import type { Session } from '~/lib/auth'
import type { MyAsset } from '~/lib/api'
import { postTrade } from '~/lib/api'
import { createUsdPeggedListing, ensureApproval } from '~/lib/trades'
import { toast } from '~/store/toast'
import { CURRENCY } from '~/lib/currency'
import { CurrencyIcon } from '~/components/CurrencyIcon'
import { track, errorCode } from '~/lib/analytics'
import { captureError } from '~/lib/monitoring'
import { t } from '~/intl/i18n'
import { friendlyError } from '~/lib/errors'
import { ErrorNotice } from '~/components/ErrorNotice'

const SIX_MONTHS_MS = 1000 * 60 * 60 * 24 * 182

export function SellModal({ asset, session, onClose }: { asset: MyAsset; session: Session; onClose: () => void }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [price, setPrice] = useState('10') // whole credits
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [listedCredits, setListedCredits] = useState<number | null>(null)

  async function list() {
    setError(null)
    const value = Number(price)
    if (!Number.isInteger(value) || value <= 0) {
      setError(t('sellModal.errorWholeNumber'))
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
        usdPrice: value / 10, // credits → USD (1 credit = $0.10)
        expiresAtMs: Date.now() + SIX_MONTHS_MS
      })

      setStatus(t('sellModal.statusPublishing'))
      await postTrade(trade, session.identity)

      setStatus(null)
      setListedCredits(value) // already whole credits
      track('Shop Listed Item', {
        item_id: asset.itemId ?? asset.tokenId ?? null,
        contract_address: asset.contractAddress,
        price_credits: value,
        price_usd: value / 10,
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

  function viewInShop() {
    onClose()
    navigate(`/item/${asset.contractAddress}/${asset.tokenId}`)
  }

  if (listedCredits !== null) {
    return (
      <div className="modal-backdrop" onClick={onClose} role="presentation">
        <div className="modal modal--success" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
          <div className="modal-success__check" aria-hidden>
            ✓
          </div>
          <h2 className="modal__title">{t('sellModal.successTitle')}</h2>
          {asset.image ? <img className="modal__img" src={asset.image} alt={asset.name} /> : null}
          <p className="modal-success__name">{asset.name}</p>
          <p className="muted small">
            {t('sellModal.listedFor')}{' '}
            <strong>
              <CurrencyIcon className="ccy-mark" /> {listedCredits}
            </strong>
          </p>
          <div className="modal__actions">
            <Button variant="ghost" onClick={onClose}>
              {t('getCredits.done')}
            </Button>
            <Button variant="purple" onClick={viewInShop}>
              {t('sellModal.viewInShop')}
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div className="modal" data-testid="modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
        <h2 className="modal__title">{t('sellModal.listTitle', { name: asset.name })}</h2>
        {asset.image ? <img className="modal__img" src={asset.image} alt={asset.name} /> : null}

        <label className="field">
          <span>{t('sellModal.priceLabel', { currency: CURRENCY.name })}</span>
          <input
            type="number"
            min="1"
            step="1"
            value={price}
            onChange={e => setPrice(e.target.value)}
            disabled={busy}
          />
        </label>
        <p className="muted small">
          {t('sellModal.pricedInWhole', { currency: CURRENCY.name, currencySingular: CURRENCY.nameSingular })}
        </p>

        {status ? <p className="muted">{status}</p> : null}
        <ErrorNotice message={error} />

        <div className="modal__actions">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t('sellModal.cancel')}
          </Button>
          <Button onClick={() => void list()} disabled={busy}>
            {busy ? t('sellModal.listing') : t('sellModal.putOnSale')}
          </Button>
        </div>
      </div>
    </div>
  )
}
