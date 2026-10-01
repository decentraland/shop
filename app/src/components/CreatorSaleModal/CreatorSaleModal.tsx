import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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
import { activeLocale, t, tNode } from '~/intl/i18n'
import { formatCredits } from '~/lib/currency'
import { CurrencyIcon } from '~/components/CurrencyIcon'
import manaSymbol from '~/assets/mana-matic.svg'
import { Tooltip } from '~/components/Tooltip'
import { Icon } from '~/components/Icon'
import { ErrorNotice } from '~/components/ErrorNotice'
import { SaleCountdown } from '~/components/SaleCountdown'
import { CollectionThumb } from '~/components/CollectionThumb'
import { Chevron } from '~/components/Chevron'
import { SaleTag } from '~/components/SaleTag'
import { RangePicker, type RangePickerHandle } from '~/components/RangePicker'
import type { SaleableCollection } from '~/lib/saleableCollections'
import * as S from './CreatorSaleModal.styles'

/**
 * Which collection the sale is for, as a choice between two shapes rather than two optional props.
 *
 * `collection` is the modal opened from that collection's own context, where it is shown rather than
 * picked. `collections` is the modal opened from the discounts panel, where nothing is implied yet and
 * picking one is the first step. Written as a union so "exactly one of the two" is checked at the call
 * site: with both optional, passing neither compiled and then rendered nothing.
 */
type CollectionSource =
  { collection: SaleableCollection; collections?: never } | { collection?: never; collections: SaleableCollection[] }

/** What a listed item will ring up at, rounded the way the checkout rounds the discounted amount. */
function salePriceOf(price: number, pct: number): number {
  return Math.max(1, Math.ceil((price * (100 - (Number.isFinite(pct) ? pct : 0))) / 100))
}

const PCT_PRESETS = [10, 20, 30, 50]
const DURATION_PRESETS = [
  { key: '24h', hours: 24 },
  { key: '3d', hours: 72 },
  { key: '7d', hours: 168 },
  { key: '14d', hours: 336 }
] as const
const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
/** The longest a sale can run, so the calendar never offers a day the terms would then refuse. */
const MAX_DAYS = 30
const WHEN_TRIGGER = '[data-sale-when-trigger]'
/** From how many collections the picker offers a search. */
const SEARCH_FROM = 8
/** Roughly what the calendar needs under its trigger, presets stacked above the month on a phone. */
const CALENDAR_ROOM = 460

/** When the sale runs: a length from now, or two calendar days picked on the Shop's calendar. */
type When =
  | { kind: 'preset'; key: (typeof DURATION_PRESETS)[number]['key']; hours: number }
  | { kind: 'range'; from: number; to: number }

/** Where the create-a-discount flow was opened from — the one prop every event in the funnel carries. */
export type SaleSource = 'my_store' | 'my_assets'

