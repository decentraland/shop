import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { countConfirmations, type ImportPhase } from '~/lib/import'
import { Button } from '~/components/Button'
import type { Session } from '~/lib/auth'
import { importListing, RelistFailedError, type ImportItem } from '~/lib/import'
import { CURRENCY, creditsToUsd } from '~/lib/currency'
import { MY_CREATIONS } from '~/lib/routes'
import { CurrencyIcon } from '~/components/CurrencyIcon'
import { Price } from '~/components/Price'
import { showsWalletConfirmations } from '~/lib/wallet-kind'
import { track } from '~/lib/analytics'
import { captureError } from '~/lib/monitoring'
import { t } from '~/intl/i18n'
import { CheckmarkIcon } from '~/components/Icons/CheckmarkIcon'
import { AlertRingIcon } from '~/components/Icons/AlertRingIcon'
import * as M from '~/styles/modal.styles'
import * as S from './MigrateModal.styles'

export type MigrateEntry = { item: ImportItem; priceCredits: number }

/**
 * What a finished run actually did, reported to the caller so it can tell the seller the truth: a run
 * where nothing listed is not an update, and one with failures in it is not a success.
 *
 * `cancelled` counts the items the seller declined — a choice, not a failure.
 */
export type MigrateResult = { listed: number; failed: number; cancelled: number }
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
  onDone: (result: MigrateResult) => void
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
  const aborted = useRef(false)

  /**
   * The run. Starts once per mounted modal and drives every row's status from its outcome.
   *
   * `aborted` is a REF that this effect re-arms on every invocation, not a variable captured per
   * invocation. In dev, StrictMode mounts, tears down and re-mounts: a captured flag was set by that
   * teardown and never cleared (the second invocation returns early on `started`), which orphaned the
   * run that was already in flight — the listing went through, wallet prompts and all, while every
   * status update was discarded and the modal span forever. Re-arming here hands the same run back to
   * the UI it is driving.
   *
   * State writes are unguarded on purpose: setting state on an unmounted component is a no-op in React
   * 18, so the flag is only about whether to START the NEXT item.
   */
  useEffect(() => {
    aborted.current = false
    if (!started.current) {
      started.current = true

      if (showsConfirmations) {
        // `void` + catch: this is a hint, so a failed read must leave the vague wording standing rather than
        // surface an error or reject unhandled. countConfirmations already returns null on failure; the catch
        // covers anything it cannot (an import-time throw), so the modal can never break on a hint.
        void countConfirmations(
          queue.map(e => e.item),
          session.address
        )
          .then(c => {
            if (c) setPrompts({ approvals: c.approvals, total: c.total })
          })
          .catch(() => {
            /* keep the vague hint */
          })
      }

      const migrateItems = async () => {
        for (let i = 0; i < queue.length; i++) {
          if (aborted.current) return
          setStatuses(s => s.map((v, idx) => (idx === i ? 'active' : v)))
          try {
            await importListing(queue[i].item, queue[i].priceCredits, session, {
              onPhase: phase => setPhases(p => p.map((v, idx) => (idx === i ? phase : v)))
            })
            track('Shop Migrated Listing', {
              item_id: queue[i].item.itemId ?? queue[i].item.oldTradeId ?? null,
              contract_address: queue[i].item.contractAddress,
              new_price_credits: queue[i].priceCredits,
              new_price_usd: creditsToUsd(queue[i].priceCredits)
            })
            setStatuses(s => s.map((v, idx) => (idx === i ? 'done' : v)))
          } catch (e) {
            if (e instanceof RelistFailedError) {
              // Old listing already removed but re-listing failed → the item is now unlisted (not a plain
              // skip). Always capture it; the summary points the seller to re-list from My Assets.
              captureError(e, {
                flow: 'import_listing',
                step: 'relist',
                itemId: queue[i].item.itemId ?? queue[i].item.oldTradeId
              })
              setStatuses(s => s.map((v, idx) => (idx === i ? 'unlisted' : v)))
            } else {
              const err = e as { code?: number; message?: string }
              const rejected = err.code === 4001 || /reject|denied|cancel/i.test(err.message ?? '')
              if (!rejected)
                captureError(e, { flow: 'import_listing', itemId: queue[i].item.itemId ?? queue[i].item.oldTradeId })
              setStatuses(s => s.map((v, idx) => (idx === i ? (rejected ? 'skipped' : 'failed') : v)))
            }
          }
        }
        setPhase('finished')
      }

      void migrateItems()
    }

    return () => {
      aborted.current = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const listedCount = statuses.filter(s => s === 'done').length
  const activeIndex = statuses.findIndex(s => s === 'active')
  const progress = Math.round((statuses.filter(s => s !== 'pending' && s !== 'active').length / queue.length) * 100)

  // Declined by the seller, which is not a failure; 'failed' and 'unlisted' are.
  const cancelled = statuses.filter(s => s === 'skipped').length
  const failed = statuses.filter(s => s === 'failed').length
  const unlisted = statuses.filter(s => s === 'unlisted').length
  const failures = failed + unlisted

  function finish() {
    onDone({ listed: listedCount, failed: failures, cancelled })
    onClose()
  }

  /**
   * A clean finish closes itself. There is nothing to announce that the list behind this modal does not
   * say better: closing refetches it, so the seller lands on the rows they still have to move, or on the
   * all-set state if none are left. A congratulations card in front of that is a click between them and
   * the answer.
   *
   * A FAILURE is the exception and does NOT auto-close — it is the one outcome the seller has to be told
   * about, and closing onto the all-set card would report a success that did not happen. An item left
   * unlisted is the sharpest case: its old listing is gone and the re-list failed, so it is for sale
   * nowhere and has to be re-listed from My Items.
   */
  const closed = useRef(false)
  useEffect(() => {
    if (phase !== 'finished' || closed.current) return
    closed.current = true
    // A failure stays on screen and waits for the seller; only a clean run closes itself.
    if (failures > 0) return
    finish()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, failures])

  if (phase === 'finished') {
    if (failures === 0) return null
    return (
      <M.Backdrop role="presentation">
        <M.Modal
          data-failure
          role="dialog"
          aria-modal="true"
          data-testid={unlisted > 0 ? 'migrate-unlisted' : 'migrate-failed'}
        >
          <S.Outcome aria-hidden>
            <AlertRingIcon size={72} />
          </S.Outcome>
          <M.Title>{unlisted > 0 ? t('migrate.unlistedTitle') : t('migrate.failedTitle')}</M.Title>
          <p className="muted" style={{ margin: 0 }}>
            {unlisted > 0 ? t('migrate.unlistedSummary', { count: unlisted }) : ''}
            {failed > 0 ? (unlisted > 0 ? ' ' : '') + t('migrate.failedSummary', { count: failed }) : ''}
            {listedCount > 0 ? ' ' + t('migrate.listedSummary', { count: listedCount, currency: CURRENCY.name }) : ''}
            {cancelled > 0 ? ' ' + t('migrate.skippedSummary', { count: cancelled }) : ''}
          </p>
          <M.Actions data-actions>
            <Button variant="ghost" onClick={finish}>
              {t('getCredits.done')}
            </Button>
            {/* Only where it is the fix: an unlisted item has to be re-listed from My Items. A plain
                failure left the old listing standing, so there is nothing to do there. */}
            {unlisted > 0 ? (
              <Button
                variant="purple"
                onClick={() => {
                  onDone({ listed: listedCount, failed: failures, cancelled })
                  onClose()
                  navigate(MY_CREATIONS)
                }}
              >
                {t('migrate.goToMyAssets')}
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
                <CurrencyIcon className="ccy-mark" /> <Price credits={entry.priceCredits} />
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
                  <S.Fail>{t('migrate.statusFailed')}</S.Fail>
                ) : statuses[i] === 'unlisted' ? (
                  <S.Fail title={t('migrate.unlistedTooltip')}>{t('migrate.statusUnlisted')}</S.Fail>
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
