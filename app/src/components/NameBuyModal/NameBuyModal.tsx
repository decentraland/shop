import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useWallet } from '~/store/wallet'
import { useBalance, balanceLabel } from '~/hooks/useBalance'
import {
  NameNotRegisteredError,
  NameRouteCostTooHighError,
  NameSettlementUnknownError,
  registerNameWithUsdCredits
} from '~/lib/names'
import { showsWalletConfirmations } from '~/lib/wallet-kind'
import { Icon } from '~/components/Icon'
import { CurrencyIcon } from '~/components/CurrencyIcon'
import { formatCredits } from '~/lib/currency'
import { track, errorCode, isUserRejection, creditsToUsd } from '~/lib/analytics'
import { config } from '~/config'
import { t } from '~/intl/i18n'
import loaderLogo from '~/assets/credits/loader-logo.svg'
import nameGlyph from '~/assets/names/name-glyph.svg'
import nameVerified from '~/assets/names/name-verified.svg'
import * as S from './NameBuyModal.styles'

/**
 * `pending` is its own phase, NOT a flavour of success.
 *
 * Registering a NAME is cross-chain: the credit is spent on Polygon, and the NAME is minted on Ethereum by
 * an Across relayer afterwards. `registerNameWithUsdCredits` distinguishes the two outcomes precisely —
 * `registered` means the mint ran, `pending` means the money left but the bridge has not landed inside our
 * polling window — and showing "Purchase complete! You can find your NAME in the My Items tab" for the
 * second one sends the buyer to look for something that does not exist yet.
 */
type Phase = 'confirm' | 'completing' | 'success' | 'pending' | 'error'

/**
 * Buy-a-NAME flow. The name is already validated + probed available on the search page; here we make
 * the user RE-ENTER it (a deliberate confirmation gate, per Figma) and then register it with credits
 * via the shop's names lib. Web2 wording throughout: "purchase", never "transaction"/"wallet" — the
 * only relaxation is a generic "confirm" step for self-custody users (see CONVENTIONS.md).
 */
