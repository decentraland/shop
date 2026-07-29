import { describe, it, expect, afterEach } from 'vitest'
import { launchApp, type App } from './helpers/app'
import { waitForText } from './helpers/dom'

let app: App | undefined
afterEach(async () => {
  await app?.close()
  app = undefined
})

// The footer's wide layout is a two-column row whose min-content is ~834px before its 160px of padding.
// It only stacked below 768px, so every width in between had no slack at all: it fit by a few pixels with
// Inter loaded and spilled the last MENU column off the page with any wider fallback font (which is what
// CI has). The assertion is on the ROW's own budget rather than on pixel positions, so it holds whatever
// font the machine running it happens to have.
describe('footer layout', () => {
  it('never makes the page scroll sideways, at any width', async () => {
    app = await launchApp({ path: '/overview' })
    const { page } = app
    await waitForText(page, 'GETTING STARTED')

    for (const width of [1512, 1200, 1000, 901, 900, 850, 800, 769, 500, 375]) {
      await page.setViewport({ width, height: 900 })
      const m = await page.evaluate(() => {
        const doc = document.documentElement
        const footer = document.querySelector('footer') as HTMLElement
        const row = footer.firstElementChild as HTMLElement
        // The row's MIN-CONTENT requirement, not its current box: that is what the fallback font inflates,
        // and measuring it here fails on any machine instead of only on the ones missing Inter.
        const before = row.style.width
        row.style.width = 'min-content'
        const rowNeeds = Math.ceil(row.getBoundingClientRect().width)
        row.style.width = before
        return { rowNeeds, available: doc.clientWidth, pageOverflow: doc.scrollWidth - doc.clientWidth }
      })
      expect(m.pageOverflow, `page overflow at ${width}px`).toBeLessThanOrEqual(1)
      expect(
        m.rowNeeds,
        `footer row needs ${m.rowNeeds}px of min-content but only has ${m.available}px at ${width}px`
      ).toBeLessThanOrEqual(m.available)
    }
  })

  it('keeps the MENU links reachable below lg, as the accordion', async () => {
    app = await launchApp({ path: '/overview' })
    const { page } = app
    await page.setViewport({ width: 800, height: 900 })
    await waitForText(page, 'GETTING STARTED')

    // Below lg the wide MENU columns give way to the accordion, so the links live behind a disclosure
    // rather than being clipped off the edge. Opening one must reveal its links.
    const opened = await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find(b => /getting started/i.test(b.textContent ?? ''))
      if (!btn) return false
      btn.click()
      return true
    })
    expect(opened).toBe(true)
    await waitForText(page, 'System Requirements')
  })
})
