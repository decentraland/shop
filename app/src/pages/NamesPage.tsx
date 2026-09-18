import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
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
import { useNamesEnabled } from '~/hooks/useNamesEnabled'
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

export type NamesNavState = {
  /** A NAME to re-open the buy modal on, after a credits top-up that was started from inside it. */
  resumeName?: string
}

/**
 * NAMEs purchase page (Figma 1368-353269 desktop / 1368-356251 mobile). A user searches a NAME, sees
 * live availability, and buys (registers) it with credits. PRIMARY registration only — secondary
 * NAME sales aren't supported in the shop (CreditsManager is Polygon-only; NAMEs live on Ethereum L1).
 */
export function NamesPage({ onBack }: { onBack: () => void }) {
  useSeo({ title: t('seo.names.title'), description: t('seo.names.description') })

  const { session, signIn } = useWallet()
  const navigate = useNavigate()
  const location = useLocation()
  const { pathname, search } = location
  /**
   * Narrowed, not just cast: `location.state` is `any`, and it is written by whoever navigated here. A
   * non-string `resumeName` would reach `setValue` and then `.toLowerCase()` in the resume effect below.
   */
  const rawNavState = (location as { state?: NamesNavState }).state
  const navState = typeof rawNavState?.resumeName === 'string' ? rawNavState : undefined
  const namesEnabled = useNamesEnabled()
  const { data: rate } = useManaRate()
  const priceCredits = rate ? manaWeiToCredits(NAME_PRICE_IN_WEI, rate) : null

  // Seeded from the resume state rather than filled by an effect: the effect that re-opens the modal runs
  // in the same commit and would read an empty field as "they typed something else" and drop the resume.
  const [value, setValue] = useState(navState?.resumeName ?? '')
  const [status, setStatus] = useState<Status>('idle')
  const [modalOpen, setModalOpen] = useState(false)
  // The NAME a top-up was started for, latched on the first render so clearing the history entry below
  // cannot take it away again. Cleared once the probe has answered for it, either way.
  const [pendingResume, setPendingResume] = useState(navState?.resumeName ?? '')

  /**
   * The placeholder types example names out until the reader touches the field, so an empty input reads
   * as "put yours here" rather than as a label. `touched` is one-way: the animation must not resume
   * behind someone who has clicked in and then clicked away, and it never restarts on a cleared field.
   */
  const [touched, setTouched] = useState(!!navState?.resumeName)
  const [reducedMotion, setReducedMotion] = useState(
    () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  )
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!mq) return
    const onChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  const examplesCsv = t('names.placeholderExamples')
  const examples = useMemo(
    () =>
      examplesCsv
        .split(',')
        .map(s => s.trim())
        .filter(Boolean),
    [examplesCsv]
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
    // getBoundingClientRect, not offsetWidth: the latter rounds UP to whole pixels, and that fraction is
    // dead space between the last glyph and the suffix.
    if (sizerRef.current) setNameWidth(sizerRef.current.getBoundingClientRect().width)
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
  //
  // The flag gates only this. Search stays live because availability is a free public read against the
  // registrar that does not touch credits or the bridge, so a closed feature can still answer the question
  // and hand the user somewhere that can sell them the name today.
  const validation = validateName(value)
  // Named once because the two below must stay each other's exact complement: the notice has to appear in
  // precisely the cases where the button would otherwise have been clickable. Spelled out twice, editing
  // one and not the other silently produces a name that can neither be claimed nor explained.
  const claimEligible = validation.ok && (status === 'available' || status === 'error')
  const canClaim = namesEnabled && claimEligible
  const registrationClosed = !namesEnabled && claimEligible

  function claim() {
    if (!canClaim) return
    if (!session) {
      signIn()
      return
    }
    setModalOpen(true)
  }

  /**
   * Resume after a Stripe top-up: /credits routes back here with the NAME the buyer ran out of credits on.
   * The field is already seeded with it above (which starts the availability probe); this drops the history
   * entry, so a refresh or a Back doesn't re-open the modal on a purchase that already happened.
   */
  useEffect(() => {
    if (!navState?.resumeName) return
    // The full path, not '.', which resolves to the pathname alone and would drop `?category=names` —
    // the query string IS what renders this page (see Assets.tsx).
    navigate(`${pathname}${search}`, { replace: true, state: null })
  }, [navState?.resumeName, navigate, pathname, search])

  /**
   * Re-open the modal, once the probe has answered.
   *
   * Gated on `canClaim` rather than done on arrival: the buyer was away on Stripe's hosted page for
   * minutes, and a NAME somebody else claimed in the meantime must not re-open a purchase modal for
   * something that can no longer be bought. A failed probe still goes through — same call the page makes
   * for a hand-typed search, since the register is the authority either way. A NAME that went is simply
   * left on the page with the "taken" notice, the credits safely in the balance.
   */
  useEffect(() => {
    if (!pendingResume) return
    // They started typing something else — their input wins over a resume they have moved on from.
    if (value.toLowerCase() !== pendingResume.toLowerCase()) {
      setPendingResume('')
      return
    }
    if (status === 'idle' || status === 'checking') return
    // The NAME is gone, or unusable. Nothing left to resume, and the page's own notice says why.
    if (!claimEligible) {
      setPendingResume('')
      return
    }
    // Still waiting on the feature flag or the wallet restore — both land asynchronously, and giving up on
    // either would leave the buyer holding new credits on a page that has forgotten what they were for.
    if (!namesEnabled || !session) return
    setPendingResume('')
    setModalOpen(true)
  }, [pendingResume, value, status, claimEligible, namesEnabled, session])

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
                      stays glued to it as the example is typed out — down to which weight it is painted
                      in, since the placeholder is lighter than a typed value. */}
                  <S.Sizer ref={sizerRef} aria-hidden data-placeholder={!value || undefined}>
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

              {/* Floated like the banner above, so the hero keeps its height as these come and go. All one
                  chain because they share the slot — two of these at once would stack on top of each other. */}
              {status === 'checking' ? (
                <S.StatusFloating tone="muted" role="status" data-testid="names-checking">
                  {t('names.checking')}
                </S.StatusFloating>
              ) : registrationClosed ? (
                /* Placed ahead of the error branch so it wins the slot: once registration is closed, a
                   failed availability probe is beside the point — the user cannot buy either way, and this
                   is the message that gives them somewhere to go. */
                <S.StatusFloating tone="muted" role="status" data-testid="names-disabled">
                  <Icon name="info" size={16} aria-hidden />
                  <span>{t('names.registrationDisabled')}</span>
                  <S.NoticeLink href={legacyNamesUrl(value)} target="_blank" rel="noopener noreferrer">
                    {t('names.registrationDisabledLink')}
                    <Icon name="external-link" size={13} aria-hidden />
                  </S.NoticeLink>
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
