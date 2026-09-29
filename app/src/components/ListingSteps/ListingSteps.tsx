import { useEffect, useRef, useState } from 'react'
import loaderLogo from '~/assets/credits/loader-logo.svg'
import * as M from '~/components/BuyModal/modal.styles'
import { LinkBtn } from '~/styles/modal.styles'
import { captureError } from '~/lib/monitoring'
import { friendlyError } from '~/lib/errors'
import { t } from '~/intl/i18n'
import * as S from './ListingSteps.styles'

/** Outcome of taking the current listing down. Anything else is thrown. */
export type ListingCancelResult = 'ok' | 'relay-pending' | 'relay-reverted'

/** What a list modal needs to re-price an existing listing on the seller's behalf. */
export type ListingEdit = {
  /** The price the listing is at now, to seed the form. */
  currentCredits?: number
  /** Whether the seller can pay the fee themselves when the fee-less removal is not confirmed. */
  canPayGas: boolean
  cancelCurrent: (opts: { payGas?: boolean; onWaiting?: (elapsedMs: number) => void }) => Promise<ListingCancelResult>
}

export type RelayFailure = 'pending' | 'reverted'

/**
 * The edit half of a list modal: takes the current listing down before the new price is published, and
 * remembers that it is gone so a failed publish retries only the publish. `signal()` is aborted when the
 * modal unmounts, so an abandoned edit never publishes later.
 */
export function useListingEdit(edit: ListingEdit | undefined, setError: (message: string | null) => void) {
  const [cancelDone, setCancelDone] = useState(false)
  const [slow, setSlow] = useState(false)
  // The fee-less removal was not confirmed: 'pending' may still land, 'reverted' provably did not.
  const [cancelFailed, setCancelFailed] = useState<RelayFailure | null>(null)
  // Created in the effect so StrictMode's rehearsal unmount aborts a throwaway controller, not the live one.
  const unmounted = useRef<AbortController | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    unmounted.current = controller
    return () => controller.abort(new DOMException('Modal closed', 'AbortError'))
  }, [])

  // Resolves false when the listing is still up (the reason is already on screen), so the caller must not publish.
  async function cancelCurrent(payGas?: boolean): Promise<boolean> {
    if (!edit || cancelDone) return true
    setCancelFailed(null)
    try {
      const result = await edit.cancelCurrent({ payGas, onWaiting: elapsed => setSlow(elapsed > 20_000) })
      if (result !== 'ok') {
        setCancelFailed(result === 'relay-reverted' ? 'reverted' : 'pending')
        return false
      }
      setCancelDone(true)
      return true
    } catch (e) {
      captureError(e, { flow: 'edit_price_cancel' })
      setError(friendlyError(e, t('listingEdit.cancelFailed')))
      return false
    } finally {
      setSlow(false)
    }
  }

  return { cancelDone, slow, cancelFailed, setCancelFailed, cancelCurrent, signal: () => unmounted.current?.signal }
}

/** The fee-less removal was not confirmed. Not an error: it may still land, so the seller gets their options, not a "try again". */
export function RelayNotice({
  state,
  canPayGas,
  busy,
  onPayGas,
  onLater,
  testId = 'edit-cancel-relay-failed'
}: {
  state: RelayFailure
  canPayGas: boolean
  busy: boolean
  onPayGas: () => void
  onLater?: () => void
  testId?: string
}) {
  return (
    <S.Relay data-testid={testId}>
      {!canPayGas
        ? t('itemDetail.cancelRelayRetry')
        : state === 'reverted'
          ? t('itemDetail.cancelRelayReverted')
          : t('itemDetail.cancelRelayFailed')}
      {canPayGas ? (
        <>
          {' '}
          <LinkBtn type="button" data-testid="cancel-pay-gas" onClick={onPayGas} disabled={busy}>
            {t('itemDetail.cancelPayGas')}
          </LinkBtn>
          {onLater ? (
            <>
              {' '}
              <LinkBtn type="button" data-testid="cancel-later" onClick={onLater} disabled={busy}>
                {t('itemDetail.cancelLater')}
              </LinkBtn>
            </>
          ) : null}
        </>
      ) : null}
    </S.Relay>
  )
}

/** Buy-modal-style progress body. Self-custody sellers are told to confirm each step; managed ones just watch it happen. */
export function ListingSteps({ phase, managed, slow }: { phase: 'cancel' | 'list'; managed: boolean; slow?: boolean }) {
  const total = 2
  const n = phase === 'list' ? 2 : 1
  const label = `listingEdit.${managed ? 'step' : 'confirm'}${phase === 'list' ? 'New' : 'Removal'}`
  return (
    <M.Body data-processing data-testid="listing-steps" role="status" aria-live="polite">
      <M.Logo src={loaderLogo} alt="" width={61} height={61} />
      <M.ProcessingText>{t(label)}</M.ProcessingText>
      <S.Bar>
        <M.Progress aria-hidden>
          <M.ProgressFill />
        </M.Progress>
        <S.Count data-testid="listing-steps-count">
          {n}/{total}
        </S.Count>
      </S.Bar>
      {slow ? <S.Hint data-testid="listing-steps-slow">{t('listingEdit.slow')}</S.Hint> : null}
    </M.Body>
  )
}

export default ListingSteps
