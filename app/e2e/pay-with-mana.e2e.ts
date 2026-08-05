import { describe, it, expect, afterEach } from 'vitest'
import { launchApp, type App } from './helpers/app'
import { bodyText, clickByText, clickWhenEnabled, waitForText } from './helpers/dom'
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
// The MANA balance now renders as a ui2 navbar chip (no testid); its aria-label is the stable hook.
const MANA_CHIP = 'button[aria-label$="MANA on Polygon"]'
const ETHEREUM_MANA_CHIP = 'button[aria-label$="MANA on Ethereum"]'

// The Buy Now picker is SELECT-then-confirm (Figma 1654-371913): rows are checkboxes and one BUY submits.
// Ticking both rows is how a mixed credits + MANA payment is expressed, so there is no "combined" row.
const isTicked = (page: App['page'], rail: 'credits' | 'mana') =>
  page.$eval(`[data-testid="pay-with-${rail}"]`, el => el.getAttribute('data-selected') === 'true')
const tick = async (page: App['page'], rail: 'credits' | 'mana', on: boolean) => {
  if ((await isTicked(page, rail)) !== on) await clickWhenEnabled(page, `[data-testid="pay-with-${rail}"]`, /.*/)
  expect(await isTicked(page, rail)).toBe(on)
}
const confirmPayment = (page: App['page']) => clickWhenEnabled(page, '[data-testid="confirm-payment"]', /.*/)

