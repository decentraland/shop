import loaderLogo from '~/assets/credits/loader-logo.svg'
import * as M from '~/components/BuyModal/modal.styles'
import { t } from '~/intl/i18n'
import * as S from './ListingSteps.styles'

/** Where an edit-price submission is: taking the old listing down, then publishing the new one. */
export type ListingEditPhase = 'idle' | 'cancel' | 'list'

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

/** Buy-modal-style progress body. Self-custody sellers are told to confirm each step; managed ones just watch it happen. */
export function ListingSteps({ phase, managed, slow }: { phase: ListingEditPhase; managed: boolean; slow?: boolean }) {
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
