import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CurrencyMark } from '~/components/CurrencyMark'
import { Icon } from '~/components/Icon'
import { t } from '~/intl/i18n'
import { shortAddress } from '~/lib/address'
import { MAX_COPIES_PER_ISSUE } from '~/lib/issue'
import type { TopOwner, TopOwnersSort } from '~/lib/owners'
import { fetchProfiles } from '~/lib/profile'
import { capitalizeFirst } from '~/lib/text'
import * as S from './RewardOwnersModal.styles'

/** An item a reward can be issued from: one with copies left. */
export type RewardItem = {
  contractAddress: string
  itemId: string
  name: string
  thumbnail: string
  collectionName: string
  left: number
}

function manaOf(wei: string): string {
  let whole: number
  try {
    whole = Number(BigInt(wei) / 10n ** 14n) / 10_000
  } catch {
    return '0'
  }
  return whole >= 10 ? Math.round(whole).toLocaleString() : whole.toFixed(2)
}

const COUNTS = [5, 10, 25, MAX_COPIES_PER_ISSUE]
const RANKINGS: TopOwnersSort[] = ['nfts', 'spent', 'recent']

/**
 * The first step of rewarding a creator's owners: who gets a copy, and of what.
 *
 * Nothing is issued here. It hands the chosen addresses to the issue modal, which is where the copies are
 * signed and sent, so a reward and a manual issue go through exactly the same checks.
 */
export function RewardOwnersModal({
  creator,
  ownerCount,
  items,
  loadOwners,
  onContinue,
  onClose,
  onTrack
}: {
  /** The store's own account: it keys the cached list and is never a recipient of its own reward. */
  creator: string
  ownerCount: number
  items: RewardItem[]
  loadOwners: (count: number, sortBy: TopOwnersSort) => Promise<TopOwner[]>
  onContinue: (choice: { item: RewardItem; recipients: string[] }) => void
  onClose: () => void
  onTrack: (event: string, props: Record<string, unknown>) => void
}) {
  // A store with 7 owners offers 5 and 7, not 5, 10, 25 and 50 of the same seven people.
  const counts = [...new Set(COUNTS.map(n => Math.min(n, ownerCount)))]
  const [count, setCount] = useState(() => Math.min(10, ownerCount))
  const [ranking, setRanking] = useState<TopOwnersSort>('nfts')
  const [item, setItem] = useState<RewardItem | null>(() => items.find(i => i.left >= Math.min(10, ownerCount)) ?? null)
  const cardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    cardRef.current?.focus()
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const recipients = useQuery({
    queryKey: ['reward-recipients', creator.toLowerCase(), count, ranking],
    queryFn: async () =>
      (await loadOwners(count, ranking)).filter(owner => owner.address.toLowerCase() !== creator.toLowerCase()),
    placeholderData: previous => previous
  })
  const addresses = (recipients.data ?? []).map(owner => owner.address)
  const names = useQuery({
    queryKey: ['reward-recipient-names', addresses],
    enabled: addresses.length > 0,
    staleTime: 5 * 60_000,
    queryFn: () => fetchProfiles(addresses)
  })

  const enough = !!item && item.left >= addresses.length
  const ready = !!item && enough && addresses.length > 0 && !recipients.isFetching

  return (
    <S.Scrim onClick={onClose} role="presentation">
      <S.Card
        ref={cardRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={t('reward.title')}
        onClick={event => event.stopPropagation()}
        data-testid="reward-modal"
      >
        <S.Head>
          <S.Title>{t('reward.title')}</S.Title>
          <S.Close onClick={onClose} aria-label={t('sellModal.cancel')}>
            <Icon name="close" className="ico" />
          </S.Close>
        </S.Head>

        <S.Subtitle>{t('reward.subtitle')}</S.Subtitle>

        <S.Field>
          <S.Label id="reward-count">{t('reward.howMany')}</S.Label>
          <S.Chips role="group" aria-labelledby="reward-count">
            {counts.map(shown => {
              return (
                <S.Chip
                  key={shown}
                  type="button"
                  aria-pressed={count === shown}
                  onClick={() => setCount(shown)}
                  data-testid={`reward-count-${shown}`}
                >
                  {t('reward.topN', { count: shown })}
                </S.Chip>
              )
            })}
          </S.Chips>
        </S.Field>

        <S.Field>
          <S.Label id="reward-ranking">{t('reward.rankedBy')}</S.Label>
          <S.Chips role="group" aria-labelledby="reward-ranking">
            {RANKINGS.map(key => (
              <S.Chip
                key={key}
                type="button"
                aria-pressed={ranking === key}
                onClick={() => setRanking(key)}
                data-testid={`reward-ranking-${key}`}
              >
                {t(`reward.ranking.${key}`)}
              </S.Chip>
            ))}
          </S.Chips>
        </S.Field>

        <S.Field>
          <S.Label id="reward-item">{t('reward.item')}</S.Label>
          {items.length === 0 ? (
            <S.Note>{t('reward.noItems')}</S.Note>
          ) : (
            <S.Items role="group" aria-labelledby="reward-item">
              {items.map(option => {
                const key = `${option.contractAddress}-${option.itemId}`
                return (
                  <S.ItemOption
                    key={key}
                    type="button"
                    aria-pressed={item?.contractAddress === option.contractAddress && item.itemId === option.itemId}
                    disabled={option.left < count}
                    onClick={() => setItem(option)}
                    data-testid="reward-item"
                  >
                    {option.thumbnail ? <img src={option.thumbnail} alt="" loading="lazy" /> : null}
                    <S.ItemText>
                      <b>{option.name}</b>
                      <span>{t('reward.itemLeft', { collection: option.collectionName, left: option.left })}</span>
                    </S.ItemText>
                  </S.ItemOption>
                )
              })}
            </S.Items>
          )}
        </S.Field>

        <S.Field>
          <S.Label>{t('reward.recipients', { count: addresses.length })}</S.Label>
          <S.Recipients data-testid="reward-recipients">
            {(recipients.data ?? []).map(owner => {
              const name = names.data?.get(owner.address.toLowerCase())?.name
              return (
                <li key={owner.address}>
                  {name ? capitalizeFirst(name) : shortAddress(owner.address)}{' '}
                  <span>
                    {ranking === 'spent' ? (
                      <>
                        {'· '}
                        <CurrencyMark kind="mana" />
                        {manaOf(owner.spentWei)}
                      </>
                    ) : (
                      t('reward.heldLine', { count: owner.nfts })
                    )}
                  </span>
                </li>
              )
            })}
          </S.Recipients>
        </S.Field>

        {item ? (
          <S.Note data-testid="reward-stock">
            {enough
              ? t('reward.stock', { count: addresses.length, name: item.name, left: item.left })
              : t('reward.notEnough', { name: item.name, left: item.left })}
          </S.Note>
        ) : null}

        <S.Actions>
          <S.OutlineBtn type="button" onClick={onClose}>
            {t('sellModal.cancel')}
          </S.OutlineBtn>
          <S.PrimaryBtn
            type="button"
            disabled={!ready}
            onClick={() => {
              if (!item) return
              onTrack('Shop Chose Store Reward', {
                recipients: addresses.length,
                ranking,
                contract_address: item.contractAddress
              })
              onContinue({ item, recipients: addresses })
            }}
            data-testid="reward-continue"
          >
            {t('reward.continue')}
          </S.PrimaryBtn>
        </S.Actions>
      </S.Card>
    </S.Scrim>
  )
}
