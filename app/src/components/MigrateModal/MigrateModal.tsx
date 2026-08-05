import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { countConfirmations, type ImportPhase } from '~/lib/import'
import { Button } from '~/components/Button'
import type { Session } from '~/lib/auth'
import { importListing, RelistFailedError, type ImportItem } from '~/lib/import'
import { CURRENCY, creditsToUsd } from '~/lib/currency'
import { CurrencyIcon } from '~/components/CurrencyIcon'
import { showsWalletConfirmations } from '~/lib/wallet-kind'
import { track } from '~/lib/analytics'
import { captureError } from '~/lib/monitoring'
import { t } from '~/intl/i18n'
import { CheckmarkIcon } from '~/components/Icons/CheckmarkIcon'
import * as M from '~/styles/modal.styles'
import * as S from './MigrateModal.styles'

export type MigrateEntry = { item: ImportItem; priceCredits: number }
// 'unlisted' = the old listing was taken down but re-listing failed → the item now has NO listing and
// must be re-listed from My Assets (distinct from 'skipped', which leaves the old listing intact).
type Status = 'pending' | 'active' | 'done' | 'skipped' | 'failed' | 'unlisted'

// Lists a queue of old items into the Shop one at a time (each needs one confirmation). Shows live
// progress, then a congrats. Closing refreshes the pages behind it (via onDone).
/**
 * The active row's caption.
 *
 * Falls back to the previous generic wording until the first phase arrives, so the cell is never blank. The
 * wallet-kind split only applies to steps that PROMPT: a managed wallet signs without a dialog, so telling
 * its owner to "confirm" would be wrong, while the waiting steps read the same either way.
 */
function phaseLabel(phase: ImportPhase | null, showsConfirmations: boolean): string {
  switch (phase?.step) {
    case 'cancelling':
      return showsConfirmations ? t('migrate.phaseCancelConfirm') : t('migrate.phaseCancel')
    case 'confirming-cancel':
      // "the network" is not a thing a managed wallet's owner was ever shown. They saw no chain step to
      // begin with, so naming one here introduces a system they can't see and can't act on — for them
      // this is simply the tail of an action already under way.
      return showsConfirmations ? t('migrate.phaseConfirmingCancel') : t('migrate.phaseConfirmingCancelManaged')
    case 'authorising':
      return showsConfirmations ? t('migrate.phaseAuthoriseConfirm') : t('migrate.phaseAuthorise')
    case 'signing':
      return showsConfirmations ? t('migrate.phaseSignConfirm') : t('migrate.phaseSign')
    case 'publishing':
      return t('migrate.phasePublishing')
    case 'indexing':
      // The long wait. Naming the attempt is what tells a live retry apart from a hung request.
      return t('migrate.phaseIndexing', { attempt: phase.attempt, of: phase.of })
    default:
      return showsConfirmations ? t('migrate.statusConfirm') : t('migrate.statusAdding')
  }
}

