import { useEffect, useMemo, useState } from 'react'
import type { AuthIdentity } from '@dcl/crypto'
import { Button } from '~/components/Button'
import { t } from '~/intl/i18n'
import { creditsUnit, formatCreditsFull } from '~/lib/currency'
import { shortAddress } from '~/lib/address'
import {
  createGiftRows,
  findLikelyRepeats,
  getMyStudio,
  giftFromStudio,
  isRetryable,
  parsePastedRows,
  runGiftBatch,
  validateRows,
  writePendingBatch,
  type BatchProblem,
  type DraftRow,
  type OperatorStudio,
  type PendingBatch,
  type RowProblem
} from '~/lib/studio'
import { useDialogScrollLock } from '~/hooks/useDialogScrollLock'
import * as M from '~/styles/modal.styles'
import * as S from './StudioGiftModal.styles'

type Step = 'edit' | 'confirm' | 'run'

const EMPTY_ROW: DraftRow = { account: '', credits: '', reason: '' }

/** "1,250 Credits" in the active locale. */
const credits = (n: number) => `${formatCreditsFull(n)} ${creditsUnit(n)}`

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
  useDialogScrollLock()
  const [step, setStep] = useState<Step>(pending ? 'run' : 'edit')
  const [rows, setRows] = useState<DraftRow[]>([EMPTY_ROW])
  const [sharedReason, setSharedReason] = useState('')
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [badLines, setBadLines] = useState<number[]>([])
  const [confirmTotal, setConfirmTotal] = useState('')
  const [repeats, setRepeats] = useState<ReturnType<typeof findLikelyRepeats> | null>(null)
  const [running, setRunning] = useState(false)
  const [stoppedBy, setStoppedBy] = useState<string | undefined>()

  const check = useMemo(
    () => validateRows(rows, { sharedReason, maxGrantCents, balanceCents: studio.balanceCents }),
    [rows, sharedReason, maxGrantCents, studio.balanceCents]
  )
  const canReview = check.rowProblems.every(problem => problem === null) && check.batchProblems.length === 0
  const totalConfirmed = confirmTotal.trim() !== '' && Number(confirmTotal.trim()) === check.totalCredits
  const leftToSend = pending ? pending.rows.filter(isRetryable).length : 0

  const save = (batch: PendingBatch | null) => {
    writePendingBatch(account, studio.id, batch)
    onPendingChange(batch)
  }

  const updateRow = (index: number, patch: Partial<DraftRow>) =>
    setRows(current => current.map((row, i) => (i === index ? { ...row, ...patch } : row)))

  const addPasted = () => {
    const parsed = parsePastedRows(pasteText)
    setBadLines(parsed.badLines)
    if (parsed.rows.length > 0) {
      // Pasted rows replace a lone empty row instead of following it.
      setRows(current => [
        ...current.filter(row => row.account.trim() || row.credits.trim() || row.reason.trim()),
        ...parsed.rows
      ])
      setPasteText('')
      setPasteOpen(false)
    }
  }

  const review = async () => {
    setConfirmTotal('')
    setRepeats(null)
    setStep('confirm')
    try {
      // The most recent gifts are enough to catch a list sent twice by mistake.
      const recent = await getMyStudio(studio.id, identity, { limit: 200, offset: 0 })
      setRepeats(
        findLikelyRepeats(
          createGiftRows(rows, sharedReason, () => ''),
          recent.gifts,
          { nowMs: Date.now() }
        )
      )
    } catch {
      setRepeats([])
    }
  }

  const run = async (batch: PendingBatch) => {
    setRunning(true)
    setStoppedBy(undefined)
    const result = await runGiftBatch(
      batch.rows,
      row =>
        giftFromStudio(
          studio.id,
          { account: row.account, credits: row.credits, reason: row.reason, key: row.key },
          identity
        ),
      // Saved before the next row is sent, so a reload finds exactly where the batch stood.
      changed => save({ ...batch, rows: changed })
    )
    setStoppedBy(result.stoppedBy)
    setRunning(false)
    onGifted()
  }

  const gift = async () => {
    const batch: PendingBatch = { studioId: studio.id, rows: createGiftRows(rows, sharedReason), createdAt: Date.now() }
    // Saved before anything is sent: from here on, this batch is what gets resumed.
    save(batch)
    setStep('run')
    await run(batch)
  }

  const close = () => {
    if (running) return
    // A batch with nothing left to send or confirm is done; one with rows left stays to be resumed.
    if (pending && !pending.rows.some(isRetryable)) save(null)
    onClose()
  }

  const forget = () => {
    if (!window.confirm(t('studio.modal.forgetConfirm'))) return
    save(null)
    onClose()
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !running) close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

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
          {t('studio.modal.budget', { studio: studio.name, credits: credits(studio.balanceCents / 10) })}{' '}
          {maxGrantCents !== null ? t('studio.modal.max', { credits: credits(maxGrantCents / 10) }) : null}{' '}
          {t('studio.modal.rules')}
        </S.Note>

        {step === 'edit' && (
          <>
            <S.Label>
              {t('studio.modal.sharedReason')}
              <S.Input
                value={sharedReason}
                maxLength={80}
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
                  <S.Row key={index} data-testid="studio-gift-row">
                    <S.Cell data-cell="account">
                      <S.Input
                        aria-label={t('studio.modal.account')}
                        placeholder={t('studio.modal.account')}
                        value={row.account}
                        onChange={event => updateRow(index, { account: event.target.value })}
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
                        onChange={event => updateRow(index, { credits: event.target.value })}
                        data-testid="studio-gift-credits"
                      />
                    </S.Cell>
                    <S.Cell>
                      <S.Input
                        aria-label={t('studio.modal.rowReason')}
                        placeholder={sharedReason || t('studio.modal.rowReason')}
                        maxLength={80}
                        value={row.reason}
                        onChange={event => updateRow(index, { reason: event.target.value })}
                      />
                    </S.Cell>
                    <S.RemoveButton
                      type="button"
                      aria-label={t('studio.modal.remove')}
                      onClick={() =>
                        setRows(current => (current.length === 1 ? [EMPTY_ROW] : current.filter((_, i) => i !== index)))
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
                onClick={() => setRows(current => [...current, EMPTY_ROW])}
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
            {badLines.length > 0 ? (
              <S.ErrorText>{t('studio.modal.pasteBadLines', { lines: badLines.join(', ') })}</S.ErrorText>
            ) : null}

            <S.Summary data-testid="studio-gift-summary">
              {t('studio.modal.summary', {
                count: rows.length,
                credits: credits(check.totalCredits),
                left: credits(Math.max(0, studio.balanceCents / 10 - check.totalCredits))
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
                count: rows.length,
                studio: studio.name
              })}
            </p>
            {repeats === null ? (
              <S.Summary>{t('studio.modal.checkingRepeats')}</S.Summary>
            ) : repeats.length > 0 ? (
              <S.Note data-tone="warning" data-testid="studio-gift-repeats">
                {t('studio.modal.repeats', { count: repeats.length })}
                {repeats.map(repeat => (
                  <span key={repeat.account} style={{ display: 'block' }}>
                    {t('studio.modal.repeatLine', {
                      account: shortAddress(repeat.account),
                      credits: credits(repeat.credits),
                      date: new Date(repeat.giftedAt).toLocaleDateString()
                    })}
                  </span>
                ))}
              </S.Note>
            ) : null}
            <S.Label>
              {t('studio.modal.confirmTotal')}
              <S.Input
                inputMode="numeric"
                value={confirmTotal}
                onChange={event => setConfirmTotal(event.target.value)}
                aria-invalid={confirmTotal !== '' && !totalConfirmed ? 'true' : undefined}
                data-testid="studio-gift-confirm-total"
              />
              {confirmTotal !== '' && !totalConfirmed ? (
                <S.Problem>
                  {t('studio.modal.confirmMismatch', { total: formatCreditsFull(check.totalCredits) })}
                </S.Problem>
              ) : null}
            </S.Label>
            <M.Actions>
              <Button variant="outline" onClick={() => setStep('edit')}>
                {t('studio.modal.back')}
              </Button>
              <Button
                onClick={() => void gift()}
                disabled={!totalConfirmed || repeats === null}
                data-testid="studio-gift-send"
              >
                {t('studio.modal.giftTo', { count: rows.length })}
              </Button>
            </M.Actions>
          </>
        )}

        {step === 'run' && pending && (
          <>
            {running ? (
              <S.Note>{t('studio.modal.running')}</S.Note>
            ) : stoppedBy ? (
              <S.Note data-tone="warning" data-testid="studio-gift-stopped">
                {t('studio.modal.stopped', { reason: t(`studio.modal.outcome.${stoppedBy}`) })}
              </S.Note>
            ) : leftToSend > 0 ? (
              <S.Note data-tone="warning">
                {t('studio.modal.left', { count: leftToSend, date: new Date(pending.createdAt).toLocaleString() })}
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
              <Button variant="outline" onClick={close} disabled={running} data-testid="studio-gift-close">
                {t('studio.modal.close')}
              </Button>
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
