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
import { Global } from '@emotion/react'
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'
import { t, tNode } from '~/intl/i18n'
import { heatFor } from '~/styles/theme'
import { formatCredits } from '~/lib/currency'
import { CurrencyIcon } from '~/components/CurrencyIcon'
import manaSymbol from '~/assets/mana-matic.svg'
import { Tooltip } from '~/components/Tooltip'
import { Icon } from '~/components/Icon'
import { ErrorNotice } from '~/components/ErrorNotice'
import { SaleCountdown } from '~/components/SaleCountdown'
import { CollectionThumb } from '~/components/CollectionThumb'
import { Chevron } from '~/components/Chevron'
import * as S from './CreatorSaleModal.styles'

/**
 * One of the collection's creations, as the review step needs it.
 *
 * Three states, not two. A discount re-prices the Shop's own credit listings, so an item still quoted in
 * MANA is left out — but it is NOT unlisted, and telling a creator it is "not for sale" when they can see
 * it on sale a click away is worse than saying nothing. It has its own state so the review can name the
 * one thing that would bring it in: updating its price.
 */
export type SaleItem = {
  key: string
  name: string
  thumbnail: string
  /** Its Shop price in credits. Null unless `state` is 'discounted'. */
  priceCredits: number | null
  /** 'discounted' takes the sale, 'classic' is listed but quoted in MANA, 'unlisted' is not for sale. */
  state: 'discounted' | 'classic' | 'unlisted'
  remainingSupply: number
}

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
  /** Every creation in it, listed or not — the review step has to account for both. */
  items: SaleItem[]
}

