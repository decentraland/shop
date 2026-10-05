import { describe, expect, it } from 'vitest'

import { parseCampaignVariant } from './campaignVariant'

const ALICE = '0x1111111111111111111111111111111111111111'
const BOB = '0x2222222222222222222222222222222222222222'

describe('parseCampaignVariant', () => {
  it('reads a bare theme name as the theme, for everyone', () => {
    expect(parseCampaignVariant('halloween')).toEqual({ theme: 'halloween', only: null })
  })

  it('restricts the event to the accounts listed after the theme', () => {
    expect(parseCampaignVariant(`halloween:${ALICE},${BOB}`)).toEqual({ theme: 'halloween', only: [ALICE, BOB] })
  })

  it('reads a payload that is only addresses as a restriction with no theme', () => {
    // Every other flag in the app carries a bare address list. A payload typed from that habit must not
    // read as a theme name nobody knows, because that ships the event to everybody.
    expect(parseCampaignVariant(`${ALICE},${BOB}`)).toEqual({ theme: null, only: [ALICE, BOB] })
  })

  it('accepts a list split across lines, as a dashboard field invites', () => {
    expect(parseCampaignVariant(`halloween:${ALICE}\n${BOB}`)).toEqual({ theme: 'halloween', only: [ALICE, BOB] })
  })

  it('lowercases and de-duplicates the accounts, so a checksummed address still matches', () => {
    const checksummed = ALICE.toUpperCase().replace('0X', '0x')
    expect(parseCampaignVariant(`halloween:${checksummed}, ${ALICE}`).only).toEqual([ALICE])
  })

  it('restricts without theming when the theme half is left empty', () => {
    expect(parseCampaignVariant(`:${ALICE}`)).toEqual({ theme: null, only: [ALICE] })
  })

  it('treats a blank half after the colon as no restriction at all', () => {
    expect(parseCampaignVariant('halloween:')).toEqual({ theme: 'halloween', only: null })
    expect(parseCampaignVariant('halloween:   ')).toEqual({ theme: 'halloween', only: null })
  })

  describe('when the restriction was attempted and botched', () => {
    // The direction that matters. Reading an unparseable list as "no list" publishes the event to the whole
    // world and looks exactly like success; restricting it to nobody is visible within a minute.

    it('restricts to nobody when nothing after the colon is an address', () => {
      expect(parseCampaignVariant('halloween:everyone')).toEqual({ theme: 'halloween', only: [] })
    })

    it('restricts to nobody when the only address is truncated', () => {
      expect(parseCampaignVariant('halloween:0x1111')).toEqual({ theme: 'halloween', only: [] })
    })

    it('restricts to nobody when an address was reached for without a colon', () => {
      expect(parseCampaignVariant('halloween 0x1111')).toEqual({ theme: null, only: [] })
    })

    it('restricts to nobody for a list of names that are not addresses at all', () => {
      // Guessing from shape alone misses this one: no `0x`, no separator, nothing that looks like a list.
      expect(parseCampaignVariant('alice.dcl.eth')).toEqual({ theme: null, only: [] })
      expect(parseCampaignVariant('halloween alice.dcl.eth')).toEqual({ theme: null, only: [] })
    })

    it('restricts to nobody for a theme name this build cannot paint', () => {
      // The flip side of the rule above. A payload we cannot act on was a mistake, and the safe reading of
      // a mistake on this flag is "do not publish".
      expect(parseCampaignVariant('halloweeen')).toEqual({ theme: null, only: [] })
      expect(parseCampaignVariant('halloween2026')).toEqual({ theme: null, only: [] })
    })

    it('restricts to nobody when entries are separated by a semicolon', () => {
      // `;` separates ENTRIES in the ?ffv and VITE_ overrides, so it cannot also separate addresses.
      expect(parseCampaignVariant(`halloween:${ALICE};${BOB}`)).toEqual({ theme: 'halloween', only: [] })
    })

    it('still lets a good address through when it is written without the colon', () => {
      expect(parseCampaignVariant(`halloween ${ALICE}`)).toEqual({ theme: null, only: [ALICE] })
    })

    it('drops one bad entry without losing the rest of the list', () => {
      expect(parseCampaignVariant(`halloween:${ALICE},not-an-address,${BOB}`).only).toEqual([ALICE, BOB])
    })
  })

  it('keeps the kill switch working', () => {
    // `none` is how an operator takes the skin off without touching the CMS. It is not a registered theme,
    // so it has to be let through by name or the rule above would restrict the event to nobody.
    expect(parseCampaignVariant('none')).toEqual({ theme: 'none', only: null })
    expect(parseCampaignVariant('None')).toEqual({ theme: 'None', only: null })
  })

  it('forgives the casing of a theme name typed in a dashboard', () => {
    expect(parseCampaignVariant('Halloween')).toEqual({ theme: 'Halloween', only: null })
  })

  it('leaves an unknown theme before the colon as just an unknown theme', () => {
    // With a colon the operator separated the halves themselves, so there is nothing to disambiguate and
    // no reason to treat a misspelling as a failed restriction.
    expect(parseCampaignVariant(`prom:${ALICE}`)).toEqual({ theme: 'prom', only: [ALICE] })
  })

  it('names nothing and restricts nobody for an absent payload', () => {
    expect(parseCampaignVariant(null)).toEqual({ theme: null, only: null })
    expect(parseCampaignVariant('')).toEqual({ theme: null, only: null })
    expect(parseCampaignVariant('   ')).toEqual({ theme: null, only: null })
  })
})
