import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect, afterEach } from 'vitest'
import { parse, TYPE, type MessageFormatElement } from '@formatjs/icu-messageformat-parser'
import { t, setActiveLocale, MESSAGES, LOCALES } from './i18n'

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
  it.each(LOCALES.filter(l => l !== 'en'))('has the same key set as en in %s', locale => {
    const missing = Object.keys(MESSAGES.en).filter(k => !(k in MESSAGES[locale]))
    const extra = Object.keys(MESSAGES[locale]).filter(k => !(k in MESSAGES.en))
    expect(missing, `keys missing in ${locale}: ${missing.join(', ')}`).toEqual([])
    expect(extra, `keys only in ${locale}: ${extra.join(', ')}`).toEqual([])
  })

  // A translation may leave out a value the sentence reads fine without, but must not ask for one the
  // code never passes (it renders the raw `{name}`), and must keep every tag: `tNode` hangs an element
  // on each one, and a dropped tag silently loses it.
  it.each(LOCALES.filter(l => l !== 'en'))('asks only for values and tags en provides in %s', locale => {
    const broken = Object.entries(MESSAGES.en)
      .filter(([k]) => k in MESSAGES[locale])
      .filter(([k, m]) => {
        const source = argumentsOf(m)
        const target = argumentsOf(MESSAGES[locale][k])
        const tags = (set: Set<string>) =>
          [...set]
            .filter(n => n.startsWith('<'))
            .sort()
            .join()
        return [...target].some(n => !source.has(n)) || tags(source) !== tags(target)
      })
      .map(([k]) => k)
    expect(broken).toEqual([])
  })
})

