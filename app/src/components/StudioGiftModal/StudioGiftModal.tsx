import { useEffect, useMemo, useRef, useState } from 'react'
import { useBlocker } from 'react-router-dom'
import type { AuthIdentity } from '@dcl/crypto'
import { Button } from '~/components/Button'
import { t } from '~/intl/i18n'
import { formatCreditsAmount as credits, formatCreditsFull, usdCentsToCreditsFloor } from '~/lib/currency'
import { formatDateTime } from '~/lib/dates'
import { shortAddress } from '~/lib/address'
import { confirmDiscardUnsaved, hasUnsavedChanges, setUnsavedChanges } from '~/lib/unsavedChanges'
import {
  createGiftRows,
  findLikelyRepeats,
  getMyStudio,
  giftFromStudio,
  isBlankRow,
  isRetryable,
  isSameBatch,
  MAX_REASON_LENGTH,
  parsePastedRows,
  parseTypedTotal,
  readPendingBatch,
  readUnfinishedBatch,
  saveBatchProgress,
  startGiftBatch,
  stopBatch,
  validateRows,
  writePendingBatch,
  type BatchProblem,
  type DraftRow,
  type OperatorStudio,
  type PastedRows,
  type PendingBatch,
  type RowProblem
} from '~/lib/studio'
import * as M from '~/styles/modal.styles'
import * as S from './StudioGiftModal.styles'

type Step = 'edit' | 'confirm' | 'run'

/** A row being edited, with an id of its own so removing one never moves another's input or focus. */
type EditRow = DraftRow & { id: number }

function rowProblemText(problem: RowProblem): string {
  switch (problem.code) {
    case 'duplicate':
      return t('studio.modal.problem.duplicate', { row: problem.duplicateOf })
    case 'overMax':
      return t('studio.modal.problem.overMax', { credits: credits(problem.maxCredits) })
    default:
      return t(`studio.modal.problem.${problem.code}`)
  }
}

function batchProblemText(problem: BatchProblem): string {
  return problem.code === 'overBudget'
    ? t('studio.modal.problem.overBudget', { credits: credits(problem.totalCredits) })
    : t(`studio.modal.problem.${problem.code}`)
}

/**
 * Gifts Credits out of a studio's budget to one or more players: rows typed or pasted from a list, a review with
 * the total typed again and a warning for repeats of recent gifts, then the gifts sent one by one.
 *
 * The batch, with each row's idempotency key, is saved in this browser before the first gift is sent and kept
 * until every row is settled; closing this or reloading the page and coming back resumes THAT batch, and rows
 * already gifted are answered by the server as such instead of being gifted again.
 *
 * While gifts are being sent, leaving (another page, signing out, switching account, closing the tab) asks first;
 * leaving anyway, or pressing Stop, stops the batch after the gift being sent. A run never starts while another one
 * of the same batch is still finishing, and a run that is still finishing never saves over a list that was
 * forgotten or replaced since (see `startGiftBatch` and `saveBatchProgress`).
 */
