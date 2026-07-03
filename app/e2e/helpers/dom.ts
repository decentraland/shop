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

// Wait until an element matching `selector` + `re` exists and is enabled, then click it.
export async function clickWhenEnabled(page: Page, selector: string, re: RegExp, timeout = 15000): Promise<void> {
  await page.waitForFunction(
    (sel: string, src: string) => {
      const rx = new RegExp(src, 'i')
      const el = [...document.querySelectorAll(sel)].find(e => rx.test(e.textContent || '')) as HTMLButtonElement | undefined
      return !!el && !el.disabled
    },
    { timeout },
    selector,
    re.source
  )
  await clickByText(page, selector, re)
}
