import { useEffect, useState } from 'react'
import { useLocation, useNavigate, Navigate } from 'react-router-dom'
import { useWallet } from '~/store/wallet'
import { config } from '~/config'
import { Button } from '~/components/Button'
import { CurrencyIcon } from '~/components/CurrencyIcon'
import { CreatorBadge } from '~/components/CreatorBadge'
import styled from '@emotion/styled'
import { showsWalletConfirmations } from '~/lib/wallet-kind'
import { waitForSettlement, SettlementPendingError } from '~/lib/buy-gasless'
import { fetchOwnsItem } from '~/lib/api'
import { formatCredits, CURRENCY } from '~/lib/currency'
import { useSeo } from '~/hooks/useSeo'
import { t } from '~/intl/i18n'
import type { CatalogItem } from '~/lib/api'

// Settlement of the purchase, watched on this page so we NEVER claim success before the item is
// actually the buyer's AND queryable. Two gates:
//   1. the tx receipt (mined, status 1) — not reverted;
//   2. the indexer reflecting ownership — because My Assets reads the SAME index, and a confirmed tx
//      leads the index by however long the squid takes; declaring success on the receipt alone lands
//      the user on an empty My Assets.
// States: 'pending' = tx not yet mined; 'indexing' = mined, waiting for the index to show ownership;
// 'confirmed' = owned + indexed; 'failed' = reverted; 'timed-out' = mined but we stopped waiting (the
// item is bought and will appear shortly — never a false success, never a false failure).
type Settlement = 'pending' | 'indexing' | 'confirmed' | 'failed' | 'timed-out'

type OwnershipCheck = { owner: string; contractAddress: string; itemId: string }

// Router state handed to the /success page by every purchase flow (cart checkout, direct MarketCheckout
// buy, and the credits-topup resume). Exported so the producers share the EXACT shape — a renamed or
// dropped field is then a TS error at the navigate() call, not a silent runtime miss.
export type SuccessNavState = {
  // The cart sends per-line entries carrying `quantity` (a primary/mint line can be bought × N).
  items?: Array<CatalogItem & { quantity?: number }>
  txHash?: string
  // The cart already waited for full settlement before routing here → skip re-polling.
  settled?: boolean
  // Credits that landed with a mid-checkout top-up (buy-credits-and-item-together) — shown above the
  // item list on the combined success (Figma 1231-250927).
  creditsAdded?: number
}

const SuccessBtn = styled(Button)`
  min-width: 160px;
  text-align: center;
`

const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

