import { useEffect, useState } from 'react'
import { useLocation, useNavigate, Navigate } from 'react-router-dom'
import { useWallet } from '~/store/wallet'
import { config } from '~/config'
import { Button } from '~/components/Button'
import { Confetti } from '~/components/Confetti'
import { JumpInIcon } from '~/components/Icons/JumpInIcon'
import styled from '@emotion/styled'
import { showsWalletConfirmations } from '~/lib/wallet-kind'
import { waitForSettlement, SettlementPendingError } from '~/lib/buy-gasless'
import { fetchOwnsItem } from '~/lib/api'
import { formatCredits, CURRENCY } from '~/lib/currency'
import { isIapMode } from '~/lib/iap'
import { myItemsRouteFor } from '~/lib/routes'
import { useSeo } from '~/hooks/useSeo'
import { t } from '~/intl/i18n'
import type { CatalogItem } from '~/lib/api'
import * as S from './Success.styles'

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
  /**
   * EVERY settlement transaction, in the order they were signed — one receipt link each.
   *
   * A basket is normally one transaction, but a MIXED basket cannot be: CreditsManager.useCredits carries a
   * single external call, so trades and CollectionStore mints settle in one transaction per group (see
   * lib/buy.ts groupPurchases). Passing only the first hash silently dropped the other receipt — the buyer
   * saw a link for one half of a purchase they made in one go.
   *
   * `txHash` stays the FIRST of these: the settlement poll verifies a single hash, and a direct buy
   * (MarketCheckout) only ever has one. Producers with one transaction may send just `txHash`.
   */
  txHashes?: string[]
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

/**
 * DEV-ONLY preview of the confirmed screen: `/success?demo=1` synthesises the router state a real purchase
 * hands over, so the completed page — and the confetti on it — can be reviewed on localhost without paying
 * for anything. `settled: true` skips the settlement poll, exactly as the cart's own post-checkout navigate
 * does, so it lands straight on the confirmed layout.
 *
 * Gated on `import.meta.env.DEV`, which Vite statically replaces with `false` in a production build: the
 * branch AND the fixture below are dropped from the bundle rather than merely never taken (the same
 * technique lib/featureFlags uses for its local flag overrides). A query string that could fake a purchase
 * confirmation in production would be a phishing primitive, not a convenience.
 */
function demoState(search: string): SuccessNavState | null {
  if (!import.meta.env.DEV) return null
  if (new URLSearchParams(search).get('demo') !== '1') return null
  return {
    settled: true,
    items: [
      {
        id: 'demo-1',
        name: 'Demo Hat',
        creator: '',
        contractAddress: '0x0000000000000000000000000000000000000001',
        itemId: '1',
        category: 'wearable',
        rarity: 'legendary',
        network: 'MATIC',
        chainId: config.chainId,
        thumbnail: '',
        priceCredits: 12,
        gender: null,
        isSmart: false
      },
      {
        id: 'demo-2',
        name: 'Demo Emote',
        creator: '',
        contractAddress: '0x0000000000000000000000000000000000000002',
        itemId: '2',
        category: 'emote',
        rarity: 'rare',
        network: 'MATIC',
        chainId: config.chainId,
        thumbnail: '',
        priceCredits: 3,
        gender: null,
        isSmart: false,
        quantity: 2
      }
    ]
  }
}

const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

// The white tick inside the ruby "purchased" badge (rows + the topped-up credits pill).
const CheckMark = () => (
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
)

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

/**
 * Hands the purchase back to the iOS app: the same deep link the Marketplace already uses for this
 * (`decentraland://open?iap_enabled=true&urn=…`, see its SuccessPage), so the app opens the backpack on
 * what was just bought rather than on whatever it last showed.
 *
 * The urn is best-effort — only some catalog feeds return it (see CatalogItem.urn) — and a basket has
 * several items but the link carries one. First one wins: it is the anchor the backpack opens on, and the
 * rest are in there with it. With no urn at all the link still opens the app, just without a landing spot.
 */
