import type { Page } from 'puppeteer'

// Case-insensitive so it matches text-transformed UI (e.g. uppercased buttons like "BUY NOW").
export async function waitForText(page: Page, text: string, timeout = 20000): Promise<void> {
  await page.waitForFunction(
    (t: string) => document.body.innerText.toLowerCase().includes(t.toLowerCase()),
    { timeout },
    text
  )
}

export async function bodyText(page: Page): Promise<string> {
  return page.evaluate(() => document.body.innerText)
}

// Click the first element matching `selector` whose text matches `re`. Returns whether one was found.
export async function clickByText(page: Page, selector: string, re: RegExp): Promise<boolean> {
  return page.evaluate(
    (sel: string, src: string) => {
      const rx = new RegExp(src, 'i')
      const el = [...document.querySelectorAll(sel)].find(e => rx.test(e.textContent || ''))
      if (el) {
        ;(el as HTMLElement).click()
        return true
      }
      return false
    },
    selector,
    re.source
  )
}

// Click the first element whose aria-label matches `re` (for icon-only buttons with no text).
// Returns whether one was found.
export async function clickByAria(page: Page, re: RegExp): Promise<boolean> {
  return page.evaluate((src: string) => {
    const rx = new RegExp(src, 'i')
    const el = [...document.querySelectorAll('[aria-label]')].find(e => rx.test(e.getAttribute('aria-label') || ''))
    if (el) {
      ;(el as HTMLElement).click()
      return true
    }
    return false
  }, re.source)
}

// Wait until an element matching `selector` + `re` exists and is enabled, then click it.
export async function clickWhenEnabled(page: Page, selector: string, re: RegExp, timeout = 15000): Promise<void> {
  await page.waitForFunction(
    (sel: string, src: string) => {
      const rx = new RegExp(src, 'i')
      const el = [...document.querySelectorAll(sel)].find(e => rx.test(e.textContent || '')) as
        HTMLButtonElement | undefined
      return !!el && !el.disabled
    },
    { timeout },
    selector,
    re.source
  )
  await clickByText(page, selector, re)
}

/**
 * Press the cart's primary checkout CTA, whichever rail the buyer's balances put there.
 *
 * The Purchase Summary panel offers one button per payable rail (Figma 1558-320257): "Buy with credits"
 * when the credits cover the basket, and the plain "Buy now" fallback when nothing does (which leads to
 * the top-up picker). Tests about what the checkout *does* shouldn't break every time the label changes
 * with the fixture's balance, so they ask for "the checkout button" and get it.
 *
 * The click happens INSIDE the poll on purpose: the CTA changes identity mid-flight — the fallback
 * "Buy now" paints first, then becomes "Buy with credits" the moment the credits balance resolves.
 * Waiting for one of them and clicking as a separate step loses that race and hangs.
 */
export async function startCartCheckout(page: Page, timeout = 20000): Promise<void> {
  await page.waitForFunction(
    () => {
      const byTestId = document.querySelector('[data-testid="pay-with-credits"]') as HTMLButtonElement | null
      const byLabel = [...document.querySelectorAll('button')].find(b =>
        /^buy now$/i.test((b.textContent ?? '').trim())
      ) as HTMLButtonElement | undefined
      const el = byTestId ?? byLabel ?? null
      if (!el || el.disabled) return false
      el.click()
      return true
    },
    { timeout }
  )
}