function argumentsOf(message: string): Set<string> {
  const names = new Set<string>()
  const walk = (nodes: MessageFormatElement[]) => {
    for (const node of nodes) {
      if (node.type === TYPE.tag) {
        names.add(`<${node.value}>`)
        walk(node.children)
      } else if (node.type !== TYPE.literal && 'value' in node && typeof node.value === 'string') {
        names.add(node.value)
      }
      if (node.type === TYPE.plural || node.type === TYPE.select) {
        for (const option of Object.values(node.options)) walk(option.value)
      }
    }
  }
  walk(parse(message))
  return names
}

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
    ['rede (network)', /\b(a|uma|da|na) rede\b/i],
    ['Netzwerk', /\bnetzwerk\w*/i],
    ['wallet', /\bwallets?\b/i],
    ['carteira', /\bcarteiras?\b/i],
    ['Geldbörse', /\b(geldbörse|brieftasche)\w*/i],
    ['MetaMask', /\bmetamask\b/i],
    ['gas', /\bgas\b/i],
    ['gás', /(^|[^\p{L}])gás($|[^\p{L}])/iu],
    ['Gasgebühr', /\bgas(gebühr|kosten)\w*/i],
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
   *
   * FIVE deliberate exceptions have been granted since, all on Juanma's call, all in the creator's own
   * surfaces:
   *
   * `filter.priceMana`, the My Creations price filter. It names the same thing the pricing banner above it
   * already names to the same person — a creator who is paid in MANA and has to find the listings still
   * priced in it — and "Classic pricing" alone made them guess which of the two labels meant the same thing.
   *
   * `creatorSale.reviewClassicWhy`, the tooltip on a discount review row the discount cannot reach. It has to
   * answer "why is this one excluded", and the answer IS the pricing rail: the item is quoted in MANA, so
   * there is no fixed credit price for a percentage to come off. Saying it any other way would leave the
   * creator without the one fact that explains the exclusion.
   *
   * `creatorSale.blockedBody`, shown when a collection's listings are ALL priced in MANA and a discount
   * therefore has nothing to re-price. The whole message exists to name that currency: the creator opened
   * this to run a discount and the answer is which rail their listings are on.
   *
   * `myStore.manaUnit`, in the creator's store dashboard. It labels the earnings figure, and creators ARE
   * paid in MANA — calling that total anything else would misreport what they were paid.
   *
   * `currency.polygonMana`, the tooltip on the MANA mark. It never introduces the word anywhere new: the
   * mark only appears beside an amount ALREADY denominated in MANA, and what it answers is which mana —
   * a buyer holding Ethereum MANA cannot spend it here, and the glyph alone does not say so.
   *
   * Note none of these sections is creator-only: any signed-in account can open My Creations and find it empty.
   * Grant exceptions the same way if it happens again — named, reasoned, and attributed — rather than
   * quietly widening the list.
   */
  const BASELINE = new Set([
    'activity.paidWithMana',
    'activity.polygonMana',
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
    'creatorSale.blockedBody',
    'creatorSale.reviewClassicWhy',
    'errors.walletUnauthorized',
    'errors.wrongNetwork',
    'faq.sellers.mustSwitchA',
    'faq.sellers.receiveCreditsA',
    'faq.sellers.suggestedPriceA',
    'faq.sellers.whyCreditsA',
    'faq.sellers.whyCreditsQ',
    'filter.priceMana',
    'getCredits.errorSignInAfterPay',
    'importListings.lede',
    'importListings.wasMana',
    'itemDetail.cancelRelayFailed',
    'itemDetail.cancelRelayReverted',
    'itemDetail.cancelSlow',
    'manaPricingBanner.lead',
    'migrate.phaseConfirmingCancel',
    'currency.polygonMana',
    'myStore.manaUnit',
    'network.confirmInWallet',
    'network.current',
    'network.title',
    'newPricing.infoBody'
  ])

  /**
   * Scan what the BUYER reads, not what the developer wrote. `{network}` is the name of an interpolation
   * slot — the reader only ever sees the value substituted into it ("Switch to Polygon and retry"), so
   * flagging the slot is a false positive that would push clean copy onto the baseline and blunt the rule.
   *
   * A value CAN carry jargon, but no static scan can see it; that is the reviewer's job, not this test's.
   */
  const visibleCopy = (message: string) => message.replace(/\{[^}]*\}/g, ' ')

  function offencesIn(locale: (typeof LOCALES)[number]): Map<string, string> {
    const found = new Map<string, string>()
    for (const [key, message] of Object.entries(MESSAGES[locale])) {
      for (const [label, pattern] of BANNED) {
        if (pattern.test(visibleCopy(message))) found.set(key, `"${message}" (banned: ${label})`)
      }
    }
    return found
  }

  it.each(LOCALES)('has no NEW banned web3 jargon in %s copy', locale => {
    const fresh = [...offencesIn(locale)].filter(([key]) => !BASELINE.has(key)).map(([k, v]) => `${k} → ${v}`)

    expect(fresh).toEqual([])
  })

  // Without this the baseline rots: a string someone cleans up would stay whitelisted forever, and the
  // next violation on that key would sail through.
  it('has no stale baseline entries', () => {
    const offending = new Set(LOCALES.flatMap(locale => [...offencesIn(locale).keys()]))
    const stale = [...BASELINE].filter(key => !offending.has(key))

    expect(stale).toEqual([])
  })
})

/**
 * A key that does not exist renders as the key ITSELF — `t()` falls back to the id rather than throwing,
 * so a typo ships as a tooltip reading `itemDetail.browseByRarity` and nothing catches it: types cannot,
 * because the argument is a plain string, and the parity test above only compares the catalogs to each
 * other. Three such keys were live on the item detail page, all pointing at `itemDetail.*` for strings
 * that live under `filter.*`.
 */
describe('every key the code asks for', () => {
  // `i18n.ts` documents the API with illustrative ids ('a.b.c') that are deliberately not real.
  const SELF = 'src/intl/i18n.ts'

  function sourceFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) return sourceFiles(full)
      return /\.tsx?$/.test(entry.name) && !/\.spec\./.test(entry.name) && full !== SELF ? [full] : []
    })
  }

  it('exists in the catalog', () => {
    const missing: string[] = []
    for (const file of sourceFiles('src')) {
      for (const [, key] of readFileSync(file, 'utf8').matchAll(/\bt\(\s*'([a-zA-Z0-9_.]+)'/g)) {
        if (!(key in MESSAGES.en)) missing.push(`${file} → ${key}`)
      }
    }

    expect(missing).toEqual([])
  })
})