function startOfDay(ms: number): number {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function endOfDay(ms: number): number {
  const d = new Date(ms)
  d.setHours(23, 59, 59, 999)
  return d.getTime()
}

/**
 * The window the terms carry. A range starting today starts now, not at a midnight already gone; one starting
 * later starts at its first day's midnight, and every range runs to the end of its last day.
 */
function windowOf(when: When, now: number): { startsAtMs: number | undefined; endsAtMs: number } {
  if (when.kind === 'preset') return { startsAtMs: undefined, endsAtMs: now + when.hours * HOUR_MS }
  const start = startOfDay(when.from)
  return { startsAtMs: start > now ? start : undefined, endsAtMs: endOfDay(when.to) }
}

function durationLabel(hours: number): string {
  return hours % 24 === 0 && hours >= 48
    ? t('creatorSale.durationDays', { count: hours / 24 })
    : t('creatorSale.durationHours', { count: hours })
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

export function CreatorSaleModal({
  session,
  collection,
  collections,
  onCreated,
  onClose: closeModal,
  source,
  silent = false
}: {
  session: Session
  onCreated?: (sale: CreatorSale) => void
  onClose: () => void
  source: SaleSource
  /** A preview of someone else's store, or an invented one: nothing it does is a creator's behaviour. */
  silent?: boolean
} & CollectionSource) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const choices = collections ?? []
  // Picked here when the modal was opened without one. A single choice is not a choice: skip straight in.
  const [picked, setPicked] = useState<SaleableCollection | null>(
    () => collection ?? (choices.length === 1 ? choices[0] : null)
  )
  const current = picked ?? collection ?? choices[0]
  const selected = useMemo(() => (current ? [current.contractAddress] : []), [current])
  // The terms are agreed on the first step and confirmed on the second; nothing is signed until 'review'.
  const [step, setStep] = useState<'pick' | 'form' | 'review'>(() =>
    collection || choices.length === 1 ? 'form' : 'pick'
  )
  const [pctPreset, setPctPreset] = useState<number | 'custom'>(20)
  const [customPct, setCustomPct] = useState('15')
  const [when, setWhen] = useState<When>({ kind: 'preset', key: '3d', hours: 72 })
  const [whenOpen, setWhenOpen] = useState(false)
  // The window as the review showed it, fixed on the way in so the signature is exactly what was read.
  const [reviewed, setReviewed] = useState<{ startsAtMs: number | undefined; endsAtMs: number } | null>(null)
  const [query, setQuery] = useState('')
  const strip = useRef<HTMLDivElement>(null)
  const [stripEdges, setStripEdges] = useState({ start: true, end: true })
  const whenPicker = useRef<RangePickerHandle>(null)
  const card = useRef<HTMLDivElement>(null)
  const whenTrigger = useRef<HTMLButtonElement>(null)
  // Where the calendar floats: over the page, on the trigger's box, so opening it never grows the card.
  const [whenAnchor, setWhenAnchor] = useState<{ top: number; left: number; width: number; height: number } | null>(
    null
  )

  const anchor = useRef<HTMLDivElement>(null)
  // Leaving the terms unmounts the calendar mid-fold, before it can report itself closed.
  useEffect(() => {
    if (step === 'form') return
    setWhenOpen(false)
    setWhenAnchor(null)
  }, [step])
  // A short screen can leave no room under the trigger even after the lift: raise it just enough to fit.
  // Measured from the panel's own height: its position is still mid-grow here, shifted by the animation.
  useLayoutEffect(() => {
    if (!whenOpen) return
    const panel = anchor.current?.firstElementChild as HTMLElement | null | undefined
    if (!panel) return
    setWhenAnchor(at => {
      if (!at) return at
      const over = at.top + at.height + 8 + panel.offsetHeight - (window.innerHeight - 8)
      // Never past the top edge either: a landscape phone cannot fit it, and the panel scrolls instead.
      return over > 0 ? { ...at, top: Math.max(8 - at.height - 8, at.top - over) } : at
    })
  }, [whenOpen])

  // Anchored to where the trigger WAS: once the card scrolls or the window resizes it no longer is, so it folds away.
  useEffect(() => {
    if (!whenOpen) return
    const scroller = card.current
    // The lift in `openWhen` reports its own scroll a frame late; only a scroll away from there moves the trigger.
    const opened = scroller?.scrollTop ?? 0
    const fold = () => whenPicker.current?.close()
    const onScroll = () => {
      if (Math.abs((scroller?.scrollTop ?? 0) - opened) > 2) fold()
    }
    scroller?.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', fold)
    return () => {
      scroller?.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', fold)
    }
  }, [whenOpen])

  function openWhen() {
    const trigger = whenTrigger.current
    const scroller = card.current
    if (!trigger) return
    // A calendar needs room under its trigger: lift the trigger to the card's top first when it has less.
    const room = window.innerHeight - trigger.getBoundingClientRect().bottom
    if (scroller && room < CALENDAR_ROOM) {
      scroller.scrollTop += trigger.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 16
    }
    const rect = trigger.getBoundingClientRect()
    setWhenAnchor({ top: rect.top, left: rect.left, width: rect.width, height: rect.height })
    setWhenOpen(true)
  }
  const [capOn, setCapOn] = useState(false)
  const [cap, setCap] = useState('50')
  const [touched, setTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<CreatorSale | null>(null)

  const isManaged = isManagedWallet(session)

  function trackSale(event: string, props: Record<string, unknown> = {}) {
    if (!silent) track(event, { source, ...props })
  }
  const pct = pctPreset === 'custom' ? Number(customPct) : pctPreset

  // The terms as they stand, validated the way the submit will validate them, so the button and the inline
  // message agree. `now` is taken per render: a "72 hours" sale is measured from the click, not from mount.
  const terms = useMemo(() => {
    const now = Date.now()
    const { startsAtMs, endsAtMs } = windowOf(when, now)
    const uses = capOn ? Number(cap) : undefined
    const candidate = { collections: selected, discountPct: pct, startsAtMs, endsAtMs, uses }
    let problem: SaleInputProblem | null = null
    try {
      validateSaleTerms(candidate, now)
    } catch (e) {
      problem = e instanceof SaleInputError ? e.problem : 'window'
    }
    return { ...candidate, problem }
  }, [selected, pct, when, capOn, cap])

  /**
   * Opening the flow is the top of the funnel. Guarded by a ref rather than an empty dependency list so it
   * fires once per opening: StrictMode re-runs effects in development, and refs survive that re-run.
   */
  const started = useRef(false)
  useEffect(() => {
    if (started.current) return
    started.current = true
    trackSale('Shop Started Sale', {
      collections_available: collection ? 1 : choices.length,
      preselected: !!collection
    })
  })

  /**
   * Leaving without a sale, from any step. Every way out of this modal already goes through `onClose` — the
   * scrim, the close button, the cancel — so wrapping it once catches all of them.
   */
  function leave(reason: 'closed' | 'update_prices') {
    if (!created) {
      // A collection priced entirely in MANA never shows the form at all, so "form" would be a step the
      // creator did not see. And following the button there is the path we recommend, not a drop-off, which
      // is what `reason` is for: one closing event per opening, with how it closed.
      const blocked = review.listed.length === 0 && review.classic.length > 0
      trackSale('Shop Abandoned Sale', { last_step: blocked ? 'blocked' : step, reason })
    }
    closeModal()
  }
  function onClose() {
    leave('closed')
  }

  // What a buyer will see: the collection's priciest listed items, where the cut reads clearest.
  const previewItems = useMemo(
    () =>
      current.items
        .filter(i => i.state === 'discounted' && i.priceCredits != null)
        .sort((a, b) => (b.priceCredits as number) - (a.priceCredits as number)),
    [current]
  )

  /** Whether the strip can scroll either way, so its arrows show only when there is somewhere to go. */
  function measureStrip() {
    const el = strip.current
    if (!el) return
    const start = el.scrollLeft <= 1
    const end = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1
    setStripEdges(prev => (prev.start === start && prev.end === end ? prev : { start, end }))
  }
  function scrollStrip(direction: 1 | -1) {
    const el = strip.current
    if (el) el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: 'smooth' })
  }
  useEffect(measureStrip, [previewItems, step])

  /** The collection split the way the review reads it: what the sale re-prices, and what it cannot touch. */
  const review = useMemo(() => {
    const listed = current.items.filter(i => i.state === 'discounted')
    const classic = current.items.filter(i => i.state === 'classic')
    const unlisted = current.items.filter(i => i.state === 'unlisted')
    // What the sale can move at most: the cap when there is one, otherwise every remaining copy of every
    // listed item — the honest ceiling for "how many can be sold at this price".
    const supply = listed.reduce((sum, i) => sum + i.remainingSupply, 0)
    return { listed, classic, unlisted, supply }
  }, [current])

  async function submit() {
    setTouched(true)
    setError(null)
    if (terms.problem) {
      setError(problemCopy(terms.problem))
      return
    }
    const signedWindow = reviewed ?? windowOf(when, Date.now())
    const signedAt = Date.now()
    // A start the review promised that has since gone by would sign a live sale under a "Schedule" button.
    if (signedWindow.startsAtMs !== undefined && signedWindow.startsAtMs <= signedAt) {
      setError(t('creatorSale.errorStartPassed'))
      return
    }
    try {
      validateSaleTerms({ ...terms, ...signedWindow }, signedAt)
    } catch (e) {
      setError(problemCopy(e instanceof SaleInputError ? e.problem : 'window'))
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
        startsAtMs: signedWindow.startsAtMs,
        endsAtMs: signedWindow.endsAtMs,
        uses: terms.uses
      })
      setStatus(t('creatorSale.finishing'))
      const sale = await postCoupon(payload, session.identity)
      setStatus(null)
      setCreated(sale)
      const scheduled = sale.status === 'scheduled'
      trackSale('Shop Created Sale', {
        sale_id: sale.id,
        collections: sale.collections.length,
        discount_pct: terms.discountPct,
        duration_h: Math.round((signedWindow.endsAtMs - (signedWindow.startsAtMs ?? signedAt)) / HOUR_MS),
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
        trackSale('Shop Sale Failed', { error_code: errorCode(e), step: 'create' })
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
                  <SaleCountdown until={created.checks.expiration} testId="creator-sale-countdown" />
                </>
              )}
            </S.SuccessDetail>
          </S.SuccessBanner>
          <S.Actions>
            <S.ActionBtn variant="white" onClick={onClose}>
              {t('creatorSale.done')}
            </S.ActionBtn>
            <S.ActionBtn variant="purple" onClick={viewStore}>
              {t('creatorSale.viewStore')}
            </S.ActionBtn>
          </S.Actions>
        </S.Card>
      </S.Scrim>
    )
  }

  /** When the sale runs, in one line — the same two facts the success view repeats afterwards. */
  const bold = (chunks: React.ReactNode[]) => <b>{chunks}</b>

  /**
   * The currency mark in front of whatever the message tags — an amount, or the currency's own name. The
   * message tags rather than spelling the unit out, so the sentence reads the way the prices above it do
   * and the word it used to carry cannot drift out of step with the currency's name.
   */
  const marked = (chunks: React.ReactNode[]) => (
    <S.Marked>
      <CurrencyIcon className="ccy-mark" />
      {chunks}
    </S.Marked>
  )

  /** The same treatment for the other currency: both are the platform's, so both wear their mark. */
  const manaMarked = (chunks: React.ReactNode[]) => (
    <S.Marked>
      <S.ManaMark src={manaSymbol} alt="" aria-hidden />
      {chunks}
    </S.Marked>
  )

  /** How many copies the sale price can cover: the cap when set, otherwise the listed items' own supply. */
  const capCopy =
    terms.uses !== undefined
      ? tNode('creatorSale.reviewCap', { b: bold, count: terms.uses })
      : tNode('creatorSale.reviewNoCap', { b: bold, count: review.supply })

  if (step === 'review') {
    const shown = reviewed ?? terms
    return (
      <S.Scrim onClick={busy ? undefined : onClose} role="presentation">
        <S.Card
          data-testid="creator-sale-review"
          onClick={e => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label={t('creatorSale.reviewTitle')}
        >
          <S.Head>
            <S.Title>{t('creatorSale.reviewTitle')}</S.Title>
            <S.Close onClick={onClose} disabled={busy} aria-label={t('creatorSale.cancel')}>
              <Icon name="close" className="ico" />
            </S.Close>
          </S.Head>

          {/* Three labelled rows sharing one column, so the discount, the start and the end line up as
              the same kind of fact. Each end of the window carries how long until it: a date alone does
              not answer "when does this actually happen", which is what a creator is checking here. */}
          <S.ReviewSummary>
            <S.ReviewWhenRow data-testid="creator-sale-review-discount">
              <S.ReviewWhenLabel>{t('creatorSale.discount')}</S.ReviewWhenLabel>
              <S.ReviewPct>
                <SaleTag pct={pct} testId="creator-sale-review-pct" />
              </S.ReviewPct>
            </S.ReviewWhenRow>
            <S.ReviewWhenRow data-testid="creator-sale-review-starts">
              <S.ReviewWhenLabel>{t('creatorSale.reviewStarts')}</S.ReviewWhenLabel>
              <S.ReviewWhenValue>
                {shown.startsAtMs ? formatDateTime(shown.startsAtMs) : t('creatorSale.reviewStartsNow')}
              </S.ReviewWhenValue>
              {shown.startsAtMs ? <S.ReviewWhenLeft until={shown.startsAtMs} /> : null}
            </S.ReviewWhenRow>
            <S.ReviewWhenRow data-testid="creator-sale-review-ends">
              <S.ReviewWhenLabel>{t('creatorSale.reviewEnds')}</S.ReviewWhenLabel>
              <S.ReviewWhenValue>{formatDateTime(shown.endsAtMs)}</S.ReviewWhenValue>
              <S.ReviewWhenLeft until={shown.endsAtMs} />
            </S.ReviewWhenRow>
          </S.ReviewSummary>

          <S.ReviewGroup>
            <S.ReviewGroupTitle>{t('creatorSale.reviewOnSale', { count: review.listed.length })}</S.ReviewGroupTitle>
            <S.ReviewList data-testid="creator-sale-review-items">
              {review.listed.map(i => (
                <S.ReviewRow key={i.key} data-testid="creator-sale-review-item">
                  <S.ReviewThumb src={i.thumbnail} alt="" />
                  <S.ReviewName data-testid="review-name">{i.name}</S.ReviewName>
                  <S.ReviewPrices>
                    <S.ReviewWas data-testid="review-was">
                      <CurrencyIcon size={14} />
                      {formatCredits(i.priceCredits as number)}
                    </S.ReviewWas>
                    <S.ReviewNow data-testid="review-now">
                      <CurrencyIcon size={16} />
                      {formatCredits(salePriceOf(i.priceCredits as number, pct))}
                    </S.ReviewNow>
                  </S.ReviewPrices>
                </S.ReviewRow>
              ))}
            </S.ReviewList>
          </S.ReviewGroup>

          {/* Its own section, above the unlisted ones: this is the group the creator can DO something about,
              and the one where "not for sale" would have been a lie. */}
          {review.classic.length > 0 ? (
            <S.ReviewGroup>
              <S.ReviewGroupTitle>
                {t('creatorSale.reviewClassic', { count: review.classic.length })}
              </S.ReviewGroupTitle>
              <S.ReviewList data-testid="creator-sale-review-classic">
                {review.classic.map(i => (
                  <S.ReviewRow key={i.key} data-muted>
                    <S.ReviewThumb src={i.thumbnail} alt="" />
                    <S.ReviewName>{i.name}</S.ReviewName>
                    <S.ReviewUnaffected>
                      {t('creatorSale.reviewClassicTag')}
                      <Tooltip content={t('creatorSale.reviewClassicWhy')}>
                        <S.UnaffectedInfo
                          name="info"
                          role="img"
                          aria-label={t('creatorSale.reviewClassicWhy')}
                          tabIndex={0}
                          data-testid="creator-sale-classic-why"
                        />
                      </Tooltip>
                    </S.ReviewUnaffected>
                  </S.ReviewRow>
                ))}
              </S.ReviewList>
              <S.ReviewFootNote>{tNode('creatorSale.reviewClassicHint', { c: marked })}</S.ReviewFootNote>
            </S.ReviewGroup>
          ) : null}

          {/* Named explicitly rather than left out: an item the creator did not list is untouched by the
              sale, and silence there reads as "everything is covered". */}
          {review.unlisted.length > 0 ? (
            <S.ReviewGroup>
              <S.ReviewGroupTitle>
                {t('creatorSale.reviewUntouched', { count: review.unlisted.length })}
              </S.ReviewGroupTitle>
              <S.ReviewList data-testid="creator-sale-review-untouched">
                {review.unlisted.map(i => (
                  <S.ReviewRow key={i.key} data-muted>
                    <S.ReviewThumb src={i.thumbnail} alt="" />
                    <S.ReviewName>{i.name}</S.ReviewName>
                    <S.ReviewUnaffected>{t('creatorSale.reviewNotListed')}</S.ReviewUnaffected>
                  </S.ReviewRow>
                ))}
              </S.ReviewList>
            </S.ReviewGroup>
          ) : null}

          <S.ReviewFoot>{capCopy}</S.ReviewFoot>

          {status ? <S.Status>{status}</S.Status> : null}
          <ErrorNotice message={error} testId="creator-sale-error" />

          <S.Actions>
            <S.ActionBtn
              variant="white"
              onClick={() => {
                // A rejected signature left its notice on screen when the creator came back to change
                // something — the message then belonged to an attempt that no longer exists.
                setError(null)
                setStatus(null)
                setStep('form')
              }}
              disabled={busy}
              data-testid="creator-sale-back"
            >
              {t('creatorSale.back')}
            </S.ActionBtn>
            <S.ActionBtn variant="red" data-testid="creator-sale-submit" onClick={() => void submit()} disabled={busy}>
              {busy ? (
                status
              ) : (
                <>
                  <span aria-hidden>🔥</span>
                  {shown.startsAtMs ? t('creatorSale.submitScheduled') : t('creatorSale.submit')}
                </>
              )}
            </S.ActionBtn>
          </S.Actions>
        </S.Card>
      </S.Scrim>
    )
  }

  const inlineProblem = touched && terms.problem ? problemCopy(terms.problem) : null
  // A percentage the terms refuse is not a price anyone will see, so the preview shows none.
  const previewPct = terms.problem === 'pct' ? 0 : pct
  // Whether any price shown rounds away from the exact cut: Credits are whole, so the badge and the price can disagree.
  const rounded =
    previewPct > 0 && previewItems.some(i => ((i.priceCredits as number) * (100 - previewPct)) % 100 !== 0)
  const customPctOpen = pctPreset === 'custom'
  const dateFormat = new Intl.DateTimeFormat(activeLocale(), { month: 'short', day: 'numeric' })
  const whenLabel =
    when.kind === 'preset'
      ? t('creatorSale.whenNow', { duration: durationLabel(when.hours) })
      : t('creatorSale.whenRange', { from: dateFormat.format(when.from), to: dateFormat.format(when.to) })

  /**
   * Which collection, when the modal was opened from the discounts panel rather than from a collection.
   *
   * First rather than last because everything after it is about this collection: the price the preview
   * quotes, what the review promises to leave alone, the cap. Asking for the terms first and the subject
   * afterwards would mean re-reading all of it.
   */
  if (step === 'pick') {
    const needle = query.trim().toLowerCase()
    // What can take a discount first: a collection with nothing in Credits only leads to the MANA notice.
    const shownChoices = [...choices]
      .filter(c => !needle || c.name.toLowerCase().includes(needle))
      .sort((a, b) => b.listedCount - a.listedCount)
    return (
      <S.Scrim onClick={onClose} role="presentation">
        <S.Card
          data-testid="creator-sale-pick"
          onClick={e => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label={t('creatorSale.pickTitle')}
        >
          <S.Head>
            <S.Title>{t('creatorSale.pickTitle')}</S.Title>
            <S.Close onClick={onClose} aria-label={t('creatorSale.cancel')}>
              <Icon name="close" className="ico" />
            </S.Close>
          </S.Head>
          <S.Subtitle>{t('creatorSale.pickBody')}</S.Subtitle>
          {choices.length >= SEARCH_FROM ? (
            <S.Search>
              <Icon name="search" size={16} aria-hidden />
              <input
                type="search"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder={t('creatorSale.searchCollections')}
                aria-label={t('creatorSale.searchCollections')}
                data-testid="creator-sale-pick-search"
              />
            </S.Search>
          ) : null}
          {choices.length >= SEARCH_FROM ? (
            <S.FieldHint>
              {t('creatorSale.pickCount', {
                count: choices.length,
                credits: choices.filter(c => c.listedCount > 0).length
              })}
            </S.FieldHint>
          ) : null}
          <S.PickList>
            {shownChoices.length === 0 ? (
              <S.FieldHint data-testid="creator-sale-pick-empty">
                {t('creatorSale.pickNoMatch', { query: query.trim() })}
              </S.FieldHint>
            ) : null}
            {shownChoices.map(choice => (
              <S.PickRow
                key={choice.contractAddress}
                type="button"
                onClick={() => {
                  setPicked(choice)
                  setStep('form')
                }}
                data-testid="creator-sale-pick-row"
              >
                <S.RowThumb>
                  <CollectionThumb contractAddress={choice.contractAddress} />
                </S.RowThumb>
                <S.RowText>
                  <S.RowName>{choice.name}</S.RowName>
                  <S.RowMeta>{t('creatorSale.collectionListed', { count: choice.listedCount })}</S.RowMeta>
                </S.RowText>
                <Chevron className="ico" />
              </S.PickRow>
            ))}
          </S.PickList>
        </S.Card>
      </S.Scrim>
    )
  }

  /**
   * Nothing here a discount can reach: every listing in this collection is priced in MANA.
   *
   * Offered anyway, and answered here. The button used to be absent for these collections, which told the
   * creator nothing — least of all that the fix is one page away.
   */
  if (review.listed.length === 0 && review.classic.length > 0) {
    return (
      <S.Scrim onClick={onClose} role="presentation">
        <S.Card
          data-testid="creator-sale-blocked"
          onClick={e => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label={t('creatorSale.title')}
        >
          <S.Head>
            <S.Title>{t('creatorSale.title')}</S.Title>
            <S.Close onClick={onClose} aria-label={t('creatorSale.cancel')}>
              <Icon name="close" className="ico" />
            </S.Close>
          </S.Head>
          <S.Subtitle>
            {tNode('creatorSale.blockedBody', { c: marked, m: manaMarked, count: review.classic.length })}
          </S.Subtitle>
          <S.Actions>
            <S.ActionBtn variant="white" onClick={onClose}>
              {t('creatorSale.cancel')}
            </S.ActionBtn>
            <S.ActionBtn
              variant="red"
              onClick={() => {
                leave('update_prices')
                navigate('/activity?section=listings')
              }}
            >
              {t('creatorSale.blockedCta')}
            </S.ActionBtn>
          </S.Actions>
        </S.Card>
      </S.Scrim>
    )
  }

  return (
    <S.Scrim onClick={busy ? undefined : onClose} role="presentation">
      <S.Card
        ref={card}
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

        {/* Read-only: the sale is scoped to the collection the creator opened it from, so this states the
            context rather than offering a choice. */}
        <S.CollectionRow data-testid="creator-sale-collections">
          <S.RowThumb>
            <CollectionThumb contractAddress={current.contractAddress} />
          </S.RowThumb>
          <S.RowInfo>
            <S.RowName>{current.name}</S.RowName>
            <S.RowMeta>{t('creatorSale.collectionListed', { count: current.listedCount })}</S.RowMeta>
          </S.RowInfo>
        </S.CollectionRow>

        <S.Field>
          <S.FieldLabel>{t('creatorSale.discount')}</S.FieldLabel>
          <S.Chips role="group" aria-label={t('creatorSale.discount')} data-testid="creator-sale-discounts">
            {PCT_PRESETS.map(p => (
              <S.Chip
                key={p}
                type="button"
                data-selected={pctPreset === p || undefined}
                aria-pressed={pctPreset === p}
                aria-label={t('creatorSale.offPct', { pct: p })}
                disabled={busy}
                onClick={() => {
                  setTouched(true)
                  setPctPreset(p)
                }}
                data-testid={`creator-sale-pct-${p}`}
              >
                {pctPreset === p ? <span aria-hidden>🔥</span> : null}
                {t('creatorSale.pctTag', { pct: p })}
              </S.Chip>
            ))}
            {customPctOpen ? (
              <S.InlineInput
                data-selected
                aria-invalid={touched && terms.problem === 'pct' ? true : undefined}
                data-testid="creator-sale-custom-pct-field"
              >
                <span aria-hidden>-</span>
                <input
                  type="number"
                  min={MIN_SALE_PCT}
                  max={MAX_SALE_PCT}
                  step="1"
                  inputMode="numeric"
                  value={customPct}
                  disabled={busy}
                  autoFocus
                  aria-label={t('creatorSale.pctLabel')}
                  onChange={e => {
                    setTouched(true)
                    // Whole percentages of at most two digits, or nothing: anything else keeps what was there, so
                    // "5.5" or "1e1" can never be rewritten into a discount nobody typed.
                    const next = e.target.value
                    if (/^\d{0,2}$/.test(next)) setCustomPct(next)
                  }}
                />
                <span aria-hidden>%</span>
              </S.InlineInput>
            ) : (
              <S.Chip
                type="button"
                disabled={busy}
                onClick={() => {
                  setTouched(true)
                  setPctPreset('custom')
                }}
                data-testid="creator-sale-custom-pct-chip"
              >
                {t('creatorSale.customPct')}
              </S.Chip>
            )}
          </S.Chips>
        </S.Field>

        <S.Field>
          <S.FieldLabel>{t('creatorSale.when')}</S.FieldLabel>
          <S.WhenWrap>
            <S.WhenTrigger
              type="button"
              aria-expanded={whenOpen}
              aria-haspopup="dialog"
              aria-label={`${t('creatorSale.when')}: ${whenLabel}`}
              ref={whenTrigger}
              data-sale-when-trigger=""
              disabled={busy}
              onClick={() => (whenOpen ? whenPicker.current?.close() : openWhen())}
              data-testid="creator-sale-when"
            >
              <Icon name="calendar" size={20} aria-hidden />
              <span>{whenLabel}</span>
              <Icon name="arrow-drop-down" size={24} aria-hidden data-open={whenOpen ? '' : undefined} />
            </S.WhenTrigger>
            {whenOpen && whenAnchor
              ? createPortal(
                  <S.WhenAnchor ref={anchor} style={whenAnchor}>
                    <RangePicker
                      stretch
                      handle={whenPicker}
                      label={t('creatorSale.when')}
                      triggerSelector={WHEN_TRIGGER}
                      testId="creator-sale-range"
                      presetTestId="creator-sale-when"
                      from={when.kind === 'range' ? when.from : Date.now()}
                      to={when.kind === 'range' ? when.to : Date.now() + (when.hours - 1) * HOUR_MS}
                      min={startOfDay(Date.now())}
                      max={Date.now() + (MAX_DAYS - 1) * DAY_MS}
                      presets={DURATION_PRESETS.map(d => ({
                        key: d.key,
                        label: durationLabel(d.hours),
                        active: when.kind === 'preset' && when.key === d.key,
                        onPick: () => {
                          setTouched(true)
                          setWhen({ kind: 'preset', key: d.key, hours: d.hours })
                          setWhenOpen(false)
                        }
                      }))}
                      onApply={(from, to) => {
                        setTouched(true)
                        setWhen({ kind: 'range', from, to })
                        setWhenOpen(false)
                      }}
                      onClose={() => setWhenOpen(false)}
                    />
                  </S.WhenAnchor>,
                  document.body
                )
              : null}
          </S.WhenWrap>
          {terms.startsAtMs ? (
            <S.FieldHint data-testid="creator-sale-when-hint">
              {t('creatorSale.startsOn', { date: formatDateTime(terms.startsAtMs) })}
            </S.FieldHint>
          ) : null}
        </S.Field>

        <S.CapRow>
          <S.CapLabel>
            <input
              type="checkbox"
              checked={capOn}
              disabled={busy}
              data-testid="creator-sale-cap-toggle"
              onChange={e => setCapOn(e.target.checked)}
            />
            <span>{t('creatorSale.cap')}</span>
          </S.CapLabel>
          {/* Opens in the row rather than below it: a two-character number does not need a field the
              width of the modal, and adding a row resized the card. */}
          <S.Reveal data-open={capOn || undefined} data-testid="creator-sale-cap">
            <S.MorphCell data-off={!capOn || undefined} aria-hidden={!capOn || undefined}>
              <S.InlineInput>
                <input
                  type="number"
                  min="1"
                  step="1"
                  inputMode="numeric"
                  value={cap}
                  disabled={busy}
                  tabIndex={capOn ? undefined : -1}
                  aria-label={t('creatorSale.capLabel')}
                  onChange={e => {
                    setTouched(true)
                    setCap(e.target.value)
                  }}
                />
              </S.InlineInput>
            </S.MorphCell>
          </S.Reveal>
        </S.CapRow>

        {/* The collection as a buyer will meet it: the same tag and struck price the Shop's cards wear. */}
        {previewItems.length > 0 ? (
          <S.Field>
            <S.PreviewHead>
              <S.FieldLabel>
                {t('creatorSale.previewTitle')} · {t('creatorSale.previewCount', { count: previewItems.length })}
              </S.FieldLabel>
              {stripEdges.start && stripEdges.end ? null : (
                <S.StripArrows>
                  <S.StripArrow
                    type="button"
                    aria-label={t('creatorSale.previewPrev')}
                    disabled={stripEdges.start}
                    onClick={() => scrollStrip(-1)}
                    data-testid="creator-sale-preview-prev"
                  >
                    <Icon name="chevron-down" size={16} aria-hidden style={{ transform: 'rotate(90deg)' }} />
                  </S.StripArrow>
                  <S.StripArrow
                    type="button"
                    aria-label={t('creatorSale.previewNext')}
                    disabled={stripEdges.end}
                    onClick={() => scrollStrip(1)}
                    data-testid="creator-sale-preview-next"
                  >
                    <Icon name="chevron-down" size={16} aria-hidden style={{ transform: 'rotate(-90deg)' }} />
                  </S.StripArrow>
                </S.StripArrows>
              )}
            </S.PreviewHead>
            <S.PreviewStrip ref={strip} onScroll={measureStrip} data-testid="creator-sale-preview">
              {previewItems.map(item => {
                const price = item.priceCredits as number
                const sale = salePriceOf(price, previewPct)
                return (
                  <S.PreviewCard key={item.key} data-testid="creator-sale-preview-item">
                    <S.PreviewMedia>
                      {item.thumbnail ? <img src={item.thumbnail} alt="" /> : null}
                      {sale < price ? <S.PreviewTag pct={previewPct} /> : null}
                    </S.PreviewMedia>
                    <S.PreviewName>{item.name}</S.PreviewName>
                    <S.PreviewPrices>
                      <S.PreviewNow data-testid="creator-sale-preview-now">
                        <CurrencyIcon size={14} className="ccy-mark" />
                        {formatCredits(sale)}
                      </S.PreviewNow>
                      {sale < price ? (
                        <S.PreviewWas data-testid="creator-sale-preview-was">{formatCredits(price)}</S.PreviewWas>
                      ) : null}
                    </S.PreviewPrices>
                  </S.PreviewCard>
                )
              })}
            </S.PreviewStrip>
            {rounded ? (
              <S.FieldHint data-testid="creator-sale-preview-rounding">{t('creatorSale.previewRounding')}</S.FieldHint>
            ) : null}
          </S.Field>
        ) : null}

        {status ? <S.Status>{status}</S.Status> : null}
        <ErrorNotice message={error ?? inlineProblem} testId="creator-sale-error" />

        <S.Actions>
          <S.ActionBtn variant="white" onClick={onClose} disabled={busy} data-testid="creator-sale-cancel">
            {t('creatorSale.cancel')}
          </S.ActionBtn>
          <S.ActionBtn
            variant="red"
            data-testid="creator-sale-continue"
            onClick={() => {
              setTouched(true)
              if (terms.problem) setError(problemCopy(terms.problem))
              else {
                setError(null)
                setReviewed(windowOf(when, Date.now()))
                setStep('review')
                trackSale('Shop Reviewed Sale', {
                  discount_pct: terms.discountPct,
                  duration_h: Math.round((terms.endsAtMs - (terms.startsAtMs ?? Date.now())) / HOUR_MS),
                  scheduled: terms.startsAtMs !== undefined,
                  capped: terms.uses !== undefined
                })
              }
            }}
            disabled={busy || (touched && !!terms.problem)}
          >
            {t('creatorSale.continue')}
            <Icon name="chevron-right" size={22} aria-hidden />
          </S.ActionBtn>
        </S.Actions>
      </S.Card>
    </S.Scrim>
  )
}

export default CreatorSaleModal
