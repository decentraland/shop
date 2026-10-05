import { describe, it, expect, afterEach } from 'vitest'
import { launchApp, type App } from './helpers/app'
import { clickWhenEnabled, waitForText } from './helpers/dom'
import { creditsResponse } from './fixtures'

let app: App | undefined
afterEach(async () => {
  await app?.close()
  app = undefined
})

const MANA = (n: number) => (BigInt(n) * 10n ** 18n).toString()
const NAME_INPUT = '[aria-label="Search for a NAME"]'
// 30 credits against a ~270-credit NAME: credits alone cannot pay, so the MANA rails are the point.
const SHORT = { ...creditsResponse, usd: { balanceCents: 300, credits: 30 } }
// No credits at all: the buyer the MANA-alone rail exists for.
const BROKE = { ...creditsResponse, usd: { balanceCents: 0, credits: 0 } }
// Where the wallet sends the approval and the bridge: Amoy MANA, and the router the mocked route names.
const AMOY_MANA = '0x7ad72b9f944ea9793cf4055d88f81138cc2c63a0'
const SQUID_ROUTER = '0xce16f69375520ab01377ce7b88f5ba8c48f8d666'
const APPROVE = '0x095ea7b3'

async function openMethods(extra: Record<string, unknown>, viewport = { width: 1280, height: 950 }) {
  app = await launchApp({ path: '/items?category=names', names: true, fixtures: { credits: SHORT }, ...extra } as never)
  const { page } = app
  await page.setViewport(viewport)
  await waitForText(page, 'Get your unique NAME!')
  await page.waitForSelector(NAME_INPUT)
  await page.type(NAME_INPUT, 'pepitox')
  await clickWhenEnabled(page, 'button', /claim name/i)
  await page.waitForSelector('[data-testid="pay-with-credits"]', { timeout: 20000 })
  return page
}

/**
 * A NAME costs a fixed 100 MANA, so a buyer holding Polygon MANA can pay part of it (mixed with credits, gasless)
 * or all of it — the marketplace's own cross-chain route, which the buyer's wallet sends. The choice comes BEFORE the NAME is confirmed: "can I afford this,
 * and how" is the question the re-entry gate assumes has already been answered.
 */
