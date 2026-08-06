import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useWallet } from '~/store/wallet'
import { useManaRate } from '~/hooks/useManaRate'
import { manaWeiToCredits } from '~/lib/mana-rate'
import {
  NAME_MAX_LENGTH,
  NAME_MIN_LENGTH,
  NAME_PRICE_IN_WEI,
  checkNameAvailability,
  sanitizeNameInput,
  validateName
} from '~/lib/names'
import { useSeo } from '~/hooks/useSeo'
import { useTypedPlaceholder } from '~/hooks/useTypedPlaceholder'
import { Icon } from '~/components/Icon'
import { CurrencyIcon } from '~/components/CurrencyIcon'
import { formatCredits } from '~/lib/currency'
import { NameBuyModal } from '~/components/NameBuyModal'
import { t } from '~/intl/i18n'
import identityIcon from '~/assets/names/identity-icon.svg'
import worldIcon from '~/assets/names/world-icon.svg'
import inviteIcon from '~/assets/names/invite-icon.svg'
import governanceIcon from '~/assets/names/governance-icon.svg'
import * as S from './NamesPage.styles'

// "Learn More" destinations for the info cards. Public marketing URLs — no secrets.
const WORLDS_DOCS_URL = 'https://docs.decentraland.org/creator/worlds/about/'
const DAO_URL = 'https://governance.decentraland.org'

// The legacy marketplace's NAMEs browse — where a taken NAME's owner can be offered a secondary buy.
// The shop is credits-only/primary; secondary NAME trading lives in the classic marketplace. Pick the
// env by hostname (prod .org / stg .today / everything else incl. localhost → .zone) since the shop is
// served by-path on the same domain.
function legacyNamesUrl(name: string): string {
  const host = typeof window !== 'undefined' ? window.location.hostname : ''
  const origin = host.endsWith('decentraland.org')
    ? 'https://decentraland.org'
    : host.endsWith('decentraland.today')
      ? 'https://decentraland.today'
      : 'https://decentraland.zone'
  return `${origin}/marketplace/names/browse?search=${encodeURIComponent(name)}`
}

type Status = 'idle' | 'invalid' | 'checking' | 'available' | 'taken' | 'error'

/**
 * NAMEs purchase page (Figma 1368-353269 desktop / 1368-356251 mobile). A user searches a NAME, sees
 * live availability, and buys (registers) it with credits. PRIMARY registration only — secondary
 * NAME sales aren't supported in the shop (CreditsManager is Polygon-only; NAMEs live on Ethereum L1).
 */