export function StudioGiftModal({
  studio,
  account,
  identity,
  maxGrantCents,
  pending,
  onPendingChange,
  onGifted,
  onClose
}: {
  studio: OperatorStudio
  /** The signed-in account, which the saved batch belongs to. */
  account: string
  identity: AuthIdentity
  maxGrantCents: number | null
  pending: PendingBatch | null
  onPendingChange: (batch: PendingBatch | null) => void
  onGifted: () => void
  onClose: () => void
}) {
  const nextRowId = useRef(0)
  const newRow = (row: DraftRow = { account: '', credits: '', reason: '' }): EditRow => ({
    ...row,
    id: nextRowId.current++
  })
  const [step, setStep] = useState<Step>(pending?.rows.some(isRetryable) ? 'run' : 'edit')
  const [rows, setRows] = useState<EditRow[]>(() => [newRow()])
  const [sharedReason, setSharedReason] = useState('')
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [pasted, setPasted] = useState<Omit<PastedRows, 'rows'> | null>(null)
  const [confirmTotal, setConfirmTotal] = useState('')
  const [repeats, setRepeats] = useState<ReturnType<typeof findLikelyRepeats> | null>(null)
  const [running, setRunning] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [waitingSeconds, setWaitingSeconds] = useState<number | null>(null)
  const [stoppedBy, setStoppedBy] = useState<string | undefined>()
  // The browser would not save a new list, so it was not sent.
  const [notSaved, setNotSaved] = useState(false)
  // The list on screen is no longer the one saved (another tab replaced or forgot it, or saving stopped working).
  const [listChanged, setListChanged] = useState(false)
  // Each review asks for the recent gifts; only the latest one's answer may be shown.
  const latestReview = useRef(0)

  const check = useMemo(
    () => validateRows(rows, { sharedReason, maxGrantCents, balanceCents: studio.balanceCents }),
    [rows, sharedReason, maxGrantCents, studio.balanceCents]
  )
  const playerCount = rows.filter(row => !isBlankRow(row)).length
  const canReview = check.rowProblems.every(problem => problem === null) && check.batchProblems.length === 0
  const totalConfirmed = parseTypedTotal(confirmTotal) === check.totalCredits
  const leftToSend = pending ? pending.rows.filter(isRetryable).length : 0

  const updateRow = (id: number, patch: Partial<DraftRow>) =>
    setRows(current => current.map(row => (row.id === id ? { ...row, ...patch } : row)))

  const addPasted = () => {
    const { rows: added, ...report } = parsePastedRows(pasteText)
    setPasted(report)
    if (added.length > 0) {
      // Pasted rows replace a lone empty row instead of following it.
      setRows(current => [...current.filter(row => !isBlankRow(row)), ...added.map(row => newRow(row))])
      setPasteText('')
      setPasteOpen(false)
    }
  }

  const review = async () => {
    const reviewId = ++latestReview.current
    setConfirmTotal('')
    setRepeats(null)
    setStep('confirm')
    let found: ReturnType<typeof findLikelyRepeats>
    try {
      // The most recent gifts are enough to catch a list sent twice by mistake.
      const recent = await getMyStudio(studio.id, identity, { limit: 200, offset: 0 })
      found = findLikelyRepeats(
        createGiftRows(rows, sharedReason, () => ''),
        recent.gifts,
        { nowMs: Date.now() }
      )
    } catch {
      found = []
    }
    // An earlier review answering late must not show its warnings for rows that have since changed.
    if (reviewId === latestReview.current) setRepeats(found)
  }

  const run = async (initial: PendingBatch) => {
    setRunning(true)
    setStopping(false)
    setStoppedBy(undefined)
    setListChanged(false)
    // Started from the batch as last saved: a run that was still finishing may have moved it on since `initial`. Only
    // ever THIS list, though: if another one is saved now, or none, nothing is sent and the operator looks again.
    let batch = initial
    const result = await startGiftBatch(
      account,
      studio.id,
      () => {
        const stored = readPendingBatch(account, studio.id)
        if (!stored || !isSameBatch(stored, initial)) {
          setListChanged(true)
          return null
        }
        batch = stored
        return batch.rows
      },
      row =>
        giftFromStudio(
          studio.id,
          { account: row.account, credits: row.credits, reason: row.reason, key: row.key },
          identity
        ),
      // Saved before the next row is sent, so a reload finds exactly where the batch stood; never over another list.
      changed => {
        setWaitingSeconds(null)
        const next = { ...batch, rows: changed }
        if (saveBatchProgress(account, studio.id, next)) {
          onPendingChange(next)
        } else {
          // Progress that can't be saved over this list must not keep being made: stop after the gift being sent.
          setListChanged(true)
          void stopBatch(account, studio.id)
        }
      },
      { onWait: setWaitingSeconds }
    )
    setWaitingSeconds(null)
    setStoppedBy(result?.stoppedBy)
    setRunning(false)
    setStopping(false)
    if (!result) onPendingChange(readPendingBatch(account, studio.id))
    onGifted()
  }

  const gift = async () => {
    const batch: PendingBatch = { studioId: studio.id, rows: createGiftRows(rows, sharedReason), createdAt: Date.now() }
    // Saved before anything is sent, or not sent at all: an unsaved list loses its keys on a reload, and sending it
    // again after a lost answer would gift twice. From here on, this batch is what gets resumed.
    if (!writePendingBatch(account, studio.id, batch)) {
      setNotSaved(true)
      return
    }
    setNotSaved(false)
    onPendingChange(batch)
    setStep('run')
    await run(batch)
  }

  const stop = () => {
    setStopping(true)
    void stopBatch(account, studio.id)
  }

  const close = () => {
    if (running) return
    // A batch with nothing left to send or confirm is done and forgotten; one with rows left stays to be resumed.
    if (pending) onPendingChange(readUnfinishedBatch(account, studio.id))
    onClose()
  }

  const forget = () => {
    if (!window.confirm(t('studio.modal.forgetConfirm'))) return
    writePendingBatch(account, studio.id, null)
    onPendingChange(null)
    onClose()
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !running) close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // While gifts are being sent, everything that leaves asks first: the tab closing (beforeunload), another page in
  // the app (the blocker), and signing out or switching account (they ask `confirmDiscardUnsaved`).
  useEffect(() => {
    if (!running) return
    setUnsavedChanges(t('studio.modal.leaveConfirm'))
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (hasUnsavedChanges()) event.preventDefault()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      setUnsavedChanges(null)
    }
  }, [running])

  const blocker = useBlocker(() => running && hasUnsavedChanges())
  useEffect(() => {
    if (blocker.state !== 'blocked') return
    if (confirmDiscardUnsaved()) {
      setUnsavedChanges(null)
      blocker.proceed()
    } else {
      blocker.reset()
    }
  }, [blocker])

  // Leaving anyway stops every run of the batch after the gift being sent, so nothing keeps sending for a page
  // nobody is looking at. Continuing later picks it up with the same keys.
  useEffect(() => () => void stopBatch(account, studio.id), [account, studio.id])

  return (
    <M.Backdrop onClick={running ? undefined : close} role="presentation">
      <S.Card
        onClick={event => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={t('studio.modal.title')}
        data-testid="studio-gift-modal"
        data-step={step}
      >
        <M.Head>
          <M.Title>{t('studio.modal.title')}</M.Title>
        </M.Head>

        <S.Note>
          {t('studio.modal.budget', {
            studio: studio.name,
            credits: credits(usdCentsToCreditsFloor(studio.balanceCents))
          })}{' '}
          {maxGrantCents !== null
            ? t('studio.modal.max', { credits: credits(usdCentsToCreditsFloor(maxGrantCents)) })
            : null}{' '}
          {t('studio.modal.rules')}
        </S.Note>

        {step === 'edit' && (
          <>
            <S.Label>
              {t('studio.modal.sharedReason')}
              <S.Input
                value={sharedReason}
                maxLength={MAX_REASON_LENGTH}
                onChange={event => setSharedReason(event.target.value)}
                data-testid="studio-gift-shared-reason"
              />
              <small>{t('studio.modal.sharedReasonHelp')}</small>
            </S.Label>

            <S.Rows>
              {rows.map((row, index) => {
                const problem = check.rowProblems[index]
                const touched = row.account !== '' || row.credits !== ''
                return (
                  <S.Row key={row.id} data-testid="studio-gift-row">
                    <S.Cell data-cell="account">
                      <S.Input
                        aria-label={t('studio.modal.account')}
                        placeholder={t('studio.modal.account')}
                        value={row.account}
                        onChange={event => updateRow(row.id, { account: event.target.value })}
                        aria-invalid={touched && problem ? 'true' : undefined}
                        data-testid="studio-gift-account"
                      />
                    </S.Cell>
                    <S.Cell>
                      <S.Input
                        aria-label={t('studio.credits')}
                        placeholder={t('studio.credits')}
                        inputMode="numeric"
                        value={row.credits}
                        onChange={event => updateRow(row.id, { credits: event.target.value })}
                        data-testid="studio-gift-credits"
                      />
                    </S.Cell>
                    <S.Cell>
                      <S.Input
                        aria-label={t('studio.modal.rowReason')}
                        placeholder={sharedReason || t('studio.modal.rowReason')}
                        maxLength={MAX_REASON_LENGTH}
                        value={row.reason}
                        onChange={event => updateRow(row.id, { reason: event.target.value })}
                      />
                    </S.Cell>
                    <S.RemoveButton
                      type="button"
                      aria-label={t('studio.modal.remove')}
                      onClick={() =>
                        setRows(current =>
                          current.length === 1 ? [newRow()] : current.filter(item => item.id !== row.id)
                        )
                      }
                    >
                      ×
                    </S.RemoveButton>
                    {touched && problem ? (
                      <S.Problem data-cell="problem" data-testid="studio-gift-problem">
                        {rowProblemText(problem)}
                      </S.Problem>
                    ) : null}
                  </S.Row>
                )
              })}
            </S.Rows>

            <S.Inline>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setRows(current => [...current, newRow()])}
                data-testid="studio-gift-add"
              >
                {t('studio.modal.addPlayer')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPasteOpen(open => !open)}
                data-testid="studio-gift-paste-toggle"
              >
                {t('studio.modal.paste')}
              </Button>
            </S.Inline>

            {pasteOpen ? (
              <S.Label>
                {t('studio.modal.paste')}
                <S.Textarea
                  value={pasteText}
                  placeholder={t('studio.modal.pastePlaceholder')}
                  onChange={event => setPasteText(event.target.value)}
                  data-testid="studio-gift-paste"
                />
                <small>{t('studio.modal.pasteHelp')}</small>
                <S.Inline>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={addPasted}
                    disabled={!pasteText.trim()}
                    data-testid="studio-gift-paste-add"
                  >
                    {t('studio.modal.pasteAdd')}
                  </Button>
                </S.Inline>
              </S.Label>
            ) : null}
            {pasted?.header ? (
              <S.Summary data-testid="studio-gift-paste-header">
                {t('studio.modal.pasteHeader', { line: pasted.header })}
              </S.Summary>
            ) : null}
            {pasted && pasted.badLines.length > 0 ? (
              <S.ErrorText>{t('studio.modal.pasteBadLines', { lines: pasted.badLines.join(', ') })}</S.ErrorText>
            ) : null}
            {pasted && pasted.ambiguousLines.length > 0 ? (
              <S.ErrorText data-testid="studio-gift-paste-ambiguous">
                {t('studio.modal.pasteAmbiguous', { lines: pasted.ambiguousLines.join(', ') })}
              </S.ErrorText>
            ) : null}

            <S.Summary data-testid="studio-gift-summary">
              {t('studio.modal.summary', {
                count: playerCount,
                credits: credits(check.totalCredits),
                left: credits(Math.max(0, usdCentsToCreditsFloor(studio.balanceCents) - check.totalCredits))
              })}
            </S.Summary>
            {check.batchProblems.map(problem => (
              <S.ErrorText key={problem.code} data-testid="studio-gift-batch-problem">
                {batchProblemText(problem)}
              </S.ErrorText>
            ))}

            <M.Actions>
              <Button variant="outline" onClick={close}>
                {t('studio.modal.cancel')}
              </Button>
              <Button onClick={() => void review()} disabled={!canReview} data-testid="studio-gift-review">
                {t('studio.modal.review')}
              </Button>
            </M.Actions>
          </>
        )}

        {step === 'confirm' && (
          <>
            <p>
              {t('studio.modal.confirmTitle', {
                credits: credits(check.totalCredits),
                count: playerCount,
                studio: studio.name
              })}
            </p>
            {repeats === null ? (
              <S.Summary>{t('studio.modal.checkingRepeats')}</S.Summary>
            ) : repeats.length > 0 ? (
              <S.Note data-tone="warning" data-testid="studio-gift-repeats">
                {t('studio.modal.repeats', { count: repeats.length })}
                {repeats.map(repeat => (
                  <S.RepeatLine key={repeat.account}>
                    {t('studio.modal.repeatLine', {
                      account: shortAddress(repeat.account),
                      credits: credits(repeat.credits),
                      date: formatDateTime(repeat.giftedAt)
                    })}
                  </S.RepeatLine>
                ))}
              </S.Note>
            ) : null}
            <S.Label>
              {t('studio.modal.confirmTotal')}
              <S.Input
                inputMode="numeric"
                value={confirmTotal}
                onChange={event => setConfirmTotal(event.target.value)}
                aria-invalid={confirmTotal.trim() !== '' && !totalConfirmed ? 'true' : undefined}
                data-testid="studio-gift-confirm-total"
              />
              {confirmTotal.trim() !== '' && !totalConfirmed ? (
                <S.Problem data-testid="studio-gift-confirm-mismatch">
                  {t('studio.modal.confirmMismatch', { total: formatCreditsFull(check.totalCredits) })}
                </S.Problem>
              ) : null}
            </S.Label>
            {notSaved ? (
              <S.ErrorText data-testid="studio-gift-not-saved">{t('studio.modal.notSaved')}</S.ErrorText>
            ) : null}
            <M.Actions>
              <Button variant="outline" onClick={() => setStep('edit')}>
                {t('studio.modal.back')}
              </Button>
              <Button
                onClick={() => void gift()}
                disabled={!totalConfirmed || repeats === null}
                data-testid="studio-gift-send"
              >
                {t('studio.modal.giftTo', { count: playerCount })}
              </Button>
            </M.Actions>
          </>
        )}

        {listChanged ? (
          <S.Note data-tone="warning" data-testid="studio-gift-list-changed">
            {t('studio.modal.listChanged')}
          </S.Note>
        ) : null}

        {step === 'run' && !pending && (
          <M.Actions>
            <Button variant="outline" onClick={onClose} data-testid="studio-gift-close">
              {t('studio.modal.close')}
            </Button>
          </M.Actions>
        )}

        {step === 'run' && pending && (
          <>
            {running ? (
              <S.Note data-testid="studio-gift-running">
                {waitingSeconds !== null
                  ? t('studio.modal.waiting', { seconds: waitingSeconds })
                  : t('studio.modal.running')}
              </S.Note>
            ) : stoppedBy && stoppedBy !== 'interrupted' ? (
              // A list stopped on purpose (Stop, or leaving) has nothing to fix: it reads as one with players left.
              <S.Note data-tone="warning" data-testid="studio-gift-stopped">
                {t('studio.modal.stopped', { reason: t(`studio.modal.outcome.${stoppedBy}`) })}
              </S.Note>
            ) : leftToSend > 0 ? (
              <S.Note data-tone="warning" data-testid="studio-gift-left">
                {t('studio.modal.left', { count: leftToSend, date: formatDateTime(pending.createdAt) })}
              </S.Note>
            ) : (
              <S.Note data-tone="success" data-testid="studio-gift-done">
                {t('studio.modal.done')}
              </S.Note>
            )}

            <S.Outcomes data-testid="studio-gift-outcomes">
              {pending.rows.map(row => (
                <S.Outcome key={row.key} data-testid="studio-gift-outcome" data-status={row.status}>
                  <S.Status data-status={row.status}>{t(`studio.modal.status.${row.status}`)}</S.Status>
                  <S.Detail data-cell="detail">
                    <code title={row.account}>{shortAddress(row.account)}</code>
                    <small>
                      {row.status === 'refused' && row.code ? t(`studio.modal.outcome.${row.code}`) : row.reason}
                    </small>
                  </S.Detail>
                  <span>{credits(row.credits)}</span>
                </S.Outcome>
              ))}
            </S.Outcomes>

            <M.Actions>
              {!running && leftToSend > 0 ? (
                <Button variant="ghost" onClick={forget} data-testid="studio-gift-forget">
                  {t('studio.modal.forget')}
                </Button>
              ) : null}
              {running ? (
                <Button variant="outline" onClick={stop} disabled={stopping} data-testid="studio-gift-stop">
                  {stopping ? t('studio.modal.stopping') : t('studio.modal.stop')}
                </Button>
              ) : (
                <Button variant="outline" onClick={close} data-testid="studio-gift-close">
                  {t('studio.modal.close')}
                </Button>
              )}
              {!running && leftToSend > 0 ? (
                <Button onClick={() => void run(pending)} data-testid="studio-gift-continue">
                  {t('studio.modal.continue', { count: leftToSend })}
                </Button>
              ) : null}
            </M.Actions>
          </>
        )}
      </S.Card>
    </M.Backdrop>
  )
}
