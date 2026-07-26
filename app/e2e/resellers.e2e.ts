import { describe, it, expect, afterEach } from 'vitest'
import { launchApp, type App } from './helpers/app'
import { clickWhenEnabled, waitForText } from './helpers/dom'
import { COLLECTION, buyTrade } from './fixtures'

let app: App | undefined
afterEach(async () => {
  await app?.close()
  app = undefined
})

// Open the modal from the detail page. On a phone the CTAs are a fixed bottom bar that page content
// scrolls under, so bring the link into the middle of the viewport before tapping it.
async function openResellers(page: App['page']): Promise<void> {
  await page.waitForSelector('[data-testid="view-resellers"]', { timeout: 20000 })
  await page.evaluate(() =>
    document.querySelector('[data-testid="view-resellers"]')?.scrollIntoView({ block: 'center' })
  )
  await page.click('[data-testid="view-resellers"]')
  await page.waitForSelector('[data-testid="resellers-modal"]', { timeout: 20000 })
}

// The resale list lives in the "Other Resellers" modal, opened from the detail page's resellers link —
// it is never rendered inline on the page.
describe('other resellers modal', () => {
  it('keeps the resale list off the page until the resellers link is clicked', async () => {
    app = await launchApp({ path: `/item/${COLLECTION}/0` })
    const { page } = app

    await waitForText(page, 'Galaxy Hat')
    // The trigger appears once the cheapest resale resolves; the list itself is not on the page.
    await page.waitForSelector('[data-testid="view-resellers"]', { timeout: 20000 })
    expect(await page.$('[data-testid="resellers-modal"]')).toBeNull()
    expect(await page.$('[data-testid="resale-row"]')).toBeNull()

    await openResellers(page)

    // The dialog opens with the designed header, the four columns and at least one resale row.
    await waitForText(page, 'Other Resellers')
    expect(
      await page.evaluate(() =>
        [...document.querySelectorAll('[data-testid="resellers-modal"] th')].map(th => th.textContent)
      )
    ).toEqual(['Owner', 'Item Number', 'Expiration Date', 'Price'])
    await page.waitForSelector('[data-testid="resale-row"]', { timeout: 20000 })

    // Accessible dialog semantics, and the page behind it can't scroll.
    expect(
      await page.evaluate(() => {
        const d = document.querySelector('[data-testid="resellers-modal"]')
        return {
          role: d?.getAttribute('role'),
          modal: d?.getAttribute('aria-modal'),
          label: d?.getAttribute('aria-label'),
          bodyOverflow: document.body.style.overflow
        }
      })
    ).toEqual({ role: 'dialog', modal: 'true', label: 'Other Resellers', bodyOverflow: 'hidden' })

    // Escape closes it and releases the page scroll.
    await page.keyboard.press('Escape')
    await page.waitForFunction(() => !document.querySelector('[data-testid="resellers-modal"]'), { timeout: 10000 })
    expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden')
  })

  it('adds a resale row to the cart from inside the modal', async () => {
    app = await launchApp({ path: `/item/${COLLECTION}/0` })
    const { page } = app

    await waitForText(page, 'Galaxy Hat')
    await openResellers(page)
    await page.waitForSelector('[data-testid="resale-row"]', { timeout: 20000 })

    // The row actions reveal on hover (they are always visible where there is no hover).
    await page.hover('[data-testid="resale-row"]')
    await page.click('[data-testid="resale-add"]')

    await waitForText(page, 'successfully added to cart')
  })

  it('buys a resale row from inside the modal', async () => {
    // fetchTrade(trade-2) → buyTrade; authorize is mocked and the gasless useCredits meta-tx is signed by
    // the mock wallet, so the buy modal opened from a resale row reaches its success state.
    app = await launchApp({ path: `/item/${COLLECTION}/0`, fixtures: { trade: buyTrade } })
    const { page } = app

    await waitForText(page, 'Galaxy Hat')
    await openResellers(page)
    await page.waitForSelector('[data-testid="resale-row"]', { timeout: 20000 })

    await page.hover('[data-testid="resale-row"]')
    await page.click('[data-testid="resale-buy"]')

    // The shop's buy modal layers over the resellers dialog and completes the purchase in place. Scope
    // the confirm to that dialog — the resale row behind it carries its own "Buy" pill.
    await waitForText(page, 'Buy Asset')
    await clickWhenEnabled(page, '[data-testid="buy-modal"] button', /^buy$/i)
    await waitForText(page, 'Purchase complete!', 30000)
    await waitForText(page, 'was successful')
  })

  it('stacks the table into cards on a phone viewport without scrolling the page sideways', async () => {
    app = await launchApp({ path: `/item/${COLLECTION}/0` })
    const { page } = app
    await page.setViewport({ width: 375, height: 800 })

    await waitForText(page, 'Galaxy Hat')
    await openResellers(page)
    await page.waitForSelector('[data-testid="resale-row"]', { timeout: 20000 })

    // The column header row is replaced by per-cell labels, and nothing overflows horizontally.
    expect(
      await page.evaluate(() => {
        const thead = document.querySelector('[data-testid="resellers-modal"] thead')
        const card = document.querySelector('[data-testid="resellers-modal"]') as HTMLElement | null
        return {
          headHidden: !!thead && getComputedStyle(thead).display === 'none',
          fitsViewport: !!card && card.getBoundingClientRect().width <= window.innerWidth,
          pageOverflows: document.documentElement.scrollWidth > document.documentElement.clientWidth
        }
      })
    ).toEqual({ headHidden: true, fitsViewport: true, pageOverflows: false })
  })
})
