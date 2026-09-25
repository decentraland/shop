import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CurrencyMark } from '~/components/CurrencyMark'
import { SalesChart } from '~/components/SalesChart'
import { activeLocale, t } from '~/intl/i18n'
import { fetchSellerSales, type SaleRow } from '~/lib/sales'
import {
  bucketStarts,
  bucketUnit,
  comparisonRange,
  seriesOf,
  type BucketUnit,
  type CompareMode,
  type ResolvedRange
} from '~/lib/storeRange'
import * as S from './StoreSalesPanel.styles'

const DAY_MS = 86_400_000

type Metric = 'sales' | 'earnings'

function manaOf(wei: bigint): number {
  return Number(wei / 10n ** 14n) / 10_000
}

/** The rows of one collection, and of one item in it, when either is picked. */
function inScope(rows: SaleRow[], collection: string, item: string): SaleRow[] {
  return rows.filter(
    row =>
      (collection === 'all' || row.contractAddress.toLowerCase() === collection) &&
      (item === 'all' || row.itemId === item)
  )
}

function formatMana(value: number): string {
  return value >= 10 ? Math.round(value).toLocaleString(activeLocale()) : value.toFixed(2)
}

const formatters = new Map<string, Intl.DateTimeFormat>()

/** One formatter per locale and shape: the tooltip formats on every pointer move. */
function formatter(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const locale = activeLocale()
  const key = `${locale}|${JSON.stringify(options)}`
  let format = formatters.get(key)
  if (!format) {
    format = new Intl.DateTimeFormat(locale, options)
    formatters.set(key, format)
  }
  return format
}

function formatDay(start: number, unit: BucketUnit, withYear: boolean): string {
  const options: Intl.DateTimeFormatOptions =
    unit === 'month' ? { month: 'short', year: 'numeric' } : { month: 'short', day: 'numeric' }
  if (withYear && unit !== 'month') options.year = 'numeric'
  return formatter(options).format(start)
}

function formatSpan(from: number, to: number): string {
  const format = formatter({ month: 'short', day: 'numeric', year: 'numeric' })
  return `${format.format(from)} – ${format.format(to)}`
}

/**
 * Sales over the page's period, drawn against the period before it or the same days a year earlier.
 *
 * The current period's rows are the ones the rest of the page already read; only the comparison is a read
 * of its own. Both are filtered to one collection, or one item of it, on the client when one is picked.
 */
