import { describe, it, expect, afterEach } from 'vitest'
import { launchApp, type App } from './helpers/app'
import { clickByText, clickWhenEnabled, waitForText } from './helpers/dom'
import { COLLECTION, buyTrade, creditsResponse } from './fixtures'

let app: App | undefined
afterEach(async () => {
  await app?.close()
  app = undefined
})

// The buy fixture is priced $13.50 (135 credits) and the mocked oracle reports ~$0.2696/MANA, so the
// item costs ≈50.07 MANA. These amounts sit either side of that.
const MANA = (whole: number) => (BigInt(whole) * 10n ** 18n).toString()
const PLENTY_OF_MANA = MANA(1000) // covers the whole price on its own
const SOME_MANA = MANA(40) // covers a remainder, NOT the full ≈50 MANA price
const DUST_MANA = MANA(1) // holds MANA but not enough for any rail

// Credit balances: the default fixture has 500 credits (covers the 135-credit item).
const credits = (balanceCents: number) => ({
  ...creditsResponse,
  usd: { balanceCents, credits: Math.floor(balanceCents / 10) }
})
const PARTIAL_CREDITS = credits(400) // 40 credits — short of 135
const NO_CREDITS = credits(0)

const ITEM_PATH = `/item/${COLLECTION}/1`
const has = (page: App['page'], testId: string) => page.$(`[data-testid="${testId}"]`).then(el => !!el)

describe('paying with MANA in the buy flow', () => {
  it('changes nothing when the wallet holds no MANA: no navbar chip, no payment step', async () => {
    app = await launchApp({ path: ITEM_PATH, fixtures: { trade: buyTrade } })
    const { page } = app

    await waitForText(page, 'Nebula Jacket')
    expect(await has(page, 'subnav-mana-balance')).toBe(false)

    await clickWhenEnabled(page, 'button', /buy now/i)
    await waitForText(page, 'Buy Asset')
    // The conventional single-CTA modal, not the method picker.
    await clickWhenEnabled(page, 'button', /^buy$/i)
    await waitForText(page, 'Purchase complete!', 30000)
  })

  it('shows the MANA balance in the navbar when the wallet holds MANA', async () => {
    app = await launchApp({ path: ITEM_PATH, fixtures: { trade: buyTrade }, manaBalanceWei: PLENTY_OF_MANA })
    const { page } = app

    await page.waitForSelector('[data-testid="subnav-mana-balance"]', { timeout: 20000 })
    const chip = await page.$eval('[data-testid="subnav-mana-balance"]', el => el.textContent ?? '')
    expect(chip).toContain('1,000')
  })

  it('offers credits AND mana when either balance covers the price, and completes with credits', async () => {
    app = await launchApp({ path: ITEM_PATH, fixtures: { trade: buyTrade }, manaBalanceWei: PLENTY_OF_MANA })
    const { page } = app

    await waitForText(page, 'Nebula Jacket')
    await clickWhenEnabled(page, 'button', /buy now/i)

    // The method picker replaces the plain confirm view.
    await page.waitForSelector('[data-testid="pay-with-credits"]', { timeout: 20000 })
    expect(await has(page, 'pay-with-mana')).toBe(true)
    // Credits alone cover it, so the mixed rail is pointless and must NOT be offered.
    expect(await has(page, 'pay-with-combined')).toBe(false)
    // Credits is the pre-selected default.
    expect(await page.$eval('[data-testid="pay-with-credits"]', el => el.getAttribute('aria-checked'))).toBe('true')

    await clickWhenEnabled(page, '[data-testid="pay-confirm"]', /.*/)
    await waitForText(page, 'Purchase complete!', 30000)
  })

  it('completes a MANA-only purchase when the buyer picks the MANA rail', async () => {
    app = await launchApp({ path: ITEM_PATH, fixtures: { trade: buyTrade }, manaBalanceWei: PLENTY_OF_MANA })
    const { page } = app

    await waitForText(page, 'Nebula Jacket')
    await clickWhenEnabled(page, 'button', /buy now/i)
    await page.waitForSelector('[data-testid="pay-with-mana"]', { timeout: 20000 })

    expect(await clickByText(page, '[data-testid="pay-with-mana"]', /.*/)).toBe(true)
    expect(await page.$eval('[data-testid="pay-with-mana"]', el => el.getAttribute('aria-checked'))).toBe('true')

    await clickWhenEnabled(page, '[data-testid="pay-confirm"]', /.*/)
    await waitForText(page, 'Purchase complete!', 30000)
  })

  it('offers the combined rail when the credits fall short, and completes credits + MANA', async () => {
    app = await launchApp({
      path: ITEM_PATH,
      fixtures: { trade: buyTrade, credits: PARTIAL_CREDITS },
      manaBalanceWei: SOME_MANA
    })
    const { page } = app

    await waitForText(page, 'Nebula Jacket')
    await clickWhenEnabled(page, 'button', /buy now/i)

    // Short on credits used to be a dead end (top-up pack picker); with MANA in the wallet it becomes a
    // payable purchase: credits first + MANA for the remainder.
    await page.waitForSelector('[data-testid="pay-with-combined"]', { timeout: 20000 })
    expect(await page.$eval('[data-testid="pay-with-combined"]', el => el.getAttribute('aria-checked'))).toBe('true')
    // 40 MANA covers the ≈10 MANA remainder but not the ≈50 MANA full price → no MANA-only row.
    expect(await has(page, 'pay-with-mana')).toBe(false)
    // The row shows both legs of the split: 40 credits + the MANA remainder.
    const row = await page.$eval('[data-testid="pay-with-combined"]', el => el.textContent ?? '')
    expect(row).toContain('40')

    await clickWhenEnabled(page, '[data-testid="pay-confirm"]', /.*/)
    await waitForText(page, 'Purchase complete!', 30000)
  })

  it('offers only the MANA rail when the buyer holds no credits at all', async () => {
    app = await launchApp({
      path: ITEM_PATH,
      fixtures: { trade: buyTrade, credits: NO_CREDITS },
      manaBalanceWei: PLENTY_OF_MANA
    })
    const { page } = app

    await waitForText(page, 'Nebula Jacket')
    await clickWhenEnabled(page, 'button', /buy now/i)

    await page.waitForSelector('[data-testid="pay-with-mana"]', { timeout: 20000 })
    expect(await has(page, 'pay-with-credits')).toBe(false)
    expect(await has(page, 'pay-with-combined')).toBe(false)

    await clickWhenEnabled(page, '[data-testid="pay-confirm"]', /.*/)
    await waitForText(page, 'Purchase complete!', 30000)
  })

  it('keeps the top-up pack picker when the MANA held is too small for any rail', async () => {
    app = await launchApp({
      path: ITEM_PATH,
      fixtures: { trade: buyTrade, credits: PARTIAL_CREDITS },
      manaBalanceWei: DUST_MANA
    })
    const { page } = app

    await waitForText(page, 'Nebula Jacket')
    await clickWhenEnabled(page, 'button', /buy now/i)

    // No rail is payable → the conventional short-on-credits flow, never a MANA row.
    await waitForText(page, 'Buy Credits')
    expect(await has(page, 'pay-with-mana')).toBe(false)
    expect(await has(page, 'pay-with-combined')).toBe(false)
  })
})
