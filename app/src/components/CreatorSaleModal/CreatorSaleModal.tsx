import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import type { Session } from '~/lib/auth'
import { config } from '~/config'
import {
  createCollectionSale,
  MAX_SALE_PCT,
  MIN_SALE_PCT,
  postCoupon,
  SaleInputError,
  validateSaleTerms,
  type CreatorSale,
  type SaleInputProblem
} from '~/lib/coupons'
import { isManagedWallet } from '~/lib/wallet'
import { track, errorCode } from '~/lib/analytics'
import { captureError } from '~/lib/monitoring'
import { friendlyError } from '~/lib/errors'
import { formatDateTime } from '~/lib/dates'
import { toast } from '~/store/toast'
import { t } from '~/intl/i18n'
import { Icon } from '~/components/Icon'
import { ErrorNotice } from '~/components/ErrorNotice'
import { SaleCountdown } from '~/components/SaleCountdown'
import * as S from './CreatorSaleModal.styles'

/** A collection the creator can put on sale: one of theirs with at least one item listed in the Shop. */
export type SaleableCollection = {
  contractAddress: string
  name: string
  listedCount: number
  /**
   * The highest listed price, for the example line. The highest rather than the cheapest because a 1-credit
   * item rounds any discount away and the example would read "1 credit sells for 1 credit". Null when unknown.
   */
  examplePriceCredits: number | null
}

const PCT_PRESETS = [10, 20, 30, 50]
const DURATION_PRESETS = [
  { key: '24h', hours: 24 },
  { key: '48h', hours: 48 },
  { key: '72h', hours: 72 },
  { key: '7d', hours: 168 }
] as const
type DurationKey = (typeof DURATION_PRESETS)[number]['key'] | 'custom'
const HOUR_MS = 60 * 60 * 1000