export function NameBuyModal({
  name,
  priceCredits,
  onClose
}: {
  name: string
  priceCredits: number | null
  onClose: () => void
}) {
  const { session } = useWallet()
  const { data: balance, isError: balanceError } = useBalance(session)
  const qc = useQueryClient()
  const navigate = useNavigate()

  const [phase, setPhase] = useState<Phase>('confirm')
  const [reentry, setReentry] = useState('')
  const [error, setError] = useState<string | null>(null)
  // Whether the credit is spent or may be, which decides if a retry is offered at all. Retrying on either
  // buys a second one — for the unknown case while the first may still be in flight.
  const [retryUnsafe, setRetryUnsafe] = useState(false)
  const startedRef = useRef(false)

  const matches = reentry.trim().toLowerCase() === name.toLowerCase()
  const busy = phase === 'completing'
  const priceLabel = priceCredits != null ? formatCredits(priceCredits) : '—'

  /**
   * Why the CTA needs more than "the name matches".
   *
   * A NAME is priced in MANA on-chain and paid in credits, so the price only exists while the MANA/USD
   * oracle answers. With no rate the row shows "—" and the purchase cannot be sized — `registerNameWithUsdCredits`
   * would read the oracle itself and throw ("mana rate unavailable/stale/incomplete") into the generic
   * error. Better to say so before the click than to fail after it.
   *
   * The balance was already on screen but never compared to the price, so someone short on credits reached
   * the server, failed `authorizeUsdCredit`, and got the same generic error — instead of "you need N more".
   * `balance` is undefined while loading and on error (see useBalance): in both cases we do NOT block, since
   * refusing a purchase because our own balance read failed is worse than letting the server decide.
   */
  const priceUnavailable = priceCredits == null
  const spendable = balance?.credits
  const shortBy = priceCredits != null && spendable != null ? priceCredits - spendable : 0
  const insufficient = shortBy > 0
  const blockedReason = priceUnavailable
    ? t('names.priceUnavailable')
    : insufficient
      ? t('names.insufficientCredits', { credits: formatCredits(shortBy) })
      : null

  // Lock body scroll + close on Escape (unless mid-purchase).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [busy, onClose])

  async function buy() {
    // Repeats every condition the CTA is disabled on, rather than trusting that it was. The button being
    // disabled is a UI fact; this is the money call, and it should be safe to invoke from anywhere.
    if (!session || !matches || priceUnavailable || insufficient || startedRef.current) return
    startedRef.current = true
    setPhase('completing')
    setError(null)
    try {
      const result = await registerNameWithUsdCredits({ name, identity: session.identity, signer: session.signer })
      // The money left the balance in both outcomes, so both refresh it and both count as a completed
      // purchase for analytics — what differs is only whether the NAME exists yet.
      track('Shop Completed Purchase', {
        // Same shape as every other purchase event so a NAME lands in the same warehouse columns
        // instead of being a special case that item-level and revenue cards silently drop.
        items: [
          {
            item_id: null,
            contract_address: null,
            token_id: null,
            price_usd: creditsToUsd(priceCredits ?? 0),
            category: 'name',
            is_smart: false
          }
        ],
        purchase_type: 'name',
        is_primary: true,
        payment_type: 'credits',
        value_credits: priceCredits ?? null,
        value_usd: creditsToUsd(priceCredits ?? 0),
        transaction_hash: result.originTxHash ?? null,
        settlement: result.status
      })
      void qc.invalidateQueries({ queryKey: ['usd-balance'] })
      // A freshly registered NAME is a new owned asset — refresh My Assets (the Names section reads the
      // 'my-assets' family) so it shows up without waiting for the 30s staleTime or a manual reload.
      void qc.invalidateQueries({ queryKey: ['my-assets'] })
      setPhase(result.status === 'registered' ? 'success' : 'pending')
    } catch (e) {
      track(isUserRejection(e) ? 'Shop Purchase Cancelled' : 'Shop Purchase Failed', {
        step: 'submit',
        error_code: errorCode(e),
        purchase_type: 'name'
      })
      // The route-cost guard is a DISTINCT condition and gets its own copy. The credits-server withholds
      // the route (503 ROUTE_COST_TOO_HIGH) when Across' bridge overhead exceeds what the executor can
      // front; the lib types it separately and rethrows it unwrapped for exactly this. It is temporary and
      // nothing is wrong with the buyer's account, so "try again" is the wrong advice — "try again later" is.
      // Two failures where the credit is gone or may be, so retrying spends a second one on something the
      // buyer cannot fix. Each gets its own copy, and neither gets a retry button below.
      const notRegistered = e instanceof NameNotRegisteredError
      const unknown = e instanceof NameSettlementUnknownError
      setError(
        e instanceof NameRouteCostTooHighError
          ? t('names.errorRouteCost')
          : notRegistered
            ? t('names.errorNotRegistered')
            : unknown
              ? t('names.errorSettlementUnknown')
              : (e as { message?: string })?.message || t('names.errorGeneric')
      )
      setRetryUnsafe(notRegistered || unknown)
      setPhase('error')
    } finally {
      startedRef.current = false
    }
  }

  const showHead = phase !== 'success' && phase !== 'pending'
  const selfCustody = showsWalletConfirmations(session?.providerType)

  return (
    <S.Scrim onClick={busy ? undefined : onClose} role="presentation">
      <S.Card role="dialog" aria-modal="true" aria-label={t('names.buyTitle')} onClick={e => e.stopPropagation()}>
        {showHead && (
          <>
            <S.HeadRow>
              <S.Title>{phase === 'error' ? t('names.errorTitle') : t('names.buyTitle')}</S.Title>
              <S.Close onClick={onClose} disabled={busy} aria-label={t('buyModal.close')}>
                <Icon name="close" />
              </S.Close>
            </S.HeadRow>
            <S.Balance>
              {t('names.myCreditsBalance')} <CurrencyIcon /> {balanceLabel(balance, balanceError)}
            </S.Balance>
            <S.Divider />
          </>
        )}

        {(phase === 'confirm' || phase === 'error') && (
          <>
            <S.NameRow>
              <S.Thumb aria-hidden>@</S.Thumb>
              <S.NameMeta>
                <S.NameText>
                  {name}
                  <span>.dcl.eth</span>
                </S.NameText>
                <S.NameSub>{t('names.subtitle')}</S.NameSub>
              </S.NameMeta>
              <S.RowPrice>
                <CurrencyIcon />
                {priceLabel}
              </S.RowPrice>
            </S.NameRow>

            {phase === 'error' ? (
              <>
                <S.ErrorBox>
                  <Icon name="info" aria-hidden />
                  <span>{error}</span>
                </S.ErrorBox>
                {retryUnsafe ? (
                  <S.PrimaryBtn onClick={onClose}>{t('names.errorSpentDismiss')}</S.PrimaryBtn>
                ) : (
                  <S.PrimaryBtn onClick={() => setPhase('confirm')}>{t('names.tryAgain')}</S.PrimaryBtn>
                )}
              </>
            ) : (
              <>
                <S.Confirm>
                  <S.ConfirmTitle>{t('names.confirmTitle')}</S.ConfirmTitle>
                  <S.ConfirmBody
                    dangerouslySetInnerHTML={{
                      __html: t('names.confirmBody', { name: `<b>@${escapeHtml(name)}</b>` })
                    }}
                  />
                  <S.ReenterRow>
                    <S.ReenterAt aria-hidden>@</S.ReenterAt>
                    <S.ReenterInput
                      value={reentry}
                      onChange={e => setReentry(e.target.value.replace(/[^a-zA-Z0-9]/g, ''))}
                      placeholder="yourname"
                      aria-label={t('names.reenterAria')}
                      autoComplete="off"
                      spellCheck={false}
                      style={{ width: `${Math.max(reentry.length, 'yourname'.length)}ch` }}
                    />
                    <S.ReenterSuffix>.dcl.eth</S.ReenterSuffix>
                  </S.ReenterRow>
                </S.Confirm>
                {blockedReason ? (
                  <S.ErrorBox data-tone="info" data-testid="name-blocked-reason">
                    <Icon name="info" aria-hidden />
                    <span>{blockedReason}</span>
                  </S.ErrorBox>
                ) : null}
                <S.PrimaryBtn
                  onClick={() => void buy()}
                  disabled={!matches || !session || priceUnavailable || insufficient}
                >
                  {t('names.buyCta')}
                </S.PrimaryBtn>
              </>
            )}
          </>
        )}

        {phase === 'completing' && (
          <S.Processing>
            <S.Logo src={loaderLogo} alt="" width={56} height={56} />
            <S.ProcessingText>{selfCustody ? t('names.confirming') : t('names.completing')}</S.ProcessingText>
            <S.ProgressRow>
              <S.Progress aria-hidden>
                <span />
              </S.Progress>
              <S.ProgressCount>1/1</S.ProgressCount>
            </S.ProgressRow>
          </S.Processing>
        )}

        {/* Paid, but the NAME is not minted yet. Deliberately NOT the success screen: it must not send the
            buyer to My Items for something that is not there, and it must not offer "assign to avatar" for a
            NAME they do not hold yet. It reassures instead — the money is accounted for and the
            credits-server reconciler settles the reservation against the indexed consumption either way. */}
        {phase === 'pending' && (
          <>
            <S.HeadRow>
              <S.Title>{t('names.pendingHeaderTitle')}</S.Title>
              <S.Close onClick={onClose} aria-label={t('buyModal.close')}>
                <Icon name="close" />
              </S.Close>
            </S.HeadRow>
            <S.Balance>
              {t('names.myCreditsBalance')} <CurrencyIcon /> {balanceLabel(balance, balanceError)}
            </S.Balance>
            <S.Divider />

            <S.ErrorBox data-tone="info">
              <Icon name="info" aria-hidden />
              <span>
                <b>{t('names.pendingBannerBold')}</b> {t('names.pendingBannerRest')}
              </span>
            </S.ErrorBox>

            <S.NameRow style={{ marginTop: 20 }}>
              <S.Thumb aria-hidden>@</S.Thumb>
              <S.NameMeta>
                <S.NameText>
                  {name}
                  <span>.dcl.eth</span>
                </S.NameText>
                <S.NameSub>{t('names.subtitle')}</S.NameSub>
              </S.NameMeta>
              <S.RowPrice>
                <CurrencyIcon />
                {priceLabel}
              </S.RowPrice>
            </S.NameRow>

            <S.Actions>
              <S.OutlineBtn
                onClick={() => {
                  onClose()
                  navigate('/my-items')
                }}
              >
                {t('names.myItems')}
              </S.OutlineBtn>
            </S.Actions>
          </>
        )}

        {phase === 'success' && (
          <>
            <S.HeadRow>
              <S.Title>{t('names.successHeaderTitle')}</S.Title>
              <S.Close onClick={onClose} aria-label={t('buyModal.close')}>
                <Icon name="close" />
              </S.Close>
            </S.HeadRow>
            <S.Balance>
              {t('names.myCreditsBalance')} <CurrencyIcon /> {balanceLabel(balance, balanceError)}
            </S.Balance>
            <S.Divider />

            <S.SuccessBanner>
              <S.SuccessCheck aria-hidden>
                <Icon name="check" />
              </S.SuccessCheck>
              <S.SuccessText>
                <b>{t('names.successBannerBold')}</b> {t('names.successBannerRest')}
              </S.SuccessText>
            </S.SuccessBanner>

            <S.NameRow style={{ marginTop: 20 }}>
              {/* The NAME as a card, only on this screen: by now it is theirs. */}
              <S.NameTile data-testid="name-success-tile">
                <S.NameTileGlyph src={nameGlyph} alt="" aria-hidden width={47} height={47} />
                <S.NameTileLabel>
                  {/* The canonical name for assistive tech is the one in NameMeta below; this repeat is
                      visual. */}
                  <span aria-hidden>{name}</span>
                  <S.NameTileTick src={nameVerified} alt="" aria-hidden width={14} height={14} />
                </S.NameTileLabel>
              </S.NameTile>
              <S.NameMeta>
                <S.NameText>
                  {name}
                  <span>.dcl.eth</span>
                </S.NameText>
                <S.NameSub>{t('names.subtitle')}</S.NameSub>
              </S.NameMeta>
              {/* Credits, not MANA: it is what was charged, and the header states the credits balance two
                  lines above. (The Figma draws a Polygon mark here — confirmed stale.) */}
              <S.RowPrice>
                <CurrencyIcon />
                {priceLabel}
              </S.RowPrice>
            </S.NameRow>

            <S.Actions>
              <S.OutlineBtn
                onClick={() => {
                  onClose()
                  navigate('/my-items')
                }}
              >
                {t('names.myItems')}
              </S.OutlineBtn>
              <S.RubyBtn href={config.profileUrl} target="_blank" rel="noopener noreferrer">
                {t('names.assignToAvatar')}
              </S.RubyBtn>
            </S.Actions>
          </>
        )}
      </S.Card>
    </S.Scrim>
  )
}

// The confirm copy interpolates the selected name into bold markup; escape it so a name can never
// inject HTML (defence-in-depth — names are already alphanumeric-only).
function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string
  )
}

export default NameBuyModal
