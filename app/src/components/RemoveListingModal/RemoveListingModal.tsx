import { useState } from 'react'
import { Button } from '~/components/Button'
import { Spinner } from '~/components/Spinner'
import { ErrorNotice } from '~/components/ErrorNotice'
import type { ListingEdit } from '~/components/ListingSteps'
import { captureError } from '~/lib/monitoring'
import { friendlyError, isRejection } from '~/lib/errors'
import { t } from '~/intl/i18n'
import * as M from '~/styles/modal.styles'
import * as S from './RemoveListingModal.styles'

/** Confirms taking a listing down, runs it, and keeps every outcome (error, unconfirmed relay, slow wait) inside the dialog. */
export function RemoveListingModal({
  name,
  managed,
  canPayGas,
  cancel,
  onClose
}: {
  name: string
  managed: boolean
  canPayGas: boolean
  cancel: ListingEdit['cancelCurrent']
  onClose: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [slow, setSlow] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [relayFailed, setRelayFailed] = useState<null | 'pending' | 'reverted'>(null)

  async function submit(payGas?: boolean) {
    setError(null)
    setRelayFailed(null)
    setBusy(true)
    try {
      const result = await cancel({ payGas, onWaiting: elapsed => setSlow(elapsed > 20_000) })
      if (result === 'ok') onClose()
      else setRelayFailed(result === 'relay-reverted' ? 'reverted' : 'pending')
    } catch (e) {
      const rejected = isRejection(e)
      if (!rejected) captureError(e, { flow: 'remove-listing' })
      const generic = t('myAssets.removeListingError')
      // Managed users never confirmed anything, so neither "you cancelled" nor wallet/network hints apply.
      setError(managed ? generic : rejected ? t('getCredits.errorCanceled') : friendlyError(e, generic))
    } finally {
      setBusy(false)
      setSlow(false)
    }
  }

  return (
    <M.Backdrop onClick={busy ? undefined : onClose} role="presentation">
      <S.Card
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={t('removeListing.title')}
        data-testid="remove-listing-modal"
      >
        <M.Head>
          <M.Title>{t('removeListing.title')}</M.Title>
        </M.Head>
        <p className="muted" style={{ margin: 0 }}>
          {t('removeListing.body', { name })}
        </p>

        {busy && slow ? (
          <p className="muted small" style={{ margin: 0 }} data-testid="cancel-slow">
            {t(canPayGas ? 'itemDetail.cancelSlow' : 'itemDetail.cancelSlowManaged')}
          </p>
        ) : null}

        {relayFailed ? (
          <p className="small" style={{ margin: 0 }} data-testid="cancel-gasless-failed">
            {!canPayGas
              ? t('itemDetail.cancelRelayRetry')
              : relayFailed === 'reverted'
                ? t('itemDetail.cancelRelayReverted')
                : t('itemDetail.cancelRelayFailed')}
            {canPayGas ? (
              <>
                {' '}
                <M.LinkBtn type="button" data-testid="cancel-pay-gas" onClick={() => void submit(true)} disabled={busy}>
                  {t('itemDetail.cancelPayGas')}
                </M.LinkBtn>
              </>
            ) : null}
          </p>
        ) : null}

        <ErrorNotice message={error} />

        <M.Actions data-actions>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            {t('sellModal.cancel')}
          </Button>
          <S.Submit onClick={() => void submit()} disabled={busy} data-testid="remove-confirm">
            {busy ? <Spinner size="small" /> : t('itemDetail.manageRemove')}
          </S.Submit>
        </M.Actions>
      </S.Card>
    </M.Backdrop>
  )
}

export default RemoveListingModal
