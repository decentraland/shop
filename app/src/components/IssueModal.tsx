import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { Session } from '~/lib/auth'
import { issueTokens, isIssueValid, isValidIssueAddress, totalToIssue, type IssueEntry } from '~/lib/issue'
import { isManagedWallet } from '~/lib/wallet'
import { toast } from '~/store/toast'
import { captureError } from '~/lib/monitoring'
import { track, errorCode } from '~/lib/analytics'
import { friendlyError, isRejection } from '~/lib/errors'
import { ErrorNotice } from '~/components/ErrorNotice'
import { Icon } from '~/components/Icon'
import { t } from '~/intl/i18n'
import * as S from './IssueModal.styles'

// The subset of the PDP item this modal needs to issue copies of it.
export type IssueTarget = {
  contractAddress: string
  chainId: number
  /** The item's on-chain blockchain item id (PublishableItem.blockchainItemId) — the issueTokens itemId. */
  itemId: string
  name: string
  thumbnail?: string
  /** Remaining mintable supply (max supply − already minted). */
  available: number
}

// A row in the editor. Amount is kept as a string while editing (so the field can be cleared) and
// coerced to a number for validation / submission.
type Row = { address: string; amount: string }

function toEntries(rows: Row[]): IssueEntry[] {
  return rows.map(r => ({ address: r.address, amount: Number(r.amount) }))
}

/**
 * "Issue copies" — the collection CREATOR generates fresh copies of their own published item and
 * assigns them to wallets (the builder calls this "Mint"; we keep it web2-friendly). GASLESS: issueTokens
 * relays ERC721CollectionV2.issueTokens through the meta-tx relayer (see ~/lib/issue), so managed wallets
 * with no gas can issue too. Each row is a recipient + a copy count; submit builds the batched
 * beneficiaries[]/itemIds[] arrays and issues them in ONE meta-transaction.
 */
