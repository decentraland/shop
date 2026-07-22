import { useEffect, useState } from 'react'
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
import { Icon } from '~/components/Icon'
import { CurrencyIcon } from '~/components/CurrencyIcon'
import { formatCredits } from '~/lib/currency'
import { NameBuyModal } from '~/components/NameBuyModal'
import { t } from '~/intl/i18n'
import * as S from './NamesPage.styles'

// Docs link for the "Learn More" card (Worlds). Public marketing URL — no secrets.
const WORLDS_DOCS_URL = 'https://docs.decentraland.org/creator/worlds/about/'

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
            <S.InputRow>
              <S.InputField>
                <S.At aria-hidden>@</S.At>
                <S.NameInput
                  value={value}
                  onChange={e => setValue(sanitizeNameInput(e.target.value))}
                  placeholder={t('names.inputPlaceholder')}
                  aria-label={t('names.inputAria')}
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={NAME_MAX_LENGTH}
                  style={{ width: `${Math.max(value.length || t('names.inputPlaceholder').length, 1)}ch` }}
                />
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

            <S.ClaimButtonMobile onClick={claim} disabled={!canClaim}>
              {claimBtnContent}
            </S.ClaimButtonMobile>

            {status === 'taken' ? (
              <S.Status tone="error" role="status" data-testid="names-taken">
                <Icon name="info" aria-hidden />
                {t('names.taken')}
              </S.Status>
            ) : status === 'checking' ? (
              <S.Status tone="muted" role="status" data-testid="names-checking">
                {t('names.checking')}
              </S.Status>
            ) : status === 'error' ? (
              <S.Status tone="muted" role="status">
                {t('names.checkError')}
              </S.Status>
            ) : status === 'invalid' && !validation.ok && validation.reason === 'too-short' ? (
              <S.Status tone="muted" role="status">
                {t('names.tooShort', { min: NAME_MIN_LENGTH })}
              </S.Status>
            ) : null}

            {/* Announce availability to assistive tech (Figma signals it only by enabling the button). */}
            <S.SrOnly role="status" aria-live="polite">
              {status === 'available' ? t('names.available', { name: value }) : ''}
            </S.SrOnly>
          </S.SearchBlock>
        </S.Hero>

        <S.Why>
          <S.WhyTitle>{t('names.whyTitle')}</S.WhyTitle>
          <S.Cards>
            <S.Card>
              <S.CardMedia aria-hidden />
              <S.CardInfo>
                <S.CardText>{t('names.why1')}</S.CardText>
              </S.CardInfo>
            </S.Card>
            <S.Card>
              <S.CardMedia aria-hidden />
              <S.CardInfo>
                <S.CardText>{t('names.why2')}</S.CardText>
                <S.CardLink href={WORLDS_DOCS_URL} target="_blank" rel="noopener noreferrer">
                  {t('names.why2Link')}
                  <Icon name="external-link" aria-hidden />
                </S.CardLink>
              </S.CardInfo>
            </S.Card>
            <S.Card>
              <S.CardMedia aria-hidden />
              <S.CardInfo>
                <S.CardText>{t('names.why3')}</S.CardText>
                <S.CardLinkText>{t('names.why3Link')}</S.CardLinkText>
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
