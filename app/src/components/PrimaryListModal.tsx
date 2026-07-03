import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { ChainId, Network } from '@dcl/schemas'
import type { Session } from '~/lib/auth'
import type { PublishableItem } from '~/lib/builder'
import { postTrade } from '~/lib/api'
import { createPrimaryUsdPeggedListing, ensureMinter, isMarketplaceMinter } from '~/lib/trades'
import { toast } from '~/store/toast'
import { config } from '~/config'
import { CURRENCY } from '~/lib/currency'

const SIX_MONTHS_MS = 1000 * 60 * 60 * 24 * 182

function friendlyError(e: unknown): string {
  const err = e as { code?: number; message?: string }
  const msg = (err.message ?? '').toLowerCase()
  if (err.code === 4001 || msg.includes('reject') || msg.includes('denied') || msg.includes('cancel')) {
    return 'You cancelled the request.'
  }
  return "Couldn't publish your item — please try again."
}

export function PrimaryListModal({
  item,
  session,
  onClose
}: {
  item: PublishableItem
  session: Session
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [price, setPrice] = useState('1')
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // null = still checking; true/false = whether this collection is already enabled for Shop sales.
  const [enabled, setEnabled] = useState<boolean | null>(null)
  // Set once the listing is live — swaps the form for a success view.
  const [listedCredits, setListedCredits] = useState<number | null>(null)

  const chainId = config.chainId as ChainId

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
    if (!value || value <= 0) {
      setError('Enter a valid price')
      return
    }
    setBusy(true)
    try {
      // Minter prereq: the Shop can only fulfil sales of this collection once it's enabled. This is a
      // one-time step per collection; skipped automatically if already enabled.
      if (!enabled) {
        setStatus('Enabling sales for this collection…')
        await ensureMinter({ signer: session.signer, contractAddress: item.contractAddress, chainId })
        setEnabled(true)
      }

      setStatus('Publishing your item…')
      const trade = await createPrimaryUsdPeggedListing({
        signer: session.signer,
        item: {
          contractAddress: item.contractAddress,
          itemId: item.blockchainItemId,
          network: Network.MATIC,
          chainId
        },
        usdPrice: value,
        uses: item.remainingSupply,
        expiresAtMs: Date.now() + SIX_MONTHS_MS
      })

      setStatus('Finishing up…')
      await postTrade(trade, session.identity)

      setStatus(null)
      setListedCredits(Math.round(value * 10)) // 1 credit = $0.10
      toast.success(`“${item.name}” is now on sale!`)
      queryClient.invalidateQueries({ queryKey: ['publishable-items'] })
      queryClient.invalidateQueries({ queryKey: ['collection-sale-state'] })
    } catch (e) {
      console.error(e)
      setError(friendlyError(e))
      setStatus(null)
    } finally {
      setBusy(false)
    }
  }

  function viewInShop() {
    onClose()
    navigate(`/item/${item.contractAddress}/${item.blockchainItemId}`)
  }

  const cta = busy ? 'Working…' : enabled === false ? 'Enable & publish' : 'Publish for sale'

  // ---- Success view ----------------------------------------------------------------------------
  if (listedCredits !== null) {
    return (
      <div className="modal-backdrop" onClick={onClose} role="presentation">
        <div className="modal modal--success" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
          <div className="modal-success__check" aria-hidden>✓</div>
          <h2 className="modal__title">It’s on sale! 🎉</h2>
          {item.thumbnail ? <img className="modal__img" src={item.thumbnail} alt={item.name} /> : null}
          <p className="modal-success__name">{item.name}</p>
          <p className="muted small">
            Listed for <strong>{CURRENCY.symbol} {listedCredits}</strong> · {item.remainingSupply.toLocaleString()} available
          </p>
          <div className="modal__actions">
            <button className="btn btn--ghost" onClick={onClose}>
              Done
            </button>
            <button className="btn btn--purple" onClick={viewInShop}>
              View in Shop
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div className="modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
        <h2 className="modal__title">Publish “{item.name}”</h2>
        {item.thumbnail ? <img className="modal__img" src={item.thumbnail} alt={item.name} /> : null}

        <p className="muted small">
          From your collection “{item.collectionName}” · {item.remainingSupply.toLocaleString()} available
        </p>

        <label className="field">
          <span>Price (USD)</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={price}
            onChange={e => setPrice(e.target.value)}
            disabled={busy}
          />
        </label>
        <p className="muted small">Priced in USD. Buyers pay with {CURRENCY.name}.</p>

        {enabled === false && !busy ? (
          <p className="muted small primary-note">
            First time selling from “{item.collectionName}”? It needs a one-time approval, then you’ll confirm the
            listing — two quick confirmations. After this, listing more items from this collection is a single step.
          </p>
        ) : enabled === true && !busy ? (
          <p className="muted small primary-note">This collection is ready — publishing is a single confirmation.</p>
        ) : null}

        {status ? <p className="muted">{status}</p> : null}
        {error ? <p className="error">{error}</p> : null}

        <div className="modal__actions">
          <button className="btn btn--ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="btn" onClick={publish} disabled={busy || enabled === null}>
            {enabled === null ? 'Checking…' : cta}
          </button>
        </div>
      </div>
    </div>
  )
}
