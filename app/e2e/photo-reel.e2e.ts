import { describe, it, expect, afterEach } from 'vitest'
import { launchApp, type App } from './helpers/app'
import { waitForText } from './helpers/dom'
import { COLLECTION } from './fixtures'

let app: App | undefined
afterEach(async () => {
  await app?.close()
  app = undefined
})

describe('photos of people wearing an item', () => {
  it('shows them under the item, emptiest shot first, and opens one full size', async () => {
    app = await launchApp({ path: `/item/${COLLECTION}/0` })
    const { page } = app

    await waitForText(page, 'Galaxy Hat')
    await page.waitForSelector('[data-testid="photo-reel-shot"]', { timeout: 15000 })

    expect(await page.$$eval('[data-testid="photo-reel-shot"]', shots => shots.length)).toBe(2)

    // The rail ranks by how much of the frame the item can possibly occupy: the solo shot leads and the
    // nine-avatar one follows, whatever order the service answered in. The name on it is the shooter's
    // profile name, so the scene is what identifies the photo here.
    const firstShot = await page.$eval('[data-testid="photo-reel-shot"]', shot => shot.textContent ?? '')
    expect(firstShot).toContain('Scene bb')

    await page.click('[data-testid="photo-reel-shot"]')
    await page.waitForSelector('[data-testid="photo-reel-lightbox"]', { timeout: 15000 })

    // The open photo credits whoever is wearing it and says where it was taken.
    const bar = await page.$eval('[data-testid="photo-reel-lightbox"]', el => el.textContent ?? '')
    expect(bar).toContain('Scene bb')
    expect(bar).toContain('1/2')
  })
})