export function MigrateModal({
  queue,
  session,
  onClose,
  onDone
}: {
  queue: MigrateEntry[]
  session: Session
  onClose: () => void
  onDone: () => void
}) {
  const navigate = useNavigate()
  const showsConfirmations = showsWalletConfirmations(session.providerType)
  // Per-row phase so the spinner can say what it is waiting on. Only the active row ever holds one.
  const [phases, setPhases] = useState<(ImportPhase | null)[]>(() => queue.map(() => null))
  /**
   * The real number of prompts, read from the chain before anything is signed.
   *
   * null means "not counted" — either still reading, or a read failed — and renders the old vague wording.
   * Only self-custody wallets ever see a prompt, so a managed wallet never pays for this read.
   */
  const [prompts, setPrompts] = useState<{ approvals: number; total: number } | null>(null)
  const [statuses, setStatuses] = useState<Status[]>(() => queue.map(() => 'pending'))
  const [phase, setPhase] = useState<'running' | 'finished'>('running')
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true

    let cancelled = false

    if (showsConfirmations) {
      // `void` + catch: this is a hint, so a failed read must leave the vague wording standing rather than
      // surface an error or reject unhandled. countConfirmations already returns null on failure; the catch
      // covers anything it cannot (an import-time throw), so the modal can never break on a hint.
      void countConfirmations(
        queue.map(e => e.item),
        session.address
      )
        .then(c => {
          if (!cancelled && c) setPrompts({ approvals: c.approvals, total: c.total })
        })
        .catch(() => {
          /* keep the vague hint */
        })
    }

    const migrateItems = async () => {
      for (let i = 0; i < queue.length; i++) {
        if (cancelled) return
        setStatuses(s => s.map((v, idx) => (idx === i ? 'active' : v)))
        try {
          await importListing(queue[i].item, queue[i].priceCredits, session, {
            onPhase: phase => {
              if (!cancelled) setPhases(p => p.map((v, idx) => (idx === i ? phase : v)))
            }
          })
          track('Shop Migrated Listing', {
            item_id: queue[i].item.itemId ?? queue[i].item.oldTradeId ?? null,
            contract_address: queue[i].item.contractAddress,
            new_price_credits: queue[i].priceCredits,
            new_price_usd: creditsToUsd(queue[i].priceCredits)
          })
          if (!cancelled) setStatuses(s => s.map((v, idx) => (idx === i ? 'done' : v)))
        } catch (e) {
          if (e instanceof RelistFailedError) {
            // Old listing already removed but re-listing failed → the item is now unlisted (not a plain
            // skip). Always capture it; the summary points the seller to re-list from My Assets.
            captureError(e, {
              flow: 'import_listing',
              step: 'relist',
              itemId: queue[i].item.itemId ?? queue[i].item.oldTradeId
            })
            if (!cancelled) setStatuses(s => s.map((v, idx) => (idx === i ? 'unlisted' : v)))
          } else {
            const err = e as { code?: number; message?: string }
            const rejected = err.code === 4001 || /reject|denied|cancel/i.test(err.message ?? '')
            if (!rejected)
              captureError(e, { flow: 'import_listing', itemId: queue[i].item.itemId ?? queue[i].item.oldTradeId })
            if (!cancelled) setStatuses(s => s.map((v, idx) => (idx === i ? (rejected ? 'skipped' : 'failed') : v)))
          }
        }
      }
      if (!cancelled) setPhase('finished')
    }

    void migrateItems()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const listedCount = statuses.filter(s => s === 'done').length
  const activeIndex = statuses.findIndex(s => s === 'active')
  const progress = Math.round((statuses.filter(s => s !== 'pending' && s !== 'active').length / queue.length) * 100)

  function finish() {
    onDone()
    onClose()
  }

  if (phase === 'finished') {
    const skipped = statuses.filter(s => s === 'skipped' || s === 'failed').length
    const unlisted = statuses.filter(s => s === 'unlisted').length
    return (
      <M.Backdrop role="presentation">
        <M.Modal data-success role="dialog" aria-modal="true">
          <M.SuccessCheck aria-hidden>
            <CheckmarkIcon size={30} />
          </M.SuccessCheck>
          <M.Title>{listedCount > 0 ? t('migrate.successTitle') : t('migrate.nothingTitle')}</M.Title>
          <p className="muted" style={{ margin: 0 }}>
            {listedCount > 0
              ? t('migrate.listedSummary', { count: listedCount, currency: CURRENCY.name })
              : t('migrate.noneListed')}
            {skipped > 0 ? ' ' + t('migrate.skippedSummary', { count: skipped }) : ''}
            {unlisted > 0 ? ' ' + t('migrate.unlistedSummary', { count: unlisted }) : ''}
          </p>
          <M.Actions data-actions>
            <Button variant="ghost" onClick={finish}>
              {t('getCredits.done')}
            </Button>
            {unlisted > 0 ? (
              <Button
                variant="purple"
                onClick={() => {
                  onDone()
                  onClose()
                  navigate('/my-items')
                }}
              >
                {t('migrate.goToMyAssets')}
              </Button>
            ) : listedCount > 0 ? (
              <Button
                variant="purple"
                onClick={() => {
                  onDone()
                  onClose()
                  navigate('/items')
                }}
              >
                {t('migrate.viewInShop')}
              </Button>
            ) : null}
          </M.Actions>
        </M.Modal>
      </M.Backdrop>
    )
  }

  return (
    <M.Backdrop role="presentation">
      <S.Modal data-testid="modal" role="dialog" aria-modal="true" aria-live="polite">
        <M.Title>{t('migrate.listingTitle')}</M.Title>
        <p className="muted small" style={{ margin: '0 0 4px' }}>
          {showsConfirmations ? t('migrate.subConfirm') : t('migrate.subManaged')}{' '}
          {activeIndex >= 0 ? t('migrate.progressCount', { current: activeIndex + 1, total: queue.length }) : ''}
        </p>

        <S.Progress>
          <S.Bar style={{ width: `${progress}%` }} />
        </S.Progress>

        <S.List>
          {queue.map((entry, i) => (
            <S.Row data-status={statuses[i]} key={entry.item.oldTradeId}>
              <S.Thumb>{entry.item.thumbnail ? <img src={entry.item.thumbnail} alt="" /> : null}</S.Thumb>
              <S.Name title={entry.item.name}>{entry.item.name || t('migrate.itemFallback')}</S.Name>
              <S.Price>
                <CurrencyIcon className="ccy-mark" /> {entry.priceCredits.toLocaleString()}
              </S.Price>
              <S.Status data-testid={statuses[i] === 'active' ? 'migrate-active-status' : undefined}>
                {statuses[i] === 'active' ? (
                  <>
                    <S.Spin className="spinner" aria-hidden /> {phaseLabel(phases[i], showsConfirmations)}
                  </>
                ) : statuses[i] === 'done' ? (
                  <S.Tick>
                    <CheckmarkIcon />
                  </S.Tick>
                ) : statuses[i] === 'skipped' ? (
                  <S.Skip>{t('migrate.statusSkipped')}</S.Skip>
                ) : statuses[i] === 'failed' ? (
                  <S.Skip>{t('migrate.statusFailed')}</S.Skip>
                ) : statuses[i] === 'unlisted' ? (
                  <S.Skip title={t('migrate.unlistedTooltip')}>{t('migrate.statusUnlisted')}</S.Skip>
                ) : (
                  <S.Wait>{t('migrate.statusWaiting')}</S.Wait>
                )}
              </S.Status>
            </S.Row>
          ))}
        </S.List>

        <S.Hint className="muted small">
          {!showsConfirmations
            ? t('migrate.hintManaged')
            : prompts
              ? t(prompts.approvals > 0 ? 'migrate.hintCountApproval' : 'migrate.hintCount', { total: prompts.total })
              : t('migrate.hintConfirm')}
        </S.Hint>
      </S.Modal>
    </M.Backdrop>
  )
}
