import { useState, type ReactNode } from 'react'
import { CATEGORIES, CategoryFilter } from '~/components/CategoryFilter'
import { Chevron } from '~/components/Chevron'
import { Tooltip } from '~/components/Tooltip'
import { RARITIES } from '~/components/FilterBar'
import { CURRENCY } from '~/lib/currency'
import { capitalizeFirst } from '~/lib/text'
import { t } from '~/intl/i18n'
import { theme } from '~/styles/theme'
import * as S from './Filters.styles'

// Status of a listing: everything, only-listed (on sale), or only not-listed. Wired to a query param;
// 'all' is the default and adds no filter.
export type FilterStatus = 'all' | 'on_sale' | 'not_for_sale'

// Upper bound for the sidebar price range slider (in credits). The Min/Max text inputs stay free-form
// (an exact price above this is still typable); the slider is the coarse control.
const PRICE_SLIDER_MAX = 100_000

// Human label for a sub-category key (keys double as labels — "Upper Body" — but fall back to the
// category-map labelKey when one exists).
function subCategoryLabel(key: string): string {
  for (const top of CATEGORIES) {
    const sub = top.subs?.find(s => s.key === key)
    if (sub) return t(sub.labelKey)
  }
  return key
}

function FilterSection({
  title,
  open,
  onToggle,
  summary,
  desktopStatic,
  headerTestId,
  headerAria,
  children
}: {
  title: string
  open: boolean
  onToggle: () => void
  summary?: string
  desktopStatic?: boolean
  headerTestId?: string
  headerAria?: string
  children: ReactNode
}) {
  const chevron = <Chevron up={open} size={24} color="var(--text)" />
  return (
    <S.Section>
      <S.Header
        type="button"
        desktopStatic={desktopStatic}
        onClick={onToggle}
        aria-expanded={open}
        aria-label={headerAria}
        data-testid={headerTestId}
      >
        <S.Title>{title}</S.Title>
        {desktopStatic ? <S.HeaderChevronDesktopHidden>{chevron}</S.HeaderChevronDesktopHidden> : chevron}
      </S.Header>
      {!open && summary ? <S.Summary desktopHidden={desktopStatic}>{summary}</S.Summary> : null}
      <S.Content open={open} desktopStatic={desktopStatic}>
        <S.ContentInner>{children}</S.ContentInner>
      </S.Content>
    </S.Section>
  )
}

