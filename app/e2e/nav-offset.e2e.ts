import { describe, it, expect, afterEach } from 'vitest'
import { launchApp, type App } from './helpers/app'

let app: App | undefined
afterEach(async () => {
  await app?.close()
  app = undefined
})

/**
 * The sub-nav has to sit FLUSH under the ui2 navbar at every width.
 *
 * Everything that offsets against that navbar reads `--nav-h`, which switches at 991px — ui2's own
 * breakpoint, not one of ours. It used to switch at 768, so from 769 to 991 the bar was 64px tall while
 * the page still reserved 92 and a 28px band of page field showed between the two headers. 991/992 are
 * the edge; the rest of the widths cover the band that was broken and the two sides around it.
 */
const WIDTHS = [1440, 1280, 1100, 992, 991, 900, 820, 800, 769, 768, 600, 375]

describe('the two headers', () => {
  it('stay flush at every width', async () => {
    app = await launchApp({ path: '/items' })
    const { page } = app
    await page.waitForSelector('[data-testid="subnav"]', { timeout: 20000 })

    const gaps: { width: number; gap: number; navHeight: number }[] = []
    for (const width of WIDTHS) {
      await page.setViewport({ width, height: 900 })
      // Let the media queries and ui2's own layout settle before measuring.
      await new Promise(r => setTimeout(r, 150))
      gaps.push(
        await page.evaluate(w => {
          const nav = document.querySelector('nav')!
          const sub = document.querySelector('[data-testid="subnav"]')!
          return {
            width: w,
            gap: Math.round(sub.getBoundingClientRect().top - nav.getBoundingClientRect().bottom),
            navHeight: Math.round(nav.getBoundingClientRect().height)
          }
        }, width)
      )
    }

    console.log('[nav offset]', JSON.stringify(gaps))
    expect(gaps.filter(g => g.gap !== 0)).toEqual([])
  }, 60000)
})