function backpackDeepLink(items: Array<CatalogItem & { quantity?: number }>): string {
  const urn = items.find(i => i.urn)?.urn
  return `decentraland://open?iap_enabled=true${urn ? `&urn=${encodeURIComponent(urn)}` : ''}`
}

export function Success() {
  const { state: navState, search } = useLocation() as { state?: SuccessNavState; search: string }
  // A real purchase always arrives with router state; `?demo=1` stands in for one on a dev build only
  // (see demoState). Router state wins, so the demo can never mask an actual purchase.
  const state = navState ?? demoState(search)
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
  if (items.length === 0) return <Navigate to="/items" replace />

  const hero = items[0]

  // Every settlement transaction this purchase produced — usually one, but a mixed basket settles as one
  // per group. Falls back to the single `txHash` for producers that only have one.
  const txHashes = state?.txHashes?.length ? state.txHashes : txHash ? [txHash] : []

  // Self-custody users additionally get a link to the on-chain tx; managed users never see it.
  const showExplorer = txHashes.length > 0 && showsWalletConfirmations(session?.providerType)

  // One link per transaction. Numbered only when there IS more than one — a single purchase keeps reading
  // "View receipt", with no "1 of 1" to explain away.
  const receiptLink = showExplorer
    ? txHashes.map((hash, i) => (
        <S.Receipt key={hash} href={`${EXPLORER_TX}${hash}`} target="_blank" rel="noreferrer">
          {txHashes.length > 1
            ? t('success.viewTransactionNumbered', { n: i + 1, total: txHashes.length })
            : t('success.viewTransaction')}
        </S.Receipt>
      ))
    : null

  // Still working (or a dead-end) → a centered status panel. The pixel-perfect Figma layout
  // (green banner + item list + CTAs) is only the CONFIRMED state.
  if (settlement !== 'confirmed') {
    return (
      <S.Root>
        <S.Status>
          {settlement === 'pending' || settlement === 'indexing' ? (
            <>
              <S.Spinner className="spinner" aria-hidden />
              <S.Title>{settlement === 'indexing' ? t('success.finalizing') : t('success.processing')}</S.Title>
              <S.Sub>
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
              </S.Sub>
              {receiptLink ? <S.Links>{receiptLink}</S.Links> : null}
            </>
          ) : settlement === 'timed-out' ? (
            <>
              <S.Title>{t('success.stillProcessingTitle')}</S.Title>
              <S.Sub>
                {t('success.timedOutBefore')}{' '}
                <button className="link" onClick={() => navigate('/activity')}>
                  {t('nav.activity')}
                </button>{' '}
                {t('success.timedOutAfter')}
              </S.Sub>
              {receiptLink ? <S.Links>{receiptLink}</S.Links> : null}
              <S.Actions>
                <SuccessBtn variant="purple" onClick={() => navigate('/activity')}>
                  {t('success.viewActivity')}
                </SuccessBtn>
                <SuccessBtn variant="ghost" onClick={() => navigate('/items')}>
                  {t('success.keepShopping')}
                </SuccessBtn>
              </S.Actions>
            </>
          ) : (
            <>
              <S.Title>{t('success.failedTitle')}</S.Title>
              <S.Sub>{t('success.failedBody')}</S.Sub>
              {receiptLink ? <S.Links>{receiptLink}</S.Links> : null}
              <S.Actions>
                <SuccessBtn variant="purple" onClick={() => navigate('/items')}>
                  {t('success.backToShop')}
                </SuccessBtn>
              </S.Actions>
            </>
          )}
        </S.Status>
      </S.Root>
    )
  }

  // Confirmed — the Figma "Purchase completed" page (node 1182-232376): a green success banner, a
  // bordered card listing every purchased item (thumbnail + name + creator + credit price, divided by
  // hairlines), then the MY ASSETS / TRY IN WORLD CTAs.
  return (
    <S.Root>
      {/* Only on the CONFIRMED screen — the item is really the buyer's by here. Celebrating over a
          still-settling (or failed) purchase would be the worst possible moment for it. */}
      <Confetti />
      <S.Done>
        <S.Banner role="status">
          <S.BannerCheck aria-hidden>
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
          </S.BannerCheck>
          <S.BannerText>
            {/* The web copy points at the My Items tab, which the web view does not render — it says
                backpack there, which is where the app actually puts the item. */}
            <b>{t('success.bannerTitle')}</b> {isIapMode() ? t('success.bannerBodyIap') : t('success.bannerBody')}
          </S.BannerText>
        </S.Banner>

        <S.List>
          {/* Credits that landed with a mid-checkout top-up (buy-credits-and-item-together) — shown
              above the item list as the bundle added to the account. */}
          {creditsAdded ? (
            <S.Credits data-testid="success-credits">
              <S.RowCheck aria-hidden>
                <CheckMark />
              </S.RowCheck>
              <S.CreditsIco />
              <S.CreditsText>
                <S.CreditsAmount>
                  {t('getCredits.creditsAmount', { credits: creditsAdded, currency: CURRENCY.name })}
                </S.CreditsAmount>{' '}
                <S.CreditsAdded>{t('getCredits.creditsAdded')}</S.CreditsAdded>
              </S.CreditsText>
            </S.Credits>
          ) : null}
          {items.map((item, i) => {
            // A primary/mint line can be bought × N — show the line total (per-unit × qty) plus a
            // "× N" badge, mirroring the old in-cart complete modal.
            const qty = item.quantity ?? 1
            return (
              <S.ListRow key={item.id}>
                {i > 0 ? <S.Divider aria-hidden /> : null}
                <S.Row>
                  <S.RowThumb data-thumb>
                    {item.thumbnail ? <img src={item.thumbnail} alt="" /> : null}
                    <S.RowCheck aria-hidden>
                      <CheckMark />
                    </S.RowCheck>
                  </S.RowThumb>
                  <S.RowInfo data-info>
                    <S.RowName title={item.name}>
                      {item.name || t('buyModal.itemFallback')}
                      {qty > 1 ? <S.RowQty>{t('cartCheckout.qty', { count: qty })}</S.RowQty> : null}
                    </S.RowName>
                    {item.creator ? <S.RowCreator address={item.creator} linkToProfile /> : null}
                  </S.RowInfo>
                  <S.RowPrice data-price>
                    <S.RowPriceIco />
                    <span>{formatCredits(item.priceCredits * qty)}</span>
                  </S.RowPrice>
                </S.Row>
              </S.ListRow>
            )
          })}
        </S.List>

        {receiptLink ? <S.Links data-receipt>{receiptLink}</S.Links> : null}

        <S.Ctas>
          {/* Inside the iOS web view both CTAs hand off to the app instead of navigating the web view:
              MY ASSETS and TRY IN WORLD would open a shop page the app already covers and a launcher that
              cannot run there. No target="_blank" on the deep link — a custom scheme in a new tab leaves an
              orphaned blank one behind when the app takes over (Figma 2703:399357 Cart). */}
          {isIapMode() ? (
            <>
              <S.Cta data-variant="ghost" onClick={() => navigate('/overview')}>
                {t('success.done')}
              </S.Cta>
              <S.CtaLink data-variant="ruby" href={backpackDeepLink(items)}>
                {t('success.goToBackpack')}
              </S.CtaLink>
            </>
          ) : (
            <>
              <S.Cta data-variant="ghost" onClick={() => navigate(myItemsRouteFor(items.map(i => i.category)))}>
                {t('success.myAssets')}
              </S.Cta>
              <S.CtaLink data-variant="ruby" href={JUMP_URL} target="_blank" rel="noreferrer">
                {t('success.tryInWorld')}
                <S.CtaJump aria-hidden>
                  <JumpInIcon />
                </S.CtaJump>
              </S.CtaLink>
            </>
          )}
        </S.Ctas>
      </S.Done>
    </S.Root>
  )
}

export default Success
