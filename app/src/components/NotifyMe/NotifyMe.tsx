import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useWallet } from '~/store/wallet'
import { getConnectionEmail } from '~/lib/auth'
import { getNotifyRequest, createNotifyRequest, isNotifyAvailable } from '~/lib/notify'
import { captureError } from '~/lib/monitoring'
import { Icon } from '~/components/Icon'
import { ErrorNotice } from '~/components/ErrorNotice'
import { t } from '~/intl/i18n'
import type { CatalogItem } from '~/lib/api'
import * as S from './NotifyMe.styles'

// Loose email sanity check — enough to gate the button; the server is the real validator.
function isEmailish(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())
}

// "Notify me when available" for an item with no buyable listing (Figma 1182-203305).
//  • Guest → a single "Sign in to get notified" CTA (opens the sign-in flow).
//  • Signed-in → an email field (prefilled from the account email when the provider exposes it, else
//    the address already on file) + a NOTIFY ME button. On mount we read the current subscription so
//    an already-subscribed viewer sees the confirmed state straight away.
//
// Renders NOTHING until shop-server is configured (see lib/notify): without a host there is nowhere to
// keep the subscription, and an offer to notify that silently drops the email is worse than no offer —
// the buyer got a confirmation, then found the form blank and re-subscribed on every visit.
export function NotifyMe({ item }: { item: CatalogItem }) {
  const session = useWallet(s => s.session)
  const signIn = useWallet(s => s.signIn)

  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const available = isNotifyAvailable()
  const canQuery = available && !!session && !!item.contractAddress && !!item.itemId
  const { data: status } = useQuery({
    queryKey: ['notify-request', item.contractAddress, item.itemId, session?.address],
    enabled: canQuery,
    queryFn: () => getNotifyRequest(item.contractAddress, item.itemId as string, session!.identity)
  })

  // Prefill the input: prefer the email already saved server-side, else the connected account email
  // (undefined until the decentraland-connect release ships getEmail). Never overwrite typing.
  useEffect(() => {
    if (status?.email) setEmail(prev => prev || status.email!)
  }, [status?.email])
  useEffect(() => {
    if (!session || !available) return
    let cancelled = false
    void getConnectionEmail().then(e => {
      if (!cancelled && e) setEmail(prev => prev || e)
    })
    return () => {
      cancelled = true
    }
  }, [available, session])

  const subscribed = submitted || !!status?.subscribed

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!session || !item.itemId || !isEmailish(email) || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      await createNotifyRequest(
        { contractAddress: item.contractAddress, itemId: item.itemId, chainId: item.chainId, email: email.trim() },
        session.identity
      )
      setSubmitted(true)
    } catch (err) {
      captureError(err, { flow: 'notify-me', contractAddress: item.contractAddress, itemId: item.itemId })
      setError(t('notifyMe.error'))
    } finally {
      setSubmitting(false)
    }
  }

  if (!available) return null

  // Guest: no email input — sign in first (managed sign-in carries the email we'd notify).
  if (!session) {
    return (
      <S.Root data-testid="notify">
        <S.NotifyBtn type="button" data-full onClick={signIn} data-testid="notify-signin">
          {t('notifyMe.signInCta')}
        </S.NotifyBtn>
      </S.Root>
    )
  }

  if (subscribed) {
    return (
      <S.Root data-done data-testid="notify-subscribed">
        <S.DoneCheck aria-hidden>
          <Icon name="check" size={12} />
        </S.DoneCheck>
        <S.DoneText>{t('notifyMe.subscribedBody')}</S.DoneText>
      </S.Root>
    )
  }

  return (
    <S.Form onSubmit={e => void onSubmit(e)} data-testid="notify">
      <S.Label htmlFor="notify-email">{t('notifyMe.label')}</S.Label>
      <S.Row>
        <S.Input
          id="notify-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder={t('notifyMe.placeholder')}
          value={email}
          onChange={e => setEmail(e.target.value)}
          data-testid="notify-email"
        />
        <S.NotifyBtn type="submit" disabled={!isEmailish(email) || submitting} data-testid="notify-submit">
          {submitting ? t('notifyMe.working') : t('notifyMe.cta')}
        </S.NotifyBtn>
      </S.Row>
      <ErrorNotice message={error} />
    </S.Form>
  )
}