describe('paying with MANA in the buy flow', () => {
  it('changes nothing when the wallet holds no MANA: no navbar chip, no payment step', async () => {
    app = await launchApp({ path: ITEM_PATH, fixtures: { trade: buyTrade } })
    const { page } = app

    await waitForText(page, 'Nebula Jacket')
    expect(await page.$(MANA_CHIP).then(el => !!el)).toBe(false)

    await clickWhenEnabled(page, 'button', /buy now/i)
    await waitForText(page, 'Buy Item')
    // The conventional single-CTA modal, not the method picker.
    await clickWhenEnabled(page, 'button', /^buy$/i)
    await waitForText(page, 'Purchase complete!', 30000)
  })

  it('shows the MANA balance in the navbar when the wallet holds MANA', async () => {
    app = await launchApp({ path: ITEM_PATH, fixtures: { trade: buyTrade }, manaBalanceWei: PLENTY_OF_MANA })
    const { page } = app

    await page.waitForSelector(MANA_CHIP, { timeout: 20000 })
    const chip = await page.$eval(MANA_CHIP, el => el.textContent ?? '')
    expect(chip).toContain('1,000')
  })

  describe('and the wallet also holds MANA on Ethereum', () => {
    it('should show a chip per chain, so an L1 balance is not hidden by the connected network', async () => {
      // The bug this guards: the balance used to be read over the shop's Polygon RPC no matter which
      // chain it belonged to, so L1 MANA resolved against a non-MANA address and reported nothing.
      app = await launchApp({
        path: ITEM_PATH,
        fixtures: { trade: buyTrade },
        manaBalanceWei: PLENTY_OF_MANA,
        ethereumManaBalanceWei: SOME_MANA
      })
      const { page } = app

      await page.waitForSelector(MANA_CHIP, { timeout: 20000 })
      await page.waitForSelector(ETHEREUM_MANA_CHIP, { timeout: 20000 })
      expect(await page.$eval(MANA_CHIP, el => el.textContent ?? '')).toContain('1,000')
      expect(await page.$eval(ETHEREUM_MANA_CHIP, el => el.textContent ?? '')).toContain('40')
    })

    it('should not offer L1 MANA as a payment rail, since a Polygon trade cannot settle with it', async () => {
      app = await launchApp({
        path: ITEM_PATH,
        fixtures: { trade: buyTrade },
        ethereumManaBalanceWei: PLENTY_OF_MANA // L1 only — nothing spendable on Polygon
      })
      const { page } = app

      await page.waitForSelector(ETHEREUM_MANA_CHIP, { timeout: 20000 })
      expect(await page.$(MANA_CHIP).then(el => !!el)).toBe(false)

      await clickWhenEnabled(page, 'button', /buy now/i)
      await waitForText(page, 'Buy Item')
      // The plain single-CTA modal: no MANA rail, exactly as when the wallet holds no MANA at all.
      expect(await has(page, 'pay-with-mana')).toBe(false)
    })
  })

  it('offers credits AND mana when either balance covers the price, and completes with credits', async () => {
    app = await launchApp({ path: ITEM_PATH, fixtures: { trade: buyTrade }, manaBalanceWei: PLENTY_OF_MANA })
    const { page } = app

    await waitForText(page, 'Nebula Jacket')
    await clickWhenEnabled(page, 'button', /buy now/i)

    // The method picker replaces the plain confirm view: both rails get a row.
    await page.waitForSelector('[data-testid="pay-with-credits"]', { timeout: 20000 })
    expect(await has(page, 'pay-with-mana')).toBe(true)
    // Credits cover it alone, so that is what comes preselected.
    expect(await isTicked(page, 'credits')).toBe(true)
    expect(await isTicked(page, 'mana')).toBe(false)
    await confirmPayment(page)
    await waitForText(page, 'Purchase complete!', 30000)
  })

  it('completes a MANA-only purchase when the buyer picks the MANA rail', async () => {
    app = await launchApp({ path: ITEM_PATH, fixtures: { trade: buyTrade }, manaBalanceWei: PLENTY_OF_MANA })
    const { page } = app

    await waitForText(page, 'Nebula Jacket')
    await clickWhenEnabled(page, 'button', /buy now/i)
    await page.waitForSelector('[data-testid="pay-with-mana"]', { timeout: 20000 })

    // Swap the selection over to MANA only, then confirm.
    await tick(page, 'credits', false)
    await tick(page, 'mana', true)
    await confirmPayment(page)
    await waitForText(page, 'Purchase complete!', 30000)
  })

  it('pays with credits AND MANA when both rows are ticked, and completes', async () => {
    app = await launchApp({
      path: ITEM_PATH,
      fixtures: { trade: buyTrade, credits: PARTIAL_CREDITS },
      manaBalanceWei: SOME_MANA
    })
    const { page } = app

    await waitForText(page, 'Nebula Jacket')
    await clickWhenEnabled(page, 'button', /buy now/i)

    // Short on credits used to be a dead end (top-up pack picker); with MANA in the wallet it becomes a
    // payable purchase: credits first + MANA for the remainder. Neither rail covers it alone, so BOTH
    // rows come preselected.
    await page.waitForSelector('[data-testid="pay-with-credits"]', { timeout: 20000 })
    expect(await isTicked(page, 'credits')).toBe(true)
    expect(await isTicked(page, 'mana')).toBe(true)
    // Each row states its OWN leg: 40 credits, and the MANA remainder (not the full ≈50 MANA price).
    const creditsRow = await page.$eval('[data-testid="pay-with-credits"]', el => el.textContent ?? '')
    expect(creditsRow).toContain('40')

    await confirmPayment(page)
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
    // The credits row stays on screen (the design keeps both) but cannot be ticked with a zero balance.
    expect(await page.$eval('[data-testid="pay-with-credits"]', el => (el as HTMLButtonElement).disabled)).toBe(true)
    expect(await isTicked(page, 'mana')).toBe(true)

    // MANA is already the only ticked rail — confirm it (clicking the row again would UNtick it).
    await confirmPayment(page)
    await waitForText(page, 'Purchase complete!', 30000)
  })

  it('keeps the top-up pack picker when the MANA held is too small for any rail, and says why', async () => {
    app = await launchApp({
      path: ITEM_PATH,
      fixtures: { trade: buyTrade, credits: PARTIAL_CREDITS },
      manaBalanceWei: DUST_MANA
    })
    const { page } = app

    await waitForText(page, 'Nebula Jacket')
    await clickWhenEnabled(page, 'button', /buy now/i)

    // No rail is payable → the top-up flow stays, and no MANA button is clickable...
    await waitForText(page, 'Buy Credits')
    expect(await has(page, 'pay-with-mana')).toBe(false)
    expect(await has(page, 'pay-with-combined')).toBe(false)
    // ...but the MANA the buyer DOES hold is accounted for on screen, disabled, with its worth in
    // credits. Silently dropping it is what made this state read as broken.
    await page.waitForSelector('[data-testid="pay-with-mana-disabled"]', { timeout: 20000 })
    expect(await page.$eval('[data-testid="pay-with-mana-disabled"]', el => (el as HTMLButtonElement).disabled)).toBe(
      true
    )
    expect(await page.$eval('[data-testid="mana-shortfall-note"]', el => el.textContent ?? '')).toMatch(
      /worth about [\d.,]+ credits/i
    )
    // The pack picker is still the way forward.
    expect(await has(page, 'credit-packs')).toBe(true)
  })
})