describe('paying for a NAME with MANA', () => {
  it('offers the rails instead of selling credit packs to a buyer who holds MANA', async () => {
    const page = await openMethods({ manaBalanceWei: MANA(500) })

    // Short on credits, but not stuck — so the top-up screen is not what they are shown.
    expect(await page.$('[data-testid="credit-packs"]')).toBeNull()
    expect(await page.$('[data-testid="pay-with-mana"]')).not.toBeNull()
  })

  // Every row, its balance and the confirm button have to fit a phone without a sideways scroll.
  it('stacks the rails inside a phone viewport', async () => {
    const page = await openMethods({ manaBalanceWei: MANA(500) }, { width: 390, height: 844 })

    const shape = await page.evaluate(() => {
      const box = (sel: string) => {
        const r = document.querySelector(sel)!.getBoundingClientRect()
        return { top: Math.round(r.top), bottom: Math.round(r.bottom), right: Math.round(r.right) }
      }
      return {
        credits: box('[data-testid="pay-with-credits"]'),
        mana: box('[data-testid="pay-with-mana"]'),
        cta: box('[data-testid="confirm-payment"]'),
        innerWidth: window.innerWidth,
        docWidth: document.documentElement.scrollWidth
      }
    })

    // Stacked, in order, and nothing spills sideways.
    expect(shape.mana.top).toBeGreaterThanOrEqual(shape.credits.bottom)
    expect(shape.cta.top).toBeGreaterThanOrEqual(shape.mana.bottom)
    expect(shape.credits.right).toBeLessThanOrEqual(shape.innerWidth)
    expect(shape.docWidth).toBeLessThanOrEqual(shape.innerWidth)
  })

  /**
   * Holding several times the price and no credits used to land on the pack picker, which asked the buyer to
   * spend $29.99 on credits they did not need. They pay in MANA instead, through the route the marketplace
   * uses: the real Squid SDK, against a mocked router API, sent by the buyer's own wallet.
   */
  describe('and the buyer has no credits at all', () => {
    // Enough of Polygon's native token to pay the route's fee, unless a case says otherwise.
    const FEE_MONEY = (2n * 10n ** 18n).toString()

    async function chooseMana(extra: Record<string, unknown> = {}) {
      const page = await openMethods({
        manaBalanceWei: MANA(1386),
        nativeBalanceWei: FEE_MONEY,
        fixtures: { credits: BROKE },
        ...extra
      })
      await clickWhenEnabled(page, '[data-testid="confirm-payment"]', /./)
      await page.waitForSelector('[aria-label="Re-enter the NAME to confirm"]')
      await page.type('[aria-label="Re-enter the NAME to confirm"]', 'pepitox')
      return page
    }
    const priceShown = (page: Awaited<ReturnType<typeof chooseMana>>) =>
      page.$eval('[data-testid="name-charged-price"]', el => el.textContent ?? '')
    const sentTxs = (page: Awaited<ReturnType<typeof chooseMana>>) =>
      page.evaluate(() => (window as unknown as { __sentTxs: { to?: string; data?: string }[] }).__sentTxs)

    it('offers to pay the whole NAME in MANA instead of selling credit packs', async () => {
      const page = await openMethods({
        manaBalanceWei: MANA(1386),
        nativeBalanceWei: FEE_MONEY,
        fixtures: { credits: BROKE }
      })

      const rows = await page.evaluate(() => ({
        packs: !!document.querySelector('[data-testid="credit-packs"]'),
        mana: document.querySelector('[data-testid="pay-with-mana"]')?.getAttribute('data-selected'),
        credits: document.querySelector('[data-testid="pay-with-credits"]')?.getAttribute('data-disabled')
      }))
      expect(rows).toEqual({ packs: false, mana: 'true', credits: 'true' })
    })

    // Priced before it is chosen, so the step itself states what the route takes rather than the NAME's 100.
    it('shows the route’s amount on the MANA row of the method step', async () => {
      const page = await openMethods({
        manaBalanceWei: MANA(1386),
        nativeBalanceWei: FEE_MONEY,
        fixtures: { credits: BROKE }
      })

      await page.waitForFunction(
        () => /101\.5/.test(document.querySelector('[data-testid="pay-with-mana"]')?.textContent ?? ''),
        { timeout: 20000 }
      )
    })

    it('states the processing fee before the buyer agrees', async () => {
      const page = await chooseMana()

      await page.waitForSelector('[data-testid="name-mana-fee"]', { timeout: 20000 })
      expect(await page.$eval('[data-testid="name-mana-fee"]', el => el.textContent ?? '')).toMatch(/\$\d/)
    })

    // The router turns away a quick second quote for the same address, and the library asks again at once.
    it('still prices the route when the router asks it to slow down', async () => {
      const page = await chooseMana({ squidRateLimitedQuotes: 2 })

      await page.waitForSelector('[data-testid="name-mana-fee"]', { timeout: 20000 })
      expect(await page.$('[data-testid="credit-packs"]')).toBeNull()
    })

    // 100 MANA delivered on Ethereum, plus the margin the router needs to guarantee it: what leaves the wallet.
    it('shows the amount the route will take before anything is bought', async () => {
      const page = await chooseMana()

      await page.waitForFunction(
        () => /101\.5/.test(document.querySelector('[data-testid="name-charged-price"]')?.textContent ?? ''),
        { timeout: 20000 }
      )
      expect(await priceShown(page)).toContain('101.5')
    })

    it('registers the NAME through the route, from the buyer’s wallet, without reserving a credit', async () => {
      const page = await chooseMana()
      await clickWhenEnabled(page, 'button', /buy name/i, 20000)
      await waitForText(page, 'Purchase complete!', 30000)

      const sent = await sentTxs(page)
      expect({
        reserved: app!.posts.includes('/credits/authorize'),
        routed: app!.posts.includes('/v2/route'),
        sentTo: sent.map(tx => tx.to?.toLowerCase())
      }).toEqual({ reserved: false, routed: true, sentTo: [SQUID_ROUTER] })
    })

    // A wallet that never let the router move its MANA: the approval goes first, then the bridge.
    it('approves the router before sending the bridge', async () => {
      const page = await chooseMana({ manaAllowanceWei: '0' })
      await clickWhenEnabled(page, 'button', /buy name/i, 20000)
      await waitForText(page, 'Purchase complete!', 30000)

      const sent = await sentTxs(page)
      expect({
        approve: sent[0]?.to?.toLowerCase() === AMOY_MANA && sent[0]?.data?.startsWith(APPROVE),
        thenBridge: sent[1]?.to?.toLowerCase()
      }).toEqual({ approve: true, thenBridge: SQUID_ROUTER })
    })

    // A rail that cannot work goes away instead of leading to a dead button: back to buying credits.
    it('falls back to selling credit packs when the balance cannot cover the route’s fee', async () => {
      app = await launchApp({
        path: '/items?category=names',
        names: true,
        manaBalanceWei: MANA(1386),
        nativeBalanceWei: '0',
        fixtures: { credits: BROKE }
      } as never)
      const { page } = app
      await waitForText(page, 'Get your unique NAME!')
      await page.waitForSelector(NAME_INPUT)
      await page.type(NAME_INPUT, 'pepitox')
      await clickWhenEnabled(page, 'button', /claim name/i)

      await page.waitForSelector('[data-testid="credit-packs"]', { timeout: 20000 })
      expect(await page.$('[data-testid="pay-with-mana"]')).toBeNull()
    })

    it('says the payment was returned when the bridge refunds it', async () => {
      const page = await chooseMana({ squidStatus: 'refunded' })
      await clickWhenEnabled(page, 'button', /buy name/i, 20000)

      await waitForText(page, 'your payment was returned', 30000)
    })
  })
})