function useSettlement(txHash: string | undefined, ownership: OwnershipCheck | null): Settlement {
  // No hash to verify (the cart already settled, or a managed credit buy) → don't block the page.
  const [state, setState] = useState<Settlement>(txHash ? 'pending' : 'confirmed')
  const ownerKey = ownership ? `${ownership.owner}-${ownership.contractAddress}-${ownership.itemId}` : ''
  useEffect(() => {
    if (!txHash) return
    let cancelled = false
    const checkSettlement = async () => {
      // Gate 1: wait for the tx receipt. ~5 min of polling (20 × 15s); a reverted tx fails fast.
      let mined = false
      for (let attempt = 0; attempt < 20 && !cancelled; attempt++) {
        try {
          await waitForSettlement(txHash, { timeoutMs: 15_000 })
          mined = true
          break
        } catch (e) {
          if (e instanceof SettlementPendingError) continue // still in flight → keep waiting
          if (!cancelled) setState('failed') // reverted on-chain: no asset was delivered
          return
        }
      }
      if (cancelled) return
      if (!mined) {
        setState('timed-out') // read RPC lagged the whole window — tx may still land
        return
      }
      // Gate 2: the tx is mined. If we can't check ownership (managed wallet / missing itemId), confirm
      // on the receipt alone. Otherwise poll the indexer so success implies it's in My Assets.
      if (!ownership) {
        setState('confirmed')
        return
      }
      setState('indexing')
      for (let attempt = 0; attempt < 40 && !cancelled; attempt++) {
        if (await fetchOwnsItem(ownership.owner, ownership.contractAddress, ownership.itemId)) {
          if (!cancelled) setState('confirmed')
          return
        }
        await delay(3000) // 40 × 3s = ~2 min
      }
      // Bought + mined, but the indexer hasn't caught up within the window. Not a failure — surface a
      // "will appear shortly" state instead of a false success over an empty wardrobe.
      if (!cancelled) setState('timed-out')
    }

    void checkSettlement()

    return () => {
      cancelled = true
    }
    // `ownerKey` is the stringified `ownership` — depend on it (not the object) so the poll doesn't
    // restart on a new object reference carrying identical values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txHash, ownerKey])
  return state
}

// Modern in-world entry: the launcher deep-link handled by decentraland.org/jump (zone on testnet).
// The old play.decentraland.* web client is deprecated. The item is already in the wardrobe.
const JUMP_URL = config.chainId === 80002 ? 'https://decentraland.zone/jump' : 'https://decentraland.org/jump'
// Block explorer for the settlement tx — shown ONLY to self-custody wallets (they understand
// explorers); managed/thirdweb users just get the in-app "View order". See lib/wallet-kind.ts.
const EXPLORER_TX = config.chainId === 80002 ? 'https://amoy.polygonscan.com/tx/' : 'https://polygonscan.com/tx/'

export function Success() {
  const { state } = useLocation() as { state?: SuccessNavState }
  const navigate = useNavigate()
  const { session } = useWallet()

  const txHash = state?.txHash
  const purchasedItems = state?.items ?? []
  // Credits that landed with a mid-checkout top-up (buy-credits-and-item-together) — shown above the
  // item list as the bundle added to the account (Figma 1231-250927). Absent for a plain purchase.
  const creditsAdded = state?.creditsAdded && state.creditsAdded > 0 ? state.creditsAdded : null
  // Gate success on the indexer showing ownership of the first purchased item (all items in a basket
  // settle in the same tx, so one being indexed means the batch is). Only when we have an address + a
  // mint itemId to query by; otherwise fall back to receipt-only confirmation.
  const first = purchasedItems[0]
  const ownership: OwnershipCheck | null =
    session?.address && first?.contractAddress && first?.itemId
      ? { owner: session.address, contractAddress: first.contractAddress, itemId: first.itemId }
      : null
  // The cart already waited for full settlement before routing here (state.settled) — skip re-polling
  // so it lands straight on the confirmed screen. Direct buys (MarketCheckout) navigate before settling,
  // so they still run the gates. Called before any early return to keep hook order stable.
  const settlement = useSettlement(state?.settled ? undefined : txHash, ownership)

  useSeo({ title: t('seo.success.title'), noindex: true })

  const items = purchasedItems
  // Direct hit / refresh with no purchase context → send home.
  if (items.length === 0) return <Navigate to="/assets" replace />

  const hero = items[0]

  // Self-custody users additionally get a link to the on-chain tx; managed users never see it.
  const showExplorer = !!txHash && showsWalletConfirmations(session?.providerType)

  const receiptLink = showExplorer ? (
    <a className="success__receipt" href={`${EXPLORER_TX}${txHash}`} target="_blank" rel="noreferrer">
      {t('success.viewTransaction')}
    </a>
  ) : null

  // Still working (or a dead-end) → a centered status panel. The pixel-perfect Figma layout
  // (green banner + item list + CTAs) is only the CONFIRMED state.
  if (settlement !== 'confirmed') {
    return (
      <div className="success">
        <div className="success__status">
          {settlement === 'pending' || settlement === 'indexing' ? (
            <>
              <span className="spinner success__spinner" aria-hidden />
              <h1 className="success__title">
                {settlement === 'indexing' ? t('success.finalizing') : t('success.processing')}
              </h1>
              <p className="success__sub">
                {settlement === 'indexing' ? (
                  <>
                    {t('success.indexingBefore')}{' '}
                    {items.length === 1 ? (
                      <strong>{hero.name}</strong>
                    ) : (
                      t('success.itemCount', { count: items.length })
                    )}{' '}
                    {t('success.indexingAfter')}
                  </>
                ) : (
                  <>
                    {t('success.confirmingBefore')}{' '}
                    {items.length === 1 ? (
                      <strong>{hero.name}</strong>
                    ) : (
                      t('success.itemCount', { count: items.length })
                    )}{' '}
                    {t('success.confirmingAfter')}
                  </>
                )}
              </p>
              {receiptLink ? <div className="success__links">{receiptLink}</div> : null}
            </>
          ) : settlement === 'timed-out' ? (
            <>
              <h1 className="success__title">{t('success.stillProcessingTitle')}</h1>
              <p className="success__sub">
                {t('success.timedOutBefore')}{' '}
                <button className="link" onClick={() => navigate('/activity')}>
                  {t('nav.activity')}
                </button>{' '}
                {t('success.timedOutAfter')}
              </p>
              {receiptLink ? <div className="success__links">{receiptLink}</div> : null}
              <div className="success__actions">
                <SuccessBtn variant="purple" onClick={() => navigate('/activity')}>
                  {t('success.viewActivity')}
                </SuccessBtn>
                <SuccessBtn variant="ghost" onClick={() => navigate('/assets')}>
                  {t('success.keepShopping')}
                </SuccessBtn>
              </div>
            </>
          ) : (
            <>
              <h1 className="success__title">{t('success.failedTitle')}</h1>
              <p className="success__sub">{t('success.failedBody')}</p>
              {receiptLink ? <div className="success__links">{receiptLink}</div> : null}
              <div className="success__actions">
                <SuccessBtn variant="purple" onClick={() => navigate('/assets')}>
                  {t('success.backToShop')}
                </SuccessBtn>
              </div>
            </>
          )}
        </div>
      </div>
    )
  }

  // Confirmed — the Figma "Purchase completed" page (node 1182-232376): a green success banner, a
  // bordered card listing every purchased item (thumbnail + name + creator + credit price, divided by
  // hairlines), then the MY ASSETS / TRY IN WORLD CTAs.
  return (
    <div className="success">
      <div className="success-done">
        <div className="success-banner" role="status">
          <span className="success-banner__check" aria-hidden>
            <svg viewBox="0 0 60 60" width="60" height="60">
              <circle cx="30" cy="30" r="30" fill="#34ce77" />
              <path
                d="M18 31l8 8 16-18"
                fill="none"
                stroke="#fff"
                strokeWidth="4.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <p className="success-banner__text">
            <b>{t('success.bannerTitle')}</b> {t('success.bannerBody')}
          </p>
        </div>

        <div className="success-list">
          {/* Credits that landed with a mid-checkout top-up (buy-credits-and-item-together) — shown
              above the item list as the bundle added to the account (Figma 1231-250927). */}
          {creditsAdded ? (
            <div className="success-credits" data-testid="success-credits">
              <CurrencyIcon className="success-credits__ico" />
              <p className="success-credits__text">
                <span className="success-credits__amount">
                  {t('getCredits.creditsAmount', { credits: creditsAdded, currency: CURRENCY.name })}
                </span>{' '}
                <span className="success-credits__added">{t('getCredits.creditsAdded')}</span>
              </p>
            </div>
          ) : null}
          {items.map((item, i) => {
            // A primary/mint line can be bought × N — show the line total (per-unit × qty) plus a
            // "× N" badge, mirroring the old in-cart complete modal.
            const qty = item.quantity ?? 1
            return (
              <div className="success-list__row" key={item.id}>
                {i > 0 ? <span className="success-list__divider" aria-hidden /> : null}
                <div className="success-row">
                  <div className="success-row__thumb">
                    {item.thumbnail ? <img src={item.thumbnail} alt="" /> : null}
                    <span className="success-row__check" aria-hidden>
                      <svg viewBox="0 0 18 18" width="12" height="12">
                        <path
                          d="M4 9l3.5 3.5L14 5"
                          fill="none"
                          stroke="#fff"
                          strokeWidth="2.4"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                  </div>
                  <div className="success-row__info">
                    <div className="success-row__name" title={item.name}>
                      {item.name || t('buyModal.itemFallback')}
                      {qty > 1 ? (
                        <span className="success-row__qty">{t('cartCheckout.qty', { count: qty })}</span>
                      ) : null}
                    </div>
                    {item.creator ? (
                      <CreatorBadge address={item.creator} className="success-row__creator" linkToProfile />
                    ) : null}
                  </div>
                  <div className="success-row__price">
                    <CurrencyIcon className="success-row__price-ico" />
                    <span>{formatCredits(item.priceCredits * qty)}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {receiptLink ? <div className="success__links success-done__receipt">{receiptLink}</div> : null}

        <div className="success-ctas">
          <button className="success-cta success-cta--ghost" onClick={() => navigate('/my-assets')}>
            {t('success.myAssets')}
          </button>
          <a className="success-cta success-cta--ruby" href={JUMP_URL} target="_blank" rel="noreferrer">
            {t('success.tryInWorld')}
            <span className="success-cta__jump" aria-hidden>
              <svg viewBox="0 0 24 24" width="20" height="20">
                <path
                  d="M5 12h12M13 7l5 5-5 5"
                  fill="none"
                  stroke="#fcfcfc"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          </a>
        </div>
      </div>
    </div>
  )
}

export default Success
