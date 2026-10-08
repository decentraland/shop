import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useWallet } from '~/store/wallet'
import { useSeo } from '~/hooks/useSeo'
import { useMyStudio, useMyStudios } from '~/hooks/useStudios'
import { t } from '~/intl/i18n'
import { formatCreditsAmount as credits, usdCentsToCreditsFloor } from '~/lib/currency'
import { shortAddress } from '~/lib/address'
import { isRetryable, readUnfinishedBatch, type PendingBatch, type StudioGift } from '~/lib/studio'
import { Button } from '~/components/Button'
import { EmptyState, EmptyStateCentered } from '~/components/EmptyState'
import { ErrorNotice } from '~/components/ErrorNotice'
import { StudioGiftModal } from '~/components/StudioGiftModal'
import signInIllustration from '~/assets/empty/signin-empty.svg'
import emptyIllustration from '~/assets/empty/items-empty.svg'
import * as S from './Studio.styles'

/**
 * The gifts of every loaded page, each once. Pages are read by offset over a newest-first list, so a gift made
 * between two pages pushes the last one of a page onto the next.
 */
function uniqueGifts(pages: Array<{ gifts: StudioGift[] }>): StudioGift[] {
  const seen = new Set<string>()
  return pages
    .flatMap(page => page.gifts)
    .filter(gift => {
      if (seen.has(gift.creditId)) return false
      seen.add(gift.creditId)
      return true
    })
}

/**
 * A studio's page (/studio): the budget Decentraland gave the studio, gifting Credits from it to players, and the
 * gifts made so far. Only the accounts that act for a studio see one; it is reached by its address, not the nav.
 */
export function Studio() {
  useSeo({ title: t('seo.studio.title'), noindex: true })
  const { session, signIn } = useWallet()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const studios = useMyStudios(session)
  const list = studios.data?.studios ?? []
  const requested = searchParams.get('studio')
  const studioId = list.find(studio => studio.id === requested)?.id ?? list[0]?.id
  const detail = useMyStudio(session, studioId)
  const [pending, setPending] = useState<PendingBatch | null>(null)
  const [gifting, setGifting] = useState(false)

  useEffect(() => {
    setPending(session && studioId ? readUnfinishedBatch(session.address, studioId) : null)
  }, [session, studioId])

  if (!session) {
    return (
      <EmptyStateCentered>
        <EmptyState
          testId="studio-signin"
          icon={signInIllustration}
          title={t('studio.signInTitle')}
          body={t('studio.signInBody')}
          cta={{ label: t('storeSettings.signIn'), onClick: () => signIn() }}
          ctaVariant="solid"
          fill
        />
      </EmptyStateCentered>
    )
  }

  if (studios.isLoading) return <S.Loading size="large" label={t('studio.loading')} />

  if (studios.isError) {
    return (
      <S.Root>
        <ErrorNotice message={t('studio.loadError')} testId="studio-error" />
        <div>
          <Button variant="outline" onClick={() => void studios.refetch()}>
            {t('studio.retry')}
          </Button>
        </div>
      </S.Root>
    )
  }

  if (list.length === 0 || !studioId) {
    return (
      <EmptyStateCentered>
        <EmptyState
          testId="studio-none"
          icon={emptyIllustration}
          title={t('studio.noStudioTitle')}
          body={t('studio.noStudioBody')}
          fill
        />
      </EmptyStateCentered>
    )
  }

  const firstPage = detail.data?.pages[0]
  const studio = firstPage?.studio ?? list.find(item => item.id === studioId)!
  const maxGrantCents = firstPage?.limits.maxGrantCents ?? studios.data!.limits.maxGrantCents
  const gifts = uniqueGifts(detail.data?.pages ?? [])
  const leftRows = pending ? pending.rows.filter(isRetryable).length : 0
  const paused = studio.status === 'paused'

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['my-studio', session.address, studioId] })
    void queryClient.invalidateQueries({ queryKey: ['my-studios', session.address] })
  }

  return (
    <S.Root aria-label={t('studio.title')} data-testid="studio-page">
      <S.Head>
        <S.Heading>
          <span>{t('studio.title')}</span>
          <h1 data-testid="studio-name">{studio.name}</h1>
        </S.Heading>
        {list.length > 1 ? (
          <S.Picker>
            {t('studio.pick')}
            <select
              value={studioId}
              onChange={event => setSearchParams({ studio: event.target.value }, { replace: true })}
              data-testid="studio-picker"
            >
              {list.map(item => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </S.Picker>
        ) : null}
        <Button onClick={() => setGifting(true)} disabled={paused && leftRows === 0} data-testid="studio-gift">
          {leftRows > 0 ? t('studio.continueGifts', { count: leftRows }) : t('studio.giftCredits')}
        </Button>
      </S.Head>

      {paused ? <S.Notice data-testid="studio-paused">{t('studio.paused')}</S.Notice> : null}
      {leftRows > 0 && pending ? (
        <S.Notice data-testid="studio-unfinished">
          <span>{t('studio.unfinished', { count: leftRows, date: new Date(pending.createdAt).toLocaleString() })}</span>
          <Button size="sm" onClick={() => setGifting(true)}>
            {t('studio.continue')}
          </Button>
        </S.Notice>
      ) : null}

      <S.Figures>
        <div>
          <dt>{t('studio.budgetLeft')}</dt>
          <dd data-testid="studio-balance">{credits(usdCentsToCreditsFloor(studio.balanceCents))}</dd>
        </div>
        <div>
          <dt>{t('studio.gifted')}</dt>
          <dd>
            {credits(usdCentsToCreditsFloor(studio.grantedCents))}
            <small>{t('studio.giftCount', { count: studio.grantCount })}</small>
          </dd>
        </div>
        <div>
          <dt>{t('studio.maxPerGift')}</dt>
          <dd>{maxGrantCents === null ? t('studio.notConfigured') : credits(usdCentsToCreditsFloor(maxGrantCents))}</dd>
        </div>
      </S.Figures>

      <S.Gifts>
        <h2>{t('studio.historyTitle')}</h2>
        {detail.isError ? <ErrorNotice message={t('studio.loadError')} /> : null}
        {gifts.length === 0 && !detail.isLoading ? (
          <S.Empty>{t('studio.historyEmpty')}</S.Empty>
        ) : (
          <S.GiftList data-testid="studio-gifts">
            {gifts.map(gift => (
              <S.Gift key={gift.creditId} data-testid="studio-gift-entry">
                <code title={gift.recipient} aria-label={t('studio.player')}>
                  {shortAddress(gift.recipient)}
                </code>
                <strong>{credits(usdCentsToCreditsFloor(gift.usdCents))}</strong>
                <span data-cell="reason">{gift.reason ?? '—'}</span>
                <small data-cell="when">
                  {new Date(gift.createdAt).toLocaleString()} · {t('studio.by')} {shortAddress(gift.grantedBy)}
                </small>
              </S.Gift>
            ))}
          </S.GiftList>
        )}
        {detail.hasNextPage ? (
          <div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void detail.fetchNextPage()}
              disabled={detail.isFetchingNextPage}
            >
              {t('studio.loadMore')}
            </Button>
          </div>
        ) : null}
      </S.Gifts>

      {gifting ? (
        <StudioGiftModal
          studio={studio}
          account={session.address}
          identity={session.identity}
          maxGrantCents={maxGrantCents}
          pending={pending}
          onPendingChange={setPending}
          onGifted={refresh}
          onClose={() => setGifting(false)}
        />
      ) : null}
    </S.Root>
  )
}
