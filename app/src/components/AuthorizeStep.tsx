import { useState, type ReactNode } from 'react'
import type { ethers } from 'ethers'
import { setAuthorization, type ShopAuthorization } from '~/lib/authorizations'
import { isRejection } from '~/lib/errors'
import { captureError } from '~/lib/monitoring'
import { Icon } from '~/components/Icon'
import { ErrorNotice } from '~/components/ErrorNotice'
import { t } from '~/intl/i18n'
import * as S from './AuthorizeStep.styles'

/**
 * The pre-action authorization STEP for self-custody wallets: it explains what's about to be
 * authorized and why, runs the (gasless) grant when the user clicks Authorize, and only calls
 * `onAuthorized` once the grant confirms — so the parent modal advances to the buy/sell step.
 *
 * This is only ever rendered for self-custody wallets with a MISSING authorization; managed (web2)
 * wallets and already-authorized users skip it entirely (the caller decides, via isManagedWallet +
 * getAuthorizationStatus). A wallet rejection keeps the step in place with a retry — it never falls
 * through to the action.
 *
 * The grant goes through `setAuthorization`, which is gasless for every wallet (an off-chain signature
 * relayed by DCL), so no POL is ever required.
 */
export function AuthorizeStep({
  auth,
  signer,
  title,
  reason,
  name,
  image,
  icon,
  onAuthorized,
  onCancel,
  onClose
}: {
  auth: ShopAuthorization
  signer: ethers.providers.JsonRpcSigner
  /** Short heading, e.g. "One quick approval first". */
  title: string
  /** Why this authorization is needed — the sentence under the row. */
  reason: ReactNode
  /** The label for the thing being authorized (item/collection/"your balance"). */
  name: string
  image?: string
  icon?: ReactNode
  /** Runs after the grant confirms — the parent advances to the buy/sell step. */
  onAuthorized: () => void
  /** Back out of the step without closing the whole modal (returns to the previous view). */
  onCancel: () => void
  /** Close the whole modal (the header X). */
  onClose: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function authorize() {
    setBusy(true)
    setError(null)
    try {
      await setAuthorization({ auth, signer, active: true })
      onAuthorized()
    } catch (e) {
      // User dismissed the wallet prompt → stay on the step with a retry, never fall through.
      if (isRejection(e)) {
        setError(t('authorizeStep.errorRejected'))
      } else {
        captureError(e, { flow: 'authorize_step', kind: auth.kind })
        setError(t('authorizeStep.errorGeneric'))
      }
      setBusy(false)
    }
  }

  return (
    <S.Scrim onClick={busy ? undefined : onClose} role="presentation">
      <S.Card onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={title}>
        <S.Head>
          <S.Title>{title}</S.Title>
          <S.Close onClick={onClose} disabled={busy} aria-label={t('authorizeStep.close')}>
            <Icon name="close" className="ico" />
          </S.Close>
        </S.Head>

        <S.Row data-testid="authorize-step-row">
          <S.Thumb>{image ? <img src={image} alt="" /> : icon}</S.Thumb>
          <S.RowInfo>
            <S.RowName title={name}>{name}</S.RowName>
            <S.RowDesc>{reason}</S.RowDesc>
          </S.RowInfo>
        </S.Row>

        <S.Note>{t('authorizeStep.note')}</S.Note>

        <ErrorNotice message={error} />

        <S.Actions>
          <S.OutlineBtn type="button" onClick={onCancel} disabled={busy}>
            {t('authorizeStep.cancel')}
          </S.OutlineBtn>
          <S.PurpleBtn type="button" data-testid="authorize-step-action" onClick={() => void authorize()} disabled={busy}>
            {busy ? (
              <>
                <S.Spinner aria-hidden />
                {t('authorizeStep.authorizing')}
              </>
            ) : (
              t('authorizeStep.authorize')
            )}
          </S.PurpleBtn>
        </S.Actions>
      </S.Card>
    </S.Scrim>
  )
}

export default AuthorizeStep
