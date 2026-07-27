import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useWallet } from '~/store/wallet'
import { useBalance, balanceLabel } from '~/hooks/useBalance'
import { registerNameWithUsdCredits } from '~/lib/names'
import { showsWalletConfirmations } from '~/lib/wallet-kind'
import { Icon } from '~/components/Icon'
import { CurrencyIcon } from '~/components/CurrencyIcon'
import { formatCredits } from '~/lib/currency'
import { track, errorCode, isUserRejection } from '~/lib/analytics'
import { config } from '~/config'
import { t } from '~/intl/i18n'
import loaderLogo from '~/assets/credits/loader-logo.svg'
import * as S from './NameBuyModal.styles'

type Phase = 'confirm' | 'completing' | 'success' | 'error'

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
  const startedRef = useRef(false)

  const matches = reentry.trim().toLowerCase() === name.toLowerCase()
  const busy = phase === 'completing'
  const priceLabel = priceCredits != null ? formatCredits(priceCredits) : '—'

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
    if (!session || !matches || startedRef.current) return
    startedRef.current = true
    setPhase('completing')
    setError(null)
    try {
      await registerNameWithUsdCredits({ name, identity: session.identity, signer: session.signer })
      track('Shop Completed Purchase', {
        purchase_type: 'name',
        is_primary: true,
        payment_type: 'credits',
        value_credits: priceCredits ?? null
      })
      void qc.invalidateQueries({ queryKey: ['usd-balance'] })
      // A freshly registered NAME is a new owned asset — refresh My Assets (the Names section reads the
      // 'my-assets' family) so it shows up without waiting for the 30s staleTime or a manual reload.
      void qc.invalidateQueries({ queryKey: ['my-assets'] })
      setPhase('success')
    } catch (e) {
      track(isUserRejection(e) ? 'Shop Purchase Cancelled' : 'Shop Purchase Failed', {
        step: 'submit',
        error_code: errorCode(e),
        purchase_type: 'name'
      })
      setError((e as { message?: string })?.message || t('names.errorGeneric'))
      setPhase('error')
    } finally {
      startedRef.current = false
    }
  }

  const showHead = phase !== 'success'
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
                <S.PrimaryBtn onClick={() => setPhase('confirm')}>{t('names.tryAgain')}</S.PrimaryBtn>
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
                <S.PrimaryBtn onClick={() => void buy()} disabled={!matches || !session}>
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
                  navigate('/my-assets')
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
