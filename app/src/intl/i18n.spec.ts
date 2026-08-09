import { describe, it, expect, afterEach } from 'vitest'
import { t, setActiveLocale, MESSAGES } from './i18n'

afterEach(() => setActiveLocale('en')) // don't leak locale between tests

describe('i18n', () => {
  it('flattens nested JSON to dot keys', () => {
    expect(MESSAGES.en['nav.collectibles']).toBe('Collectibles')
    expect(MESSAGES.es['nav.collectibles']).toBe('Coleccionables')
  })

  it('t() returns English by default (no provider needed)', () => {
    expect(t('nav.overview')).toBe('Overview')
  })

  it('t() switches with the active locale', () => {
    setActiveLocale('es')
    expect(t('nav.overview')).toBe('Inicio')
  })

  it('interpolates values', () => {
    expect(t('nav.getCredits', { currency: 'credits' })).toBe('Buy credits')
    setActiveLocale('es')
    expect(t('nav.getCredits', { currency: 'créditos' })).toBe('Comprar créditos')
  })

  it('falls back to the key id for a missing message', () => {
    expect(t('does.not.exist')).toBe('does.not.exist')
  })

  // Parity guard: every locale must define exactly the same set of keys, so a string added in one
  // language can never ship missing in another (it would silently fall back to the raw key id).
  it('has identical key sets across all locales (en/es parity)', () => {
    const enKeys = Object.keys(MESSAGES.en).sort()
    const esKeys = Object.keys(MESSAGES.es).sort()
    const missingInEs = enKeys.filter(k => !(k in MESSAGES.es))
    const missingInEn = esKeys.filter(k => !(k in MESSAGES.en))
    expect(missingInEs, `keys missing in es: ${missingInEs.join(', ')}`).toEqual([])
    expect(missingInEn, `keys missing in en: ${missingInEn.join(', ')}`).toEqual([])
  })
})

/**
 * The web2-first rule is a HARD one (CONVENTIONS.md), and until now nothing enforced it — which is
 * exactly how "on the blockchain" and "if the network is busy" reached a shipped tooltip. A documented
 * convention with no check is a convention that gets broken by whoever writes the next string.
 *
 * Scanned per word with boundaries, so "chain" does not fire on "unchained" and Spanish "red" does not
 * fire on "credits"/"redirigir".
 */
describe('web2-first copy rule', () => {
  const BANNED = [
    ['blockchain', /\bblockchains?\b/i],
    ['on-chain', /\bon-?chain\b/i],
    ['chain', /\bchains?\b/i],
    ['network', /\bnetworks?\b/i],
    ['red (network)', /\b(la|una|de la) red\b/i],
    ['wallet', /\bwallets?\b/i],
    ['MetaMask', /\bmetamask\b/i],
    ['gas', /\bgas\b/i],
    ['MANA', /\bMANA\b/],
    ['token', /\btokens?\b/i],
    ['mint', /\bmint(ed|ing)?\b/i],
    ['smart contract', /\bsmart contracts?\b/i]
  ] as const

  /**
   * Debt, not permission. These keys already broke the rule before it was enforced — the bulk of them are
   * the MANA payment rail, which the product genuinely offers, so the convention and the product disagree
   * and that is a call for the team rather than a silent rewrite of 41 user-facing strings.
   *
   * This list may only ever SHRINK. New copy cannot join it: the test below fails for any key outside it,
   * and fails again if a key in it stops offending without being removed.
   */
  const BASELINE = new Set([
    'activity.paidWithMana',
    'activity.polygonMana',
    'authorizations.creditsDesc',
    'authorizations.creditsName',
    'authorizations.manaDesc',
    'authorizations.manaName',
    'authorizations.mintingDesc',
    'authorizations.mintingEmpty',
    'authorizations.mintingTitle',
    'authorizeStep.manaName',
    'authorizeStep.manaReason',
    'authorizeStep.note',
    'buyModal.buyWithMana',
    'buyModal.combinedDetail',
    'buyModal.manaBalanceLabel',
    'buyModal.manaDetail',
    'buyModal.manaPriceUnavailable',
    'buyModal.methodCombined',
    'buyModal.methodMana',
    'buyModal.notEnoughMana',
    'errors.walletUnauthorized',
    'errors.wrongNetwork',
    'faq.sellers.mustSwitchA',
    'faq.sellers.receiveCreditsA',
    'faq.sellers.suggestedPriceA',
    'faq.sellers.whyCreditsA',
    'faq.sellers.whyCreditsQ',
    'getCredits.errorSignInAfterPay',
    'importListings.lede',
    'importListings.wasMana',
    'itemDetail.cancelRelayFailed',
    'itemDetail.cancelRelayReverted',
    'itemDetail.cancelSlow',
    'manaPricingBanner.lead',
    'migrate.phaseConfirmingCancel',
    'network.confirmInWallet',
    'network.current',
    'network.title',
    'newPricing.infoBody'
  ])

  function offencesIn(locale: 'en' | 'es'): Map<string, string> {
    const found = new Map<string, string>()
    for (const [key, message] of Object.entries(MESSAGES[locale])) {
      for (const [label, pattern] of BANNED) {
        if (pattern.test(message)) found.set(key, `"${message}" (banned: ${label})`)
      }
    }
    return found
  }

  it.each(['en', 'es'] as const)('has no NEW banned web3 jargon in %s copy', locale => {
    const fresh = [...offencesIn(locale)].filter(([key]) => !BASELINE.has(key)).map(([k, v]) => `${k} → ${v}`)

    expect(fresh).toEqual([])
  })

  // Without this the baseline rots: a string someone cleans up would stay whitelisted forever, and the
  // next violation on that key would sail through.
  it('has no stale baseline entries', () => {
    const offending = new Set([...offencesIn('en').keys(), ...offencesIn('es').keys()])
    const stale = [...BASELINE].filter(key => !offending.has(key))

    expect(stale).toEqual([])
  })
})