export function Filters({
  category,
  subCategory,
  onCategory,
  onSub,
  priceMin,
  priceMax,
  onPriceMin,
  onPriceMax,
  rarities,
  onToggleRarity,
  status,
  onStatus,
  smart,
  onSmart
}: {
  category: string
  subCategory: string | null
  onCategory: (key: string) => void
  onSub: (key: string | null) => void
  priceMin: string
  priceMax: string
  onPriceMin: (v: string) => void
  onPriceMax: (v: string) => void
  rarities: string[]
  onToggleRarity: (r: string) => void
  status: FilterStatus
  onStatus: (s: FilterStatus) => void
  smart: boolean
  onSmart: (v: boolean) => void
}) {
  // Rarity starts collapsed (mirrors the previous sidebar + keeps the browse e2e meaningful); the rest
  // open by default so their content shows straight away.
  const [openCategory, setOpenCategory] = useState(true)
  const [openPrice, setOpenPrice] = useState(true)
  const [openRarity, setOpenRarity] = useState(false)
  const [openStatus, setOpenStatus] = useState(true)

  const min = priceMin && !Number.isNaN(Number(priceMin)) ? Number(priceMin) : undefined
  const max = priceMax && !Number.isNaN(Number(priceMax)) ? Number(priceMax) : undefined
  const sliderMin = min != null ? Math.min(min, PRICE_SLIDER_MAX) : 0
  const sliderMax = max != null ? Math.min(max, PRICE_SLIDER_MAX) : PRICE_SLIDER_MAX
  const minPct = (sliderMin / PRICE_SLIDER_MAX) * 100
  const maxPct = (sliderMax / PRICE_SLIDER_MAX) * 100
  function onSlideMin(v: number) {
    const n = Math.min(v, sliderMax)
    onPriceMin(n <= 0 ? '' : String(n))
  }
  function onSlideMax(v: number) {
    const n = Math.max(v, sliderMin)
    onPriceMax(n >= PRICE_SLIDER_MAX ? '' : String(n))
  }

  const categorySummary = subCategory
    ? subCategoryLabel(subCategory)
    : category !== 'wearable'
      ? t(`categories.${category === 'emote' ? 'emotes' : category === 'all' ? 'shopAll' : category}`)
      : ''
  const priceSummary = min != null || max != null ? `${priceMin || '0'}-${priceMax || '∞'}` : ''
  const raritySummary = RARITIES.filter(r => rarities.includes(r))
    .map(capitalizeFirst)
    .join(', ')
  const statusSummary =
    status === 'on_sale' ? t('filter.onSale') : status === 'not_for_sale' ? t('filter.notForSale') : ''

  return (
    <S.Root>
      <FilterSection
        title={t('assets.category')}
        open={openCategory}
        onToggle={() => setOpenCategory(o => !o)}
        summary={categorySummary}
        desktopStatic
      >
        <CategoryFilter category={category} subCategory={subCategory} onCategory={onCategory} onSub={onSub} />
      </FilterSection>

      <S.Divider />

      <FilterSection
        title={t('filter.price')}
        open={openPrice}
        onToggle={() => setOpenPrice(o => !o)}
        summary={priceSummary}
        desktopStatic
      >
        <S.PriceInputs>
          <S.PriceField>
            <S.PriceFieldLabel>{t('assets.min')}</S.PriceFieldLabel>
            <S.PriceBox>
              <S.PriceCoin name={CURRENCY.iconName} aria-hidden />
              <S.PriceInput
                type="number"
                min="0"
                aria-label={t('assets.minPriceAria')}
                placeholder="0"
                value={priceMin}
                onChange={e => onPriceMin(e.target.value)}
              />
            </S.PriceBox>
          </S.PriceField>
          <S.PriceTo>{t('assets.priceTo')}</S.PriceTo>
          <S.PriceField>
            <S.PriceFieldLabel>{t('assets.max')}</S.PriceFieldLabel>
            <S.PriceBox>
              <S.PriceCoin name={CURRENCY.iconName} aria-hidden />
              <S.PriceInput
                type="number"
                min="0"
                aria-label={t('assets.maxPriceAria')}
                placeholder="0"
                value={priceMax}
                onChange={e => onPriceMax(e.target.value)}
              />
            </S.PriceBox>
          </S.PriceField>
        </S.PriceInputs>

        <S.Slider>
          <S.SliderTrack aria-hidden />
          <S.SliderFill minPct={minPct} maxPct={maxPct} aria-hidden />
          <S.SliderInput
            type="range"
            min={0}
            max={PRICE_SLIDER_MAX}
            value={sliderMin}
            aria-label={t('assets.minPriceSliderAria')}
            onChange={e => onSlideMin(Number(e.target.value))}
          />
          <S.SliderInput
            type="range"
            min={0}
            max={PRICE_SLIDER_MAX}
            value={sliderMax}
            aria-label={t('assets.maxPriceSliderAria')}
            onChange={e => onSlideMax(Number(e.target.value))}
          />
        </S.Slider>

        <S.SliderRange>
          <S.SliderRangeVal>
            <S.RangeCoin name={CURRENCY.iconName} aria-hidden />
            {sliderMin.toLocaleString()}
          </S.SliderRangeVal>
          <S.SliderRangeVal>
            <S.RangeCoin name={CURRENCY.iconName} aria-hidden />
            {sliderMax.toLocaleString()}
          </S.SliderRangeVal>
        </S.SliderRange>
      </FilterSection>

      <S.Divider />

      <FilterSection
        title={t('assets.rarity')}
        open={openRarity}
        onToggle={() => setOpenRarity(o => !o)}
        summary={raritySummary}
        headerTestId="sidebar-section-toggle"
      >
        <S.RarityChips data-testid="rarity-filter">
          {RARITIES.map(r => {
            const selected = rarities.includes(r)
            return (
              <S.RarityChip
                key={r}
                type="button"
                selected={selected}
                aria-pressed={selected}
                onClick={() => onToggleRarity(r)}
                data-testid="rarity-filter-check"
              >
                <S.RaritySwatch color={theme.rarities[r as keyof typeof theme.rarities]}>
                  {selected ? <S.RaritySwatchCheck name="check" aria-hidden /> : null}
                </S.RaritySwatch>
                <S.RarityName selected={selected}>{r}</S.RarityName>
              </S.RarityChip>
            )
          })}
        </S.RarityChips>
      </FilterSection>

      <S.Divider />

      <FilterSection
        title={t('filter.status')}
        open={openStatus}
        onToggle={() => setOpenStatus(o => !o)}
        summary={statusSummary}
      >
        {(
          [
            ['all', t('filter.statusAll')],
            ['on_sale', t('filter.onSale')],
            ['not_for_sale', t('filter.notForSale')]
          ] as [FilterStatus, string][]
        ).map(([value, label]) => (
          <S.StatusRow key={value}>
            <S.StatusRadio
              type="radio"
              name="shop-status"
              checked={status === value}
              onChange={() => onStatus(value)}
            />
            <S.StatusLabel>{label}</S.StatusLabel>
          </S.StatusRow>
        ))}
      </FilterSection>

      <S.Divider />

      <S.SmartRow>
        <S.SmartLeft>
          <S.SmartFlash name="smart" aria-hidden />
          <S.SmartTitle>{t('filter.smart')}</S.SmartTitle>
          <Tooltip content={t('filter.smartHint')} placement="bottom">
            <S.SmartInfo name="info" role="img" aria-label={t('filter.smartHint')} tabIndex={0} />
          </Tooltip>
        </S.SmartLeft>
        <S.Toggle
          type="button"
          role="switch"
          on={smart}
          aria-checked={smart}
          aria-label={t('filter.smart')}
          onClick={() => onSmart(!smart)}
        >
          <S.ToggleKnob on={smart} />
        </S.Toggle>
      </S.SmartRow>
    </S.Root>
  )
}