describe('paying with MANA in the cart checkout', () => {
  // Seed the cart the way a buyer does: add from the PDP, then open the cart. The rails live in the
  // Purchase Summary panel itself (Figma 1558-320257), so there is no intermediate "buy now" step —
  // reaching the cart page IS reaching the checkout.
  const goToCart = async (page: App['page']) => {
    await waitForText(page, 'Nebula Jacket')
    expect(await clickByText(page, 'button', /add to cart/i)).toBe(true)
    await waitForText(page, 'successfully added to cart')
    expect(await clickByText(page, 'a', /go to cart/i)).toBe(true)
    await waitForText(page, 'Purchase Summary')
  }

  it('keeps the credits-only checkout when the wallet holds no MANA', async () => {
    app = await launchApp({ path: ITEM_PATH, fixtures: { trade: buyTrade } })
    const { page } = app
    await goToCart(page)

    // Only the credits CTA — no MANA button.
    await page.waitForSelector('[data-testid="pay-with-credits"]', { timeout: 20000 })
    expect(await has(page, 'pay-with-mana')).toBe(false)
    expect(await has(page, 'pay-with-mana-disabled')).toBe(false)

    expect(await clickByText(page, '[data-testid="pay-with-credits"]', /.*/)).toBe(true)
    await page.waitForFunction(() => window.location.pathname === '/success', { timeout: 30000 })
  })

  it('offers the rails in the summary panel and completes a MANA-only basket', async () => {
    app = await launchApp({ path: ITEM_PATH, fixtures: { trade: buyTrade }, manaBalanceWei: PLENTY_OF_MANA })
    const { page } = app
    await goToCart(page)

    await page.waitForSelector('[data-testid="pay-with-mana"]', { timeout: 20000 })
    // Credits cover the basket too, so both single rails are offered (no mixed rail needed).
    expect(await has(page, 'pay-with-credits')).toBe(true)
    expect(await has(page, 'pay-with-combined')).toBe(false)
    // The rate note was removed from the summary — a buyer who wants it can work it out from the two totals.
    expect(await has(page, 'cart-mana-rate')).toBe(false)

    expect(await clickByText(page, '[data-testid="pay-with-mana"]', /.*/)).toBe(true)
    await page.waitForFunction(() => window.location.pathname === '/success', { timeout: 30000 })
  })

  it('offers the mixed rail with an explicit split when the credits fall short', async () => {
    app = await launchApp({
      path: ITEM_PATH,
      fixtures: { trade: buyTrade, credits: PARTIAL_CREDITS },
      manaBalanceWei: PLENTY_OF_MANA
    })
    const { page } = app
    await goToCart(page)

    await page.waitForSelector('[data-testid="pay-with-combined"]', { timeout: 20000 })
    // The button states both legs: the credits it spends and the MANA covering the remainder.
    const row = await page.$eval('[data-testid="pay-with-combined"]', el => el.textContent ?? '')
    expect(row).toMatch(/MANA/)
    expect(row).toContain('40')

    expect(await clickByText(page, '[data-testid="pay-with-combined"]', /.*/)).toBe(true)
    await page.waitForFunction(() => window.location.pathname === '/success', { timeout: 30000 })
  })

  it('shows the MANA rail disabled, with what the balance is worth, when the MANA cannot pay', async () => {
    // 1 MANA against a $13.50 basket: no MANA rail is payable, but the buyer HOLDS MANA — so the button
    // renders disabled with its worth in credits instead of silently vanishing.
    app = await launchApp({ path: ITEM_PATH, fixtures: { trade: buyTrade }, manaBalanceWei: DUST_MANA })
    const { page } = app
    await goToCart(page)

    await page.waitForSelector('[data-testid="pay-with-mana-disabled"]', { timeout: 20000 })
    expect(await has(page, 'pay-with-mana')).toBe(false)
    expect(await has(page, 'pay-with-combined')).toBe(false)
    expect(await page.$eval('[data-testid="pay-with-mana-disabled"]', el => (el as HTMLButtonElement).disabled)).toBe(
      true
    )
    // The caption converts the balance to credits — that number IS the explanation.
    expect(await page.$eval('[data-testid="mana-shortfall-note"]', el => el.textContent ?? '')).toMatch(
      /worth about [\d.,]+ credits/i
    )
    // Credits still cover it, so the purchase is not blocked.
    expect(await has(page, 'pay-with-credits')).toBe(true)
  })
})