export function IssueModal({
  item,
  session,
  onClose,
  onIssued
}: {
  item: IssueTarget
  session: Session
  onClose: () => void
  onIssued?: () => void
}) {
  const queryClient = useQueryClient()
  const [rows, setRows] = useState<Row[]>([{ address: '', amount: '1' }])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [issuedCount, setIssuedCount] = useState<number | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)

  const isManaged = isManagedWallet(session)
  const entries = toEntries(rows)
  const total = totalToIssue(entries)
  const valid = isIssueValid(entries, item.available)
  const overCap = total > item.available

  // Accessible modal: focus the card on mount and close on Esc (backdrop click is wired on the scrim).
  useEffect(() => {
    cardRef.current?.focus()
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  function updateRow(index: number, patch: Partial<Row>) {
    setRows(prev => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  }
  function addRow() {
    setRows(prev => [...prev, { address: '', amount: '1' }])
  }
  function removeRow(index: number) {
    setRows(prev => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)))
  }

  async function submit() {
    if (!valid || busy) return
    setError(null)
    setBusy(true)
    try {
      await issueTokens({
        signer: session.signer,
        contractAddress: item.contractAddress,
        chainId: item.chainId,
        entries,
        itemId: item.itemId
      })
      track('Shop Issued Item', {
        contract_address: item.contractAddress,
        item_id: item.itemId,
        recipients: entries.filter(e => e.address.trim().length > 0).length,
        copies: total
      })
      setIssuedCount(total)
      toast.success(t('issue.toastSuccess', { count: total, name: item.name }))
      // The supply changed on-chain — refresh the creator/publishable records the PDP + My Assets read.
      void queryClient.invalidateQueries({ queryKey: ['publishable-item'] })
      void queryClient.invalidateQueries({ queryKey: ['publishable-items'] })
      onIssued?.()
    } catch (e) {
      if (!isRejection(e)) captureError(e, { flow: 'issue-item', itemId: item.itemId })
      track('Shop Issue Failed', { error_code: errorCode(e) })
      setError(isRejection(e) ? t('getCredits.errorCanceled') : friendlyError(e, t('issue.errorGeneric')))
    } finally {
      setBusy(false)
    }
  }

  // Wallet-aware CTA. Idle: "Issue" / "Issue N items". Busy: managed wallets issue silently ("Issuing…"),
  // self-custody wallets must confirm in-wallet ("Confirm").
  const cta = busy
    ? isManaged
      ? t('issue.issuing')
      : t('issue.confirm')
    : total > 0
      ? t('issue.issueCount', { count: total })
      : t('issue.issue')

  return (
    <S.Scrim onClick={busy ? undefined : onClose} role="presentation">
      <S.Card
        ref={cardRef}
        tabIndex={-1}
        data-testid="issue-modal"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={t('issue.title')}
      >
        <S.Head>
          <S.Title>{t('issue.title')}</S.Title>
          <S.Close onClick={onClose} disabled={busy} aria-label={t('sellModal.cancel')}>
            <Icon name="close" className="ico" />
          </S.Close>
        </S.Head>

        {issuedCount !== null ? (
          <>
            <S.SuccessBanner>
              <S.SuccessCheck aria-hidden>
                <Icon name="check" className="ico" />
              </S.SuccessCheck>
              <S.SuccessText>{t('issue.successBody', { count: issuedCount, name: item.name })}</S.SuccessText>
            </S.SuccessBanner>
            <S.Actions>
              <S.PrimaryBtn onClick={onClose}>{t('getCredits.done')}</S.PrimaryBtn>
            </S.Actions>
          </>
        ) : (
          <>
            <S.AssetRow>
              <S.Thumb>{item.thumbnail ? <img src={item.thumbnail} alt="" /> : null}</S.Thumb>
              <S.AssetName>{item.name}</S.AssetName>
            </S.AssetRow>

            <S.Subtitle>{t('issue.subtitle')}</S.Subtitle>

            <S.Rows>
              {rows.map((row, i) => {
                const trimmed = row.address.trim()
                const addrError = trimmed.length > 0 && !isValidIssueAddress(trimmed)
                const amountNum = Number(row.amount)
                const amtError =
                  row.amount.length > 0 && (!Number.isInteger(amountNum) || amountNum < 1)
                return (
                  <S.Row key={i}>
                    <S.AddressField>
                      <S.FieldLabel>{t('issue.addressLabel')}</S.FieldLabel>
                      <S.Input
                        type="text"
                        spellCheck={false}
                        autoComplete="off"
                        placeholder="0x…"
                        value={row.address}
                        onChange={e => updateRow(i, { address: e.target.value })}
                        disabled={busy}
                        aria-invalid={addrError}
                        aria-label={t('issue.addressLabel')}
                      />
                      {addrError ? <S.FieldError>{t('issue.invalidAddress')}</S.FieldError> : null}
                    </S.AddressField>
                    <S.AmountField>
                      <S.FieldLabel>{t('issue.amountLabel')}</S.FieldLabel>
                      <S.Input
                        type="number"
                        min="1"
                        step="1"
                        inputMode="numeric"
                        value={row.amount}
                        onChange={e => updateRow(i, { amount: e.target.value })}
                        disabled={busy}
                        aria-invalid={amtError}
                        aria-label={t('issue.amountLabel')}
                      />
                    </S.AmountField>
                    <S.RemoveBtn
                      onClick={() => removeRow(i)}
                      disabled={busy || rows.length <= 1}
                      aria-label={t('issue.removeRow')}
                    >
                      <Icon name="close" className="ico" />
                    </S.RemoveBtn>
                  </S.Row>
                )
              })}
            </S.Rows>

            <S.AddRowBtn onClick={addRow} disabled={busy}>
              <Icon name="plus" className="ico" />
              {t('issue.addRow')}
            </S.AddRowBtn>

            <S.Total over={overCap} aria-live="polite">
              <strong>{total}</strong> / {item.available} {t('issue.itemsToIssue')}
            </S.Total>

            {overCap ? <S.Note>{t('issue.overCap', { available: item.available })}</S.Note> : null}

            <ErrorNotice message={error} />

            <S.Actions>
              <S.OutlineBtn onClick={onClose} disabled={busy}>
                {t('sellModal.cancel')}
              </S.OutlineBtn>
              <S.PrimaryBtn onClick={() => void submit()} disabled={!valid || busy}>
                {cta}
              </S.PrimaryBtn>
            </S.Actions>
          </>
        )}
      </S.Card>
    </S.Scrim>
  )
}

export default IssueModal