/** What a listed item will ring up at, rounded the way the checkout rounds the discounted amount. */
function salePriceOf(price: number, pct: number): number {
  return Math.max(1, Math.ceil((price * (100 - (Number.isFinite(pct) ? pct : 0))) / 100))
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
/**
 * The picker speaks Date, the terms speak the `datetime-local` string the rest of this file already uses.
 * Converting at the boundary keeps the change to the control itself.
 */
function asDate(value: string): Date | null {
  const ms = fromLocalInput(value)
  return ms === undefined ? null : new Date(ms)
}

/**
 * The calendar renders into a node of its own at body level. Inside the card it was clipped: the card
 * scrolls (`overflow-y: auto`), and a popup anchored inside a scrolling box is cut off by it.
 */
const CALENDAR_PORTAL = 'creator-sale-calendar'

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

/**
 * Compact on purpose — "24h", "3d". Five controls share this row, and the date field the last one opens
 * needs ~187px of it; spelled-out labels left nine pixels of slack, which CI's wider glyphs turned into a
 * wrapped row and a modal that changed height. It is also the shorthand the Shop's own countdowns speak.
 */
function durationLabel(hours: number): string {
  return hours % 24 === 0 && hours >= 24 * 2
    ? t('creatorSale.days', { count: hours / 24 })
    : t('creatorSale.hours', { count: hours })
}

/**
 * A chip that stands in for its own field until it is picked, then hands the space over.
 *
 * Both halves stay mounted so the swap can animate both ways; the collapsed one is taken out of the
 * accessibility tree and stops catching clicks (its inner control also drops out of the tab order).
 */
function MorphField({
  id,
  open,
  chip,
  field
}: {
  id: string
  open: boolean
  chip: React.ReactNode
  field: React.ReactNode
}) {
  return (
    <S.Morph data-open={open || undefined} data-testid={id}>
      <S.MorphCell data-off={open || undefined} aria-hidden={open || undefined} data-testid={`${id}-chip`}>
        {chip}
      </S.MorphCell>
      <S.MorphCell data-off={!open || undefined} aria-hidden={!open || undefined} data-testid={`${id}-field`}>
        {field}
      </S.MorphCell>
    </S.Morph>
  )
}

export function CreatorSaleModal({
  session,
  collection,
  collections,
  onCreated,
  onClose
}: {
  session: Session
  /**
   * The one collection this sale covers, when the modal is opened from that collection's own context —
   * then it is shown rather than picked.
   */
  collection?: SaleableCollection
  /**
   * Opened from the discounts panel instead, where no collection is implied: the modal asks for one
   * first. Exactly one of the two is given.
   */
  collections?: SaleableCollection[]
  onCreated?: (sale: CreatorSale) => void
  onClose: () => void
}) {
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
    const price = current.examplePriceCredits ?? 100
    return { price, sale: salePriceOf(price, pct) }
  }, [current, pct])

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
                  <SaleCountdown until={created.checks.expiration} testId="creator-sale-countdown" />
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
              <S.ReviewPct data-heat={heatFor(pct)} data-testid="creator-sale-review-pct">
                {t('creatorSale.offPct', { pct })}
              </S.ReviewPct>
            </S.ReviewWhenRow>
            <S.ReviewWhenRow data-testid="creator-sale-review-starts">
              <S.ReviewWhenLabel>{t('creatorSale.reviewStarts')}</S.ReviewWhenLabel>
              <S.ReviewWhenValue>
                {terms.startsAtMs ? formatDateTime(terms.startsAtMs) : t('creatorSale.reviewStartsNow')}
              </S.ReviewWhenValue>
              {terms.startsAtMs ? <S.ReviewWhenLeft until={terms.startsAtMs} /> : null}
            </S.ReviewWhenRow>
            <S.ReviewWhenRow data-testid="creator-sale-review-ends">
              <S.ReviewWhenLabel>{t('creatorSale.reviewEnds')}</S.ReviewWhenLabel>
              <S.ReviewWhenValue>{formatDateTime(terms.endsAtMs)}</S.ReviewWhenValue>
              <S.ReviewWhenLeft until={terms.endsAtMs} />
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
                    <S.ReviewNow data-heat={heatFor(pct)} data-testid="review-now">
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
            <S.OutlineBtn
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
            </S.OutlineBtn>
            <S.PurpleBtn data-testid="creator-sale-submit" onClick={() => void submit()} disabled={busy}>
              {busy ? status : startMode === 'later' ? t('creatorSale.submitScheduled') : t('creatorSale.submit')}
            </S.PurpleBtn>
          </S.Actions>
        </S.Card>
      </S.Scrim>
    )
  }

  const inlineProblem = touched && terms.problem ? problemCopy(terms.problem) : null
  // Which chip is currently standing in for its input.
  const customPctOpen = pctPreset === 'custom'
  const customEndOpen = duration === 'custom'
  const startLaterOpen = startMode === 'later'

  /**
   * Which collection, when the modal was opened from the discounts panel rather than from a collection.
   *
   * First rather than last because everything after it is about this collection: the price the preview
   * quotes, what the review promises to leave alone, the cap. Asking for the terms first and the subject
   * afterwards would mean re-reading all of it.
   */
  if (step === 'pick') {
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
          <S.PickList>
            {choices.map(choice => (
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
            <S.OutlineBtn onClick={onClose}>{t('creatorSale.cancel')}</S.OutlineBtn>
            <S.PurpleBtn
              onClick={() => {
                onClose()
                navigate('/activity?section=listings')
              }}
            >
              {t('creatorSale.blockedCta')}
            </S.PurpleBtn>
          </S.Actions>
        </S.Card>
      </S.Scrim>
    )
  }

  return (
    <S.Scrim onClick={busy ? undefined : onClose} role="presentation">
      {/* The calendar renders outside this tree, so its theme cannot be scoped by a generated class. */}
      <Global styles={S.calendarPortalStyles} />
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

        {/* Read-only: the sale is scoped to the collection the creator opened it from, so this states the
            context rather than offering a choice. */}
        <S.Field>
          <S.FieldLabel>{t('creatorSale.collection')}</S.FieldLabel>
          <S.CollectionList data-testid="creator-sale-collections">
            <S.CollectionRow data-selected data-readonly>
              {/* A collection has no image of its own, so it is shown the way the rest of the Shop shows
                  one: a mosaic of its first items, each over its rarity gradient. */}
              <S.RowThumb>
                <CollectionThumb contractAddress={current.contractAddress} />
              </S.RowThumb>
              <S.RowInfo>
                <S.RowName>{current.name}</S.RowName>
                <S.RowMeta>{t('creatorSale.collectionListed', { count: current.listedCount })}</S.RowMeta>
              </S.RowInfo>
            </S.CollectionRow>
          </S.CollectionList>
        </S.Field>

        <S.Field>
          <S.FieldLabel>{t('creatorSale.discount')}</S.FieldLabel>
          <S.Chips role="group" aria-label={t('creatorSale.discount')} data-testid="creator-sale-discounts">
            {PCT_PRESETS.map(p => (
              <S.Chip
                key={p}
                type="button"
                data-heat={heatFor(p)}
                data-selected={pctPreset === p || undefined}
                aria-pressed={pctPreset === p}
                disabled={busy}
                onClick={() => {
                  setTouched(true)
                  setPctPreset(p)
                }}
              >
                {t('creatorSale.offPct', { pct: p })}
              </S.Chip>
            ))}
            <MorphField
              id="creator-sale-custom-pct"
              open={customPctOpen}
              chip={
                <S.Chip
                  type="button"
                  tabIndex={customPctOpen ? -1 : undefined}
                  disabled={busy}
                  onClick={() => {
                    setTouched(true)
                    setPctPreset('custom')
                  }}
                >
                  {t('creatorSale.customPct')}
                </S.Chip>
              }
              field={
                <S.InlineInput
                  data-heat={heatFor(pct)}
                  aria-invalid={touched && terms.problem === 'pct' ? true : undefined}
                >
                  <input
                    type="number"
                    min={MIN_SALE_PCT}
                    max={MAX_SALE_PCT}
                    step="1"
                    inputMode="numeric"
                    value={customPct}
                    disabled={busy}
                    tabIndex={customPctOpen ? undefined : -1}
                    aria-label={t('creatorSale.pctLabel')}
                    onChange={e => {
                      setTouched(true)
                      setCustomPct(e.target.value)
                    }}
                  />
                  <span aria-hidden>%</span>
                </S.InlineInput>
              }
            />
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
                aria-pressed={duration === d.key}
                disabled={busy}
                onClick={() => {
                  setTouched(true)
                  setDuration(d.key)
                }}
              >
                {durationLabel(d.hours)}
              </S.Chip>
            ))}
            <MorphField
              id="creator-sale-custom-end"
              open={customEndOpen}
              chip={
                <S.Chip
                  type="button"
                  tabIndex={customEndOpen ? -1 : undefined}
                  disabled={busy}
                  onClick={() => {
                    setTouched(true)
                    setDuration('custom')
                  }}
                >
                  {t('creatorSale.customEnd')}
                </S.Chip>
              }
              field={
                <S.DateField>
                  <DatePicker
                    selected={asDate(customEnd)}
                    onChange={date => {
                      setTouched(true)
                      setCustomEnd(date ? toLocalInput(date.getTime()) : '')
                    }}
                    minDate={new Date()}
                    showTimeSelect
                    timeIntervals={30}
                    dateFormat="Pp"
                    disabled={busy}
                    tabIndex={customEndOpen ? undefined : -1}
                    showPopperArrow={false}
                    portalId={CALENDAR_PORTAL}
                    placeholderText={t('creatorSale.endLabel')}
                    aria-label={t('creatorSale.endLabel')}
                  />
                </S.DateField>
              }
            />
          </S.Chips>
        </S.Field>

        <S.Field>
          <S.FieldLabel>{t('creatorSale.start')}</S.FieldLabel>
          <S.Chips role="group" aria-label={t('creatorSale.start')}>
            <S.Chip
              type="button"
              data-selected={startMode === 'now' || undefined}
              aria-pressed={startMode === 'now'}
              disabled={busy}
              onClick={() => setStartMode('now')}
            >
              {t('creatorSale.startNow')}
            </S.Chip>
            <MorphField
              id="creator-sale-custom-start"
              open={startLaterOpen}
              chip={
                <S.Chip
                  type="button"
                  tabIndex={startLaterOpen ? -1 : undefined}
                  disabled={busy}
                  onClick={() => setStartMode('later')}
                >
                  {t('creatorSale.startLater')}
                </S.Chip>
              }
              field={
                <S.DateField>
                  <DatePicker
                    selected={asDate(startAt)}
                    onChange={date => {
                      setTouched(true)
                      setStartAt(date ? toLocalInput(date.getTime()) : '')
                    }}
                    minDate={new Date()}
                    showTimeSelect
                    timeIntervals={30}
                    dateFormat="Pp"
                    disabled={busy}
                    tabIndex={startLaterOpen ? undefined : -1}
                    showPopperArrow={false}
                    portalId={CALENDAR_PORTAL}
                    placeholderText={t('creatorSale.startLabel')}
                    aria-label={t('creatorSale.startLabel')}
                  />
                </S.DateField>
              }
            />
          </S.Chips>
        </S.Field>

        <S.Field>
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
        </S.Field>

        <S.Preview data-testid="creator-sale-preview">
          {/* One span, not the sentence's own pieces: the box centres its content with flex, and a flex
              container drops the whitespace around an element child — which ate the spaces either side of
              each amount. */}
          <span>
            {example.sale < example.price
              ? tNode('creatorSale.preview', { price: example.price, sale: example.sale, c: marked })
              : tNode('creatorSale.previewNoChange', { price: example.price, c: marked })}
          </span>
        </S.Preview>

        {status ? <S.Status>{status}</S.Status> : null}
        <ErrorNotice message={error ?? inlineProblem} testId="creator-sale-error" />

        <S.PrimaryBtn
          data-testid="creator-sale-continue"
          onClick={() => {
            setTouched(true)
            if (terms.problem) setError(problemCopy(terms.problem))
            else {
              setError(null)
              setStep('review')
            }
          }}
          disabled={busy || (touched && !!terms.problem)}
        >
          {t('creatorSale.review')}
        </S.PrimaryBtn>
      </S.Card>
    </S.Scrim>
  )
}

export default CreatorSaleModal
