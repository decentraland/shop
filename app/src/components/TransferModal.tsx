import { useState } from 'react'
import { transferItem } from '~/lib/buy'
import type { Session } from '~/lib/auth'
import { toast } from '~/store/toast'
import { captureError } from '~/lib/monitoring'
import { track, errorCode } from '~/lib/analytics'
import { friendlyError, isRejection } from '~/lib/errors'
import { ErrorNotice } from '~/components/ErrorNotice'
import { Icon } from '~/components/Icon'
import { t } from '~/intl/i18n'
import * as S from './TransferModal.styles'

// The subset of the PDP item this modal needs to transfer it.
export type TransferItem = {
  contractAddress: string
  chainId: number
  tokenId: string
  name: string
  thumbnail?: string
}

// A valid EVM address (checksum-less, mirroring the marketplace's AddressField isValid).
function isValidAddress(addr: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(addr.trim())
}

/**
 * Transfer an owned collectible to another wallet (Figma 1527-302810 "Transfer" action). GASLESS —
 * transferItem relays the ERC721 transferFrom through the meta-tx relayer (see lib/buy), so managed
 * wallets with no gas can transfer too. Validates the destination address (valid EVM address, not your
 * own) and shows the irreversibility warning before submitting, mirroring the marketplace TransferPage.
 */
export function TransferModal({
  item,
  session,
  onClose,
  onTransferred
}: {
  item: TransferItem
  session: Session
  onClose: () => void
  onTransferred?: () => void
}) {
  const [to, setTo] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const trimmed = to.trim()
  const validAddress = isValidAddress(trimmed)
  const isSelf = validAddress && trimmed.toLowerCase() === session.address.toLowerCase()
  // Only surface the invalid/self hint once the user has typed something.
  const fieldError = trimmed.length === 0 ? null : !validAddress ? t('transfer.invalidAddress') : isSelf ? t('transfer.selfAddress') : null
  const canSubmit = validAddress && !isSelf && !busy

  async function submit() {
    if (!canSubmit) return
    setError(null)
    setBusy(true)
    try {
      await transferItem({
        contractAddress: item.contractAddress,
        chainId: item.chainId,
        tokenId: item.tokenId,
        to: trimmed,
        signer: session.signer
      })
      track('Shop Transferred Item', {
        contract_address: item.contractAddress,
        token_id: item.tokenId
      })
      setDone(true)
      toast.success(t('transfer.toastSuccess', { name: item.name }))
      onTransferred?.()
    } catch (e) {
      if (!isRejection(e)) captureError(e, { flow: 'transfer-item', tokenId: item.tokenId })
      track('Shop Transfer Failed', { error_code: errorCode(e) })
      setError(isRejection(e) ? t('getCredits.errorCanceled') : friendlyError(e, t('transfer.errorGeneric')))
    } finally {
      setBusy(false)
    }
  }

  return (
    <S.Scrim onClick={busy ? undefined : onClose} role="presentation">
      <S.Card onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={t('transfer.title')}>
        <S.Head>
          <S.HeadRow>
            <S.Title>{t('transfer.title')}</S.Title>
            <S.Close onClick={onClose} disabled={busy} aria-label={t('sellModal.cancel')}>
              <Icon name="close" className="ico" />
            </S.Close>
          </S.HeadRow>
        </S.Head>

        {done ? (
          <>
            <S.SuccessBanner>
              <S.SuccessCheck aria-hidden>
                <Icon name="check" className="ico" />
              </S.SuccessCheck>
              <S.SuccessText>{t('transfer.successBody', { name: item.name })}</S.SuccessText>
            </S.SuccessBanner>
            <S.Actions>
              <S.PrimaryBtn onClick={onClose}>{t('getCredits.done')}</S.PrimaryBtn>
            </S.Actions>
          </>
        ) : (
          <>
            <S.AssetRow>
              {item.thumbnail ? <S.Thumb src={item.thumbnail} alt="" /> : null}
              <S.AssetName>{item.name}</S.AssetName>
            </S.AssetRow>

            <S.Field>
              <S.FieldLabel>{t('transfer.addressLabel')}</S.FieldLabel>
              <S.Input
                type="text"
                spellCheck={false}
                autoComplete="off"
                placeholder="0x…"
                value={to}
                onChange={e => setTo(e.target.value)}
                disabled={busy}
                aria-invalid={!!fieldError}
                aria-label={t('transfer.addressLabel')}
              />
              {fieldError ? <ErrorNotice message={fieldError} /> : null}
            </S.Field>

            <S.Warning>{t('transfer.warning')}</S.Warning>

            <ErrorNotice message={error} />

            <S.Actions>
              <S.OutlineBtn onClick={onClose} disabled={busy}>
                {t('sellModal.cancel')}
              </S.OutlineBtn>
              <S.PrimaryBtn onClick={() => void submit()} disabled={!canSubmit}>
                {busy ? t('transfer.transferring') : t('transfer.transfer')}
              </S.PrimaryBtn>
            </S.Actions>
          </>
        )}
      </S.Card>
    </S.Scrim>
  )
}

export default TransferModal