export function StoreSalesPanel({
  address,
  range,
  rows,
  truncated,
  fetching,
  collections,
  onTrack,
  comparisonRows
}: {
  address: string | undefined
  range: ResolvedRange
  rows: SaleRow[]
  truncated: boolean
  fetching: boolean
  collections: { contractAddress: string; name: string; items: { itemId: string; name: string }[] }[]
  onTrack: (event: string, props: Record<string, unknown>) => void
  /** Rows to compare against instead of reading them, for the invented store, which has no address to read. */
  comparisonRows?: SaleRow[]
}) {
  const [metric, setMetric] = useState<Metric>('sales')
  const [compareChoice, setCompareChoice] = useState<CompareMode>('previous')
  const [collection, setCollection] = useState<string>('all')
  const [item, setItem] = useState<string>('all')
  // A store of one collection has no collection picker, so its items are offered straight away.
  const scoped =
    collection !== 'all'
      ? collections.find(c => c.contractAddress.toLowerCase() === collection)
      : collections.length === 1
        ? collections[0]
        : undefined
  const scopedCollection = scoped ? scoped.contractAddress.toLowerCase() : 'all'

  // All time has no window of its own: it spans what was read, and has nothing before it to compare with.
  const compare: CompareMode = range.from == null ? 'none' : compareChoice
  const from = useMemo(() => {
    if (range.from != null) return range.from
    const oldest = rows.reduce((min, row) => Math.min(min, row.timestamp), range.to)
    return Math.min(oldest, range.to - 29 * DAY_MS)
  }, [range, rows])
  const against = comparisonRange(range, compare)

  const comparisonRead = useQuery({
    queryKey: ['store-sales-compare', address, against?.from ?? null, against?.to ?? null],
    enabled: !!address && !!against && !comparisonRows,
    placeholderData: previous => previous,
    queryFn: () => fetchSellerSales({ seller: address, from: against!.from, to: against!.to })
  })
  const comparison = comparisonRows
    ? { data: { rows: comparisonRows, truncated: false }, isFetching: false }
    : comparisonRead

  const unit = bucketUnit(from, range.to)
  const current = useMemo(() => {
    const starts = bucketStarts(from, range.to, unit)
    return seriesOf(inScope(rows, scopedCollection, item), starts, range.to)
  }, [rows, from, range.to, unit, scopedCollection, item])

  const againstFrom = against?.from
  const againstTo = against?.to
  const previous = useMemo(() => {
    if (againstFrom == null || againstTo == null || !comparison.data) return null
    // Laid over the current buckets by position, so it never runs longer than the line it is read against.
    const starts = bucketStarts(againstFrom, againstTo, unit).slice(0, current.length)
    return seriesOf(inScope(comparison.data.rows, scopedCollection, item), starts, againstTo)
  }, [againstFrom, againstTo, comparison.data, unit, current.length, scopedCollection, item])

  const valueOf = (point: { sales: number; earnedWei: bigint }) =>
    metric === 'sales' ? point.sales : manaOf(point.earnedWei)
  const sum = (points: { sales: number; earnedWei: bigint }[]) =>
    metric === 'sales'
      ? points.reduce((total, point) => total + point.sales, 0)
      : manaOf(points.reduce((total, point) => total + point.earnedWei, 0n))
  const formatValue = (value: number) =>
    metric === 'sales' ? Math.round(value).toLocaleString(activeLocale()) : formatMana(value)

  const currentTotal = sum(current)
  const previousTotal = previous ? sum(previous) : null
  const change =
    previousTotal != null && previousTotal > 0
      ? Math.round(((currentTotal - previousTotal) / previousTotal) * 100)
      : null
  const partial = truncated || !!comparison.data?.truncated
  const hasSales = current.some(point => point.sales > 0) || (previous?.some(point => point.sales > 0) ?? false)

  const compareOptions = [
    { value: 'previous', label: t('myStore.chart.comparePrevious') },
    { value: 'year', label: t('myStore.chart.compareYear') },
    { value: 'none', label: t('myStore.chart.compareNone') }
  ]
  const collectionOptions = [
    { value: 'all', label: t('myStore.chart.allCollections') },
    ...collections.map(c => ({ value: c.contractAddress.toLowerCase(), label: c.name }))
  ]

  return (
    <>
      <S.Controls>
        <S.Metric role="group" aria-label={t('myStore.chart.metric')}>
          {(['sales', 'earnings'] as Metric[]).map(key => (
            <S.MetricBtn
              key={key}
              type="button"
              aria-pressed={metric === key}
              onClick={() => {
                onTrack('Shop Changed Store Chart', { control: 'metric', value: key })
                setMetric(key)
              }}
              data-testid={`store-chart-metric-${key}`}
            >
              {t(`myStore.chart.${key}`)}
            </S.MetricBtn>
          ))}
        </S.Metric>
        {range.from != null ? (
          <S.Select
            options={compareOptions}
            value={compare}
            onChange={value => {
              onTrack('Shop Changed Store Chart', { control: 'compare', value })
              setCompareChoice(value as CompareMode)
            }}
            ariaLabel={t('myStore.chart.compare')}
            className="store-chart-compare"
          />
        ) : null}
        {collections.length > 1 ? (
          <S.Select
            options={collectionOptions}
            value={collection}
            onChange={value => {
              onTrack('Shop Changed Store Chart', { control: 'collection', value: value === 'all' ? 'all' : 'one' })
              setCollection(value)
              setItem('all')
            }}
            ariaLabel={t('myStore.chart.collection')}
            className="store-chart-collection"
          />
        ) : null}
        {scoped && scoped.items.length > 1 ? (
          <S.Select
            options={[
              { value: 'all', label: t('myStore.chart.allItems') },
              ...scoped.items.map(i => ({ value: i.itemId, label: i.name }))
            ]}
            value={item}
            onChange={value => {
              onTrack('Shop Changed Store Chart', { control: 'item', value: value === 'all' ? 'all' : 'one' })
              setItem(value)
            }}
            ariaLabel={t('myStore.chart.item')}
            className="store-chart-item"
          />
        ) : null}
      </S.Controls>

      <S.Totals>
        <S.Total data-testid="store-chart-total">
          <b>
            {metric === 'earnings' ? <CurrencyMark kind="mana" /> : null}
            {formatValue(currentTotal)}
          </b>
          <span>{formatSpan(from, range.to)}</span>
        </S.Total>
        {previous && against ? (
          <S.Total data-testid="store-chart-previous">
            <b>
              {metric === 'earnings' ? <CurrencyMark kind="mana" /> : null}
              {formatValue(previousTotal ?? 0)}
              {change != null ? (
                <small data-dir={change >= 0 ? 'up' : 'down'}>
                  {' '}
                  {t('myStore.chart.change', { pct: `${change > 0 ? '+' : ''}${change}` })}
                </small>
              ) : null}
            </b>
            <span>{formatSpan(against.from, against.to)}</span>
          </S.Total>
        ) : null}
      </S.Totals>

      <S.Frame data-fetching={fetching || comparison.isFetching ? '' : undefined}>
        {hasSales ? (
          <SalesChart
            current={{
              label: t('myStore.chart.thisPeriod'),
              values: current.map(valueOf),
              starts: current.map(point => point.start)
            }}
            comparison={
              previous
                ? {
                    label: compare === 'year' ? t('myStore.chart.lastYear') : t('myStore.chart.previousPeriod'),
                    values: previous.map(valueOf),
                    starts: previous.map(point => point.start)
                  }
                : null
            }
            formatValue={formatValue}
            formatStart={start => formatDay(start, unit, compare === 'year')}
            formatTick={start => formatDay(start, unit, false)}
            wholeValues={metric === 'sales'}
            ariaLabel={t(metric === 'sales' ? 'myStore.chart.ariaSales' : 'myStore.chart.ariaEarnings', {
              span: formatSpan(from, range.to)
            })}
            dateLabel={t('myStore.chart.date')}
            roleDescription={t('myStore.chart.roleDescription')}
          />
        ) : (
          <S.Note data-testid="store-chart-empty">{t('myStore.chart.empty')}</S.Note>
        )}
      </S.Frame>

      {partial ? <S.Note>{t('myStore.chart.partial')}</S.Note> : null}
      {unit !== 'day' ? <S.Note>{t(unit === 'week' ? 'myStore.chart.byWeek' : 'myStore.chart.byMonth')}</S.Note> : null}
    </>
  )
}