// <input type="datetime-local"> speaks local wall-clock time without a zone; these convert to and from epoch ms.
function toLocalInput(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
function fromLocalInput(value: string): number | undefined {
  if (!value) return undefined
  const ms = new Date(value).getTime()
  return Number.isNaN(ms) ? undefined : ms
}

function problemCopy(problem: SaleInputProblem): string {
  switch (problem) {
    case 'pct':
      return t('creatorSale.errorPct')
    case 'duration':
      return t('creatorSale.errorDuration')
    case 'collections':
      return t('creatorSale.errorCollections')
    case 'uses':
      return t('creatorSale.errorUses')
    default:
      return t('creatorSale.errorWindow')
  }
}

function durationLabel(hours: number): string {
  return hours % 24 === 0 && hours >= 24 * 2
    ? t('creatorSale.days', { count: hours / 24 })
    : t('creatorSale.hours', { count: hours })
}

export function CreatorSaleModal({
  session,
  collections,
  onCreated,
  onClose
}: {
  session: Session
  collections: SaleableCollection[]
  onCreated?: (sale: CreatorSale) => void
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [selected, setSelected] = useState<string[]>(() => collections.map(c => c.contractAddress))
  const [pctPreset, setPctPreset] = useState<number | 'custom'>(20)
  const [customPct, setCustomPct] = useState('15')
  const [duration, setDuration] = useState<DurationKey>('72h')
  const [customEnd, setCustomEnd] = useState(() => toLocalInput(Date.now() + 7 * 24 * HOUR_MS))
  const [startMode, setStartMode] = useState<'now' | 'later'>('now')
  const [startAt, setStartAt] = useState(() => toLocalInput(Date.now() + 24 * HOUR_MS))
  const [capOn, setCapOn] = useState(false)
  const [cap, setCap] = useState('50')
  const [touched, setTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<CreatorSale | null>(null)

  const isManaged = isManagedWallet(session)
  const pct = pctPreset === 'custom' ? Number(customPct) : pctPreset

  // The terms as they stand, validated the way the submit will validate them, so the button and the inline
  // message agree. `now` is taken per render: a "72 hours" sale is measured from the click, not from mount.
  const terms = useMemo(() => {
    const now = Date.now()
    const startsAtMs = startMode === 'later' ? fromLocalInput(startAt) : undefined
    const preset = DURATION_PRESETS.find(d => d.key === duration)
    const endsAtMs = preset ? (startsAtMs ?? now) + preset.hours * HOUR_MS : fromLocalInput(customEnd)
    const uses = capOn ? Number(cap) : undefined
    const candidate = { collections: selected, discountPct: pct, startsAtMs, endsAtMs: endsAtMs ?? 0, uses }
    let problem: SaleInputProblem | null = null
    try {
      validateSaleTerms(candidate, now)
    } catch (e) {
      problem = e instanceof SaleInputError ? e.problem : 'window'
    }
    return { ...candidate, problem }
  }, [selected, pct, duration, customEnd, startMode, startAt, capOn, cap])

  const example = useMemo(() => {
    const prices = collections
      .filter(c => selected.includes(c.contractAddress))
      .map(c => c.examplePriceCredits ?? 0)
      .filter(p => p > 0)
    const price = prices.length ? Math.max(...prices) : 100
    // Whole credits, rounded up: the same rule the checkout applies to the discounted amount.
    const sale = Math.max(1, Math.ceil((price * (100 - (Number.isFinite(pct) ? pct : 0))) / 100))
    return { price, sale }
  }, [collections, selected, pct])

  function toggle(address: string) {
    setTouched(true)
    setSelected(prev => (prev.includes(address) ? prev.filter(a => a !== address) : [...prev, address]))
  }

  async function submit() {
    setTouched(true)
    setError(null)
    if (terms.problem) {
      setError(problemCopy(terms.problem))
      return
    }
    setBusy(true)
    try {
      setStatus(isManaged ? t('creatorSale.starting') : t('creatorSale.confirm'))
      const payload = await createCollectionSale({
        signer: session.signer,
        chainId: config.chainId,
        collections: terms.collections,
        discountPct: terms.discountPct,
        startsAtMs: terms.startsAtMs,
        endsAtMs: terms.endsAtMs,
        uses: terms.uses
      })
      setStatus(t('creatorSale.finishing'))
      const sale = await postCoupon(payload, session.identity)
      setStatus(null)
      setCreated(sale)
      const scheduled = sale.status === 'scheduled'
      track('Shop Created Sale', {
        sale_id: sale.id,
        collections: sale.collections.length,
        discount_pct: terms.discountPct,
        duration_h: Math.round((terms.endsAtMs - (terms.startsAtMs ?? Date.now())) / HOUR_MS),
        scheduled,
        capped: terms.uses !== undefined
      })
      toast.success(scheduled ? t('creatorSale.toastScheduled') : t('creatorSale.toastLive'))
      onCreated?.(sale)
      void queryClient.invalidateQueries({ queryKey: ['creator-sales'] })
      // The catalogue re-prices the creator's listings the moment the coupon is stored; drop every cached feed
      // so the grids, the home rails and the item page show the sale price on their next paint.
      void queryClient.invalidateQueries({ queryKey: ['shop-items'] })
      void queryClient.invalidateQueries({ queryKey: ['catalog-items'] })
      void queryClient.invalidateQueries({ queryKey: ['overview-listings'] })
      void queryClient.invalidateQueries({ queryKey: ['collection-sale-state'] })
    } catch (e) {
      if (e instanceof SaleInputError) {
        setError(problemCopy(e.problem))
      } else {
        captureError(e, { flow: 'creator_sale' })
        track('Shop Sale Failed', { error_code: errorCode(e) })
        setError(friendlyError(e, t('creatorSale.errorGeneric')))
      }
      setStatus(null)
    } finally {
      setBusy(false)
    }
  }

  function viewStore() {
    onClose()
    navigate(`/items/creator/${session.address}`)
  }

  if (created) {
    const scheduled = created.status === 'scheduled'
    return (
      <S.Scrim onClick={onClose} role="presentation">
        <S.Card
          data-testid="creator-sale-success"
          onClick={e => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label={scheduled ? t('creatorSale.successScheduledTitle') : t('creatorSale.successTitle')}
        >
          <S.Head>
            <S.Title>{scheduled ? t('creatorSale.successScheduledTitle') : t('creatorSale.successTitle')}</S.Title>
            <S.Close onClick={onClose} aria-label={t('creatorSale.done')}>
              <Icon name="close" className="ico" />
            </S.Close>
          </S.Head>
          <S.SuccessBanner>
            <S.SuccessCheck aria-hidden>
              <Icon name="check" className="ico" />
            </S.SuccessCheck>
            <S.SuccessText>
              <b>
                {t('creatorSale.successBody', { count: created.collections.length, pct: created.discount / 10_000 })}
              </b>
            </S.SuccessText>
            <S.SuccessDetail>
              {scheduled ? (
                t('creatorSale.successStarts', { date: formatDateTime(created.checks.effective) })
              ) : (
                <>
                  {t('creatorSale.successEnds')}{' '}
                  <SaleCountdown endsAt={created.checks.expiration} testId="creator-sale-countdown" />
                </>
              )}
            </S.SuccessDetail>
          </S.SuccessBanner>
          <S.Actions>
            <S.OutlineBtn onClick={onClose}>{t('creatorSale.done')}</S.OutlineBtn>
            <S.PurpleBtn onClick={viewStore}>{t('creatorSale.viewStore')}</S.PurpleBtn>
          </S.Actions>
        </S.Card>
      </S.Scrim>
    )
  }

  const inlineProblem = touched && terms.problem ? problemCopy(terms.problem) : null

  return (
    <S.Scrim onClick={busy ? undefined : onClose} role="presentation">
      <S.Card
        data-testid="creator-sale-modal"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={t('creatorSale.title')}
      >
        <S.Head>
          <S.Title>{t('creatorSale.title')}</S.Title>
          <S.Close onClick={onClose} disabled={busy} aria-label={t('creatorSale.cancel')}>
            <Icon name="close" className="ico" />
          </S.Close>
        </S.Head>

        <S.Subtitle>{t('creatorSale.subtitle')}</S.Subtitle>

        <S.Field>
          <S.FieldLabel>{t('creatorSale.collections')}</S.FieldLabel>
          {collections.length === 0 ? (
            <S.Note>{t('creatorSale.noCollections')}</S.Note>
          ) : (
            <S.CollectionList
              role="group"
              aria-label={t('creatorSale.collections')}
              data-testid="creator-sale-collections"
            >
              {collections.map(c => {
                const on = selected.includes(c.contractAddress)
                return (
                  <S.CollectionRow key={c.contractAddress} data-selected={on || undefined}>
                    <input type="checkbox" checked={on} disabled={busy} onChange={() => toggle(c.contractAddress)} />
                    <S.RowInfo>
                      <S.RowName>{c.name}</S.RowName>
                      <S.RowMeta>{t('creatorSale.collectionListed', { count: c.listedCount })}</S.RowMeta>
                    </S.RowInfo>
                  </S.CollectionRow>
                )
              })}
            </S.CollectionList>
          )}
        </S.Field>

        <S.Field>
          <S.FieldLabel>{t('creatorSale.discount')}</S.FieldLabel>
          <S.Chips role="group" aria-label={t('creatorSale.discount')} data-testid="creator-sale-discounts">
            {PCT_PRESETS.map(p => (
              <S.Chip
                key={p}
                type="button"
                data-selected={pctPreset === p || undefined}
                disabled={busy}
                onClick={() => {
                  setTouched(true)
                  setPctPreset(p)
                }}
              >
                {t('creatorSale.offPct', { pct: p })}
              </S.Chip>
            ))}
            <S.Chip
              type="button"
              data-selected={pctPreset === 'custom' || undefined}
              disabled={busy}
              onClick={() => {
                setTouched(true)
                setPctPreset('custom')
              }}
            >
              {t('creatorSale.customPct')}
            </S.Chip>
            {pctPreset === 'custom' ? (
              <S.InlineInput aria-invalid={touched && terms.problem === 'pct' ? true : undefined}>
                <input
                  type="number"
                  min={MIN_SALE_PCT}
                  max={MAX_SALE_PCT}
                  step="1"
                  inputMode="numeric"
                  value={customPct}
                  disabled={busy}
                  aria-label={t('creatorSale.pctLabel')}
                  onChange={e => {
                    setTouched(true)
                    setCustomPct(e.target.value)
                  }}
                />
                <span aria-hidden>%</span>
              </S.InlineInput>
            ) : null}
          </S.Chips>
        </S.Field>

        <S.Field>
          <S.FieldLabel>{t('creatorSale.duration')}</S.FieldLabel>
          <S.Chips role="group" aria-label={t('creatorSale.duration')} data-testid="creator-sale-durations">
            {DURATION_PRESETS.map(d => (
              <S.Chip
                key={d.key}
                type="button"
                data-selected={duration === d.key || undefined}
                disabled={busy}
                onClick={() => {
                  setTouched(true)
                  setDuration(d.key)
                }}
              >
                {durationLabel(d.hours)}
              </S.Chip>
            ))}
            <S.Chip
              type="button"
              data-selected={duration === 'custom' || undefined}
              disabled={busy}
              onClick={() => {
                setTouched(true)
                setDuration('custom')
              }}
            >
              {t('creatorSale.customEnd')}
            </S.Chip>
          </S.Chips>
          {duration === 'custom' ? (
            <S.DateInput
              type="datetime-local"
              value={customEnd}
              min={toLocalInput(Date.now())}
              disabled={busy}
              aria-label={t('creatorSale.endLabel')}
              onChange={e => {
                setTouched(true)
                setCustomEnd(e.target.value)
              }}
            />
          ) : null}
        </S.Field>

        <S.Field>
          <S.FieldLabel>{t('creatorSale.start')}</S.FieldLabel>
          <S.Chips role="group" aria-label={t('creatorSale.start')}>
            <S.Chip
              type="button"
              data-selected={startMode === 'now' || undefined}
              disabled={busy}
              onClick={() => setStartMode('now')}
            >
              {t('creatorSale.startNow')}
            </S.Chip>
            <S.Chip
              type="button"
              data-selected={startMode === 'later' || undefined}
              disabled={busy}
              onClick={() => setStartMode('later')}
            >
              {t('creatorSale.startLater')}
            </S.Chip>
          </S.Chips>
          {startMode === 'later' ? (
            <S.DateInput
              type="datetime-local"
              value={startAt}
              min={toLocalInput(Date.now())}
              disabled={busy}
              aria-label={t('creatorSale.startLabel')}
              onChange={e => {
                setTouched(true)
                setStartAt(e.target.value)
              }}
            />
          ) : null}
        </S.Field>

        <S.Field>
          <S.CapRow>
            <input type="checkbox" checked={capOn} disabled={busy} onChange={e => setCapOn(e.target.checked)} />
            <span>{t('creatorSale.cap')}</span>
          </S.CapRow>
          {capOn ? (
            <S.InlineInput>
              <input
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                value={cap}
                disabled={busy}
                aria-label={t('creatorSale.capLabel')}
                onChange={e => {
                  setTouched(true)
                  setCap(e.target.value)
                }}
              />
            </S.InlineInput>
          ) : null}
        </S.Field>

        <S.Preview data-testid="creator-sale-preview">
          {example.sale < example.price
            ? t('creatorSale.preview', { price: example.price, sale: example.sale })
            : t('creatorSale.previewNoChange', { price: example.price })}
        </S.Preview>

        {status ? <S.Status>{status}</S.Status> : null}
        <ErrorNotice message={error ?? inlineProblem} />

        <S.PrimaryBtn
          data-testid="creator-sale-submit"
          onClick={() => void submit()}
          disabled={busy || collections.length === 0 || (touched && !!terms.problem)}
        >
          {busy ? status : startMode === 'later' ? t('creatorSale.submitScheduled') : t('creatorSale.submit')}
        </S.PrimaryBtn>
      </S.Card>
    </S.Scrim>
  )
}

export default CreatorSaleModal