describe('approving the MANA spend', () => {
  // A self-custody wallet with no allowance yet. Paying in MANA needs the buyer's permission to move it,
  // and that permission is a SEPARATE wallet prompt — so it gets explained first (the same approval step
  // the sell and top-up flows use) instead of arriving unannounced next to the purchase prompt.
  it('explains the approval before the purchase, then completes once granted', async () => {
    app = await launchApp({
      path: ITEM_PATH,
      fixtures: { trade: buyTrade },
      manaBalanceWei: PLENTY_OF_MANA,
      manaAllowanceWei: '0'
    })
    const { page } = app

    await waitForText(page, 'Nebula Jacket')
    await clickWhenEnabled(page, 'button', /buy now/i)
    await page.waitForSelector('[data-testid="pay-with-mana"]', { timeout: 20000 })
    await tick(page, 'credits', false)
    await tick(page, 'mana', true)
    await confirmPayment(page)

    // The approval step, not the purchase: it names what is being approved and that it happens once.
    await page.waitForSelector('[data-testid="authorize-step-row"]', { timeout: 20000 })
    expect(await bodyText(page)).toMatch(/pay with your mana/i)
    expect(await bodyText(page)).toMatch(/one-time approval/i)

    await clickWhenEnabled(page, '[data-testid="authorize-step-action"]', /.*/)
    await waitForText(page, 'Purchase complete!', 30000)
  })

  it('goes straight to the purchase when the allowance is already granted', async () => {
    app = await launchApp({ path: ITEM_PATH, fixtures: { trade: buyTrade }, manaBalanceWei: PLENTY_OF_MANA })
    const { page } = app

    await waitForText(page, 'Nebula Jacket')
    await clickWhenEnabled(page, 'button', /buy now/i)
    await page.waitForSelector('[data-testid="pay-with-mana"]', { timeout: 20000 })
    await tick(page, 'credits', false)
    await tick(page, 'mana', true)
    await confirmPayment(page)

    // No approval step in the way — the buyer already granted it.
    await waitForText(page, 'Purchase complete!', 30000)
    expect(await has(page, 'authorize-step-row')).toBe(false)
  })
})
