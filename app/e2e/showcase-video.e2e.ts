import { describe, it, expect, afterEach } from 'vitest'
import { launchApp, type App } from './helpers/app'
import { waitForText } from './helpers/dom'
import { COLLECTION } from './fixtures'

// The showcase clip sits ON TOP of the 3D preview iframe, and that is the part only a real browser can
// answer: an iframe that covers the whole viewer will swallow a click meant for a button drawn over it,
// and neither a unit test nor a screenshot notices. So this hit-tests the button before clicking it.

let app: App | undefined
afterEach(async () => {
  await app?.close()
  app = undefined
})

const VIDEO_HASH = 'bafyvideohash'

describe('the showcase video on a smart wearable', () => {
  it('offers a clickable play button over the preview and opens the clip', async () => {
    app = await launchApp({
      // Item 1 is the fixtures' smart wearable; the contents map is what marks the clip.
      path: `/item/${COLLECTION}/1`,
      fixtures: { builderItemContents: { 'thumbnail.png': 'bafyfake', 'video.mp4': VIDEO_HASH } }
    })
    const { page } = app

    await waitForText(page, 'Nebula Jacket')
    await page.waitForSelector('[data-testid="play-showcase"]', { timeout: 20000 })

    // Nothing plays until asked, and the button is the topmost element at its own centre — i.e. the
    // preview iframe is not covering it.
    expect(await page.$('[data-testid="showcase-video"]')).toBeNull()
    expect(
      await page.evaluate(() => {
        const btn = document.querySelector('[data-testid="play-showcase"]') as HTMLElement
        const r = btn.getBoundingClientRect()
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
        return !!hit && btn.contains(hit)
      })
    ).toBe(true)

    await page.click('[data-testid="play-showcase"]')

    await page.waitForSelector('[data-testid="showcase-video"]', { timeout: 10000 })
    expect(await page.$eval('[data-testid="showcase-video"]', el => el.getAttribute('src'))).toContain(
      `/storage/contents/${VIDEO_HASH}`
    )

    // Escape closes it and leaves the page where it was.
    await page.keyboard.press('Escape')
    await page.waitForFunction(() => !document.querySelector('[data-testid="showcase-video"]'), { timeout: 10000 })
    expect(await page.evaluate(() => window.location.pathname)).toBe(`/item/${COLLECTION}/1`)
  })

  it('offers nothing when the item ships no clip', async () => {
    app = await launchApp({ path: `/item/${COLLECTION}/1` })
    const { page } = app

    await waitForText(page, 'Nebula Jacket')
    // The lookup has settled by the time the buy CTA is up, so its absence is an answer, not a race.
    await waitForText(page, 'Buy now')
    expect(await page.$('[data-testid="play-showcase"]')).toBeNull()
  })
})