export function NamesPage({ onBack }: { onBack: () => void }) {
  useSeo({ title: t('seo.names.title'), description: t('seo.names.description') })

  const { session, signIn } = useWallet()
  const { data: rate } = useManaRate()
  const priceCredits = rate ? manaWeiToCredits(NAME_PRICE_IN_WEI, rate) : null

  const [value, setValue] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [modalOpen, setModalOpen] = useState(false)

  /**
   * The placeholder types example names out until the reader touches the field, so an empty input reads
   * as "put yours here" rather than as a label. `touched` is one-way: the animation must not resume
   * behind someone who has clicked in and then clicked away, and it never restarts on a cleared field.
   */
  const [touched, setTouched] = useState(false)
  const reducedMotion =
    typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const examples = useMemo(
    () =>
      t('names.placeholderExamples')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean),
    []
  )
  const typed = useTypedPlaceholder(examples, !touched && !value && !reducedMotion)
  // The real placeholder stays put for anyone the animation is not for — a screen reader, or a reader
  // who asked for less motion — and is what the field settles on the moment it is touched.
  const placeholder = typed || t('names.inputPlaceholder')

  // Size the input to EXACTLY its text so the NAME sits flush against ".dcl.eth" (a `ch`-based width
  // over-shoots on a proportional font, leaving a big gap). A hidden sizer mirrors the input's glyphs.
  const sizerRef = useRef<HTMLSpanElement>(null)
  const [nameWidth, setNameWidth] = useState<number | undefined>(undefined)
  // Re-measures on the PLACEHOLDER too, not just the value: the animated example grows a character at a
  // time and the field has to grow with it, or ".dcl.eth" sits at a fixed distance and the example types
  // itself into the gap.
  useLayoutEffect(() => {
    if (sizerRef.current) setNameWidth(sizerRef.current.offsetWidth)
  }, [value, placeholder])

  // Validate + (debounced) availability probe on every change. The probe is advisory — the credits
  // server + the on-chain register are the authoritative gates at purchase time.
  useEffect(() => {
    const v = validateName(value)
    if (!v.ok) {
      setStatus(value.length === 0 ? 'idle' : 'invalid')
      return
    }
    setStatus('checking')
    const ctrl = new AbortController()
    const id = setTimeout(() => {
      void (async () => {
        try {
          const availability = await checkNameAvailability(value, { signal: ctrl.signal })
          setStatus(availability)
        } catch (e) {
          if ((e as { name?: string })?.name === 'AbortError') return
          setStatus('error')
        }
      })()
    }, 400)
    return () => {
      clearTimeout(id)
      ctrl.abort()
    }
  }, [value])

  // Claimable when the format is valid and the probe didn't say "taken". A probe error still lets the
  // user proceed (the server re-validates) rather than blocking on a flaky network read.
  const validation = validateName(value)
  const canClaim = validation.ok && (status === 'available' || status === 'error')

  function claim() {
    if (!canClaim) return
    if (!session) {
      signIn()
      return
    }
    setModalOpen(true)
  }

  const claimBtnContent = (
    <>
      {t('names.claim')}
      {priceCredits != null ? (
        <S.Price>
          <CurrencyIcon />
          {formatCredits(priceCredits)}
        </S.Price>
      ) : null}
    </>
  )

  return (
    <S.Root data-testid="names-page">
      <S.Breadcrumb aria-label={t('names.breadcrumbAria')}>
        <S.CrumbLink onClick={onBack}>{t('names.breadcrumbCollectibles')}</S.CrumbLink>
        <span aria-hidden>{'>'}</span>
        <S.CrumbCurrent>{t('names.breadcrumbCurrent')}</S.CrumbCurrent>
      </S.Breadcrumb>

      <S.Panel>
        <S.Hero>
          <S.HeroCopy>
            <S.HeroTitle>{t('names.heroTitle')}</S.HeroTitle>
            <S.HeroSubtitle>{t('names.heroSubtitle')}</S.HeroSubtitle>
          </S.HeroCopy>

          <S.SearchBlock>
            {/* Owns the positioning context for everything that drops out of the input. */}
            <S.InputWrap data-testid="names-input-wrap">
              <S.InputRow invalid={status === 'taken'}>
                <S.InputField>
                  <S.At aria-hidden>@</S.At>
                  <S.NameInput
                    value={value}
                    onChange={e => setValue(sanitizeNameInput(e.target.value))}
                    placeholder={placeholder}
                    aria-label={t('names.inputAria')}
                    autoComplete="off"
                    spellCheck={false}
                    maxLength={NAME_MAX_LENGTH}
                    onFocus={() => setTouched(true)}
                    style={{ width: nameWidth != null ? `${nameWidth}px` : undefined }}
                  />
                  {/* Mirrors whatever the field is showing, animated placeholder included, so ".dcl.eth"
                      stays glued to it as the example is typed out. */}
                  <S.Sizer ref={sizerRef} aria-hidden>
                    {value || placeholder}
                  </S.Sizer>
                  <S.Suffix>{t('names.suffix')}</S.Suffix>
                </S.InputField>
                {value.length > 0 ? (
                  <S.Counter aria-hidden>
                    {value.length}/{NAME_MAX_LENGTH}
                  </S.Counter>
                ) : null}
                <S.ClaimButton onClick={claim} disabled={!canClaim} data-testid="names-claim">
                  {claimBtnContent}
                </S.ClaimButton>
              </S.InputRow>

              {/* Absolute so it drops below the input WITHOUT growing the hero (Figma 1368-354064). */}
              {status === 'taken' ? (
                <S.TakenBanner role="status" data-testid="names-taken">
                  <Icon name="info" size={16} aria-hidden />
                  <span>{t('names.taken')}</span>
                  <S.TakenOfferLink href={legacyNamesUrl(value)} target="_blank" rel="noopener noreferrer">
                    {t('names.takenMakeOffer')}
                    <Icon name="external-link" size={13} aria-hidden />
                  </S.TakenOfferLink>
                </S.TakenBanner>
              ) : null}

              {/* Floated like the banner above, so the hero keeps its height as these come and go. */}
              {status === 'checking' ? (
                <S.StatusFloating tone="muted" role="status" data-testid="names-checking">
                  {t('names.checking')}
                </S.StatusFloating>
              ) : status === 'error' ? (
                <S.StatusFloating tone="muted" role="status">
                  {t('names.checkError')}
                </S.StatusFloating>
              ) : status === 'invalid' && !validation.ok && validation.reason === 'too-short' ? (
                <S.StatusFloating tone="muted" role="status">
                  {t('names.tooShort', { min: NAME_MIN_LENGTH })}
                </S.StatusFloating>
              ) : null}
            </S.InputWrap>

            <S.ClaimButtonMobile onClick={claim} disabled={!canClaim}>
              {claimBtnContent}
            </S.ClaimButtonMobile>

            {/* Announce availability to assistive tech (Figma signals it only by enabling the button). */}
            <S.SrOnly role="status" aria-live="polite">
              {status === 'available' ? t('names.available', { name: value }) : ''}
            </S.SrOnly>
          </S.SearchBlock>
        </S.Hero>

        <S.Why>
          <S.WhyHead>
            <S.WhyTitle>{t('names.whyTitle')}</S.WhyTitle>
            <S.WhyIntro>{t('names.whyIntro')}</S.WhyIntro>
          </S.WhyHead>
          <S.Cards>
            <S.Card>
              <S.CardIcon src={identityIcon} alt="" />
              <S.CardInfo>
                <S.CardTitle>{t('names.why1Title')}</S.CardTitle>
                <S.CardText>{t('names.why1')}</S.CardText>
              </S.CardInfo>
            </S.Card>
            <S.Card>
              <S.CardIcon src={worldIcon} alt="" />
              <S.CardInfo>
                <S.CardTitle>{t('names.why2Title')}</S.CardTitle>
                <S.CardText>
                  {t('names.why2')} <S.CardHighlight>{t('names.why2Address')}</S.CardHighlight>
                </S.CardText>
                <S.CardLink href={WORLDS_DOCS_URL} target="_blank" rel="noopener noreferrer">
                  {t('names.learnMore')}
                  <Icon name="external-link" aria-hidden />
                </S.CardLink>
              </S.CardInfo>
            </S.Card>
            <S.Card>
              <S.CardIcon src={inviteIcon} alt="" />
              <S.CardInfo>
                <S.CardTitle>{t('names.why3Title')}</S.CardTitle>
                <S.CardText>{t('names.why3')}</S.CardText>
              </S.CardInfo>
            </S.Card>
            <S.Card>
              <S.CardIcon src={governanceIcon} alt="" />
              <S.CardInfo>
                <S.CardTitle>{t('names.why4Title')}</S.CardTitle>
                <S.CardText>{t('names.why4')}</S.CardText>
                <S.CardLink href={DAO_URL} target="_blank" rel="noopener noreferrer">
                  {t('names.learnMore')}
                  <Icon name="external-link" aria-hidden />
                </S.CardLink>
              </S.CardInfo>
            </S.Card>
          </S.Cards>
        </S.Why>
      </S.Panel>

      {modalOpen ? <NameBuyModal name={value} priceCredits={priceCredits} onClose={() => setModalOpen(false)} /> : null}
    </S.Root>
  )
}

export default NamesPage
