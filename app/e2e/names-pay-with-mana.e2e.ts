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
 * A NAME costs a fixed 100 MANA, so a buyer holding MANA can pay part of it (Polygon, mixed with credits)
 * or all of it (Ethereum, spending none). The choice comes BEFORE the NAME is confirmed: "can I afford this,
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
})
