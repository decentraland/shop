import { describe, it, expect, afterEach } from 'vitest'
import { launchApp, type App } from './helpers/app'
import { bodyText, clickByText, waitForText } from './helpers/dom'
import { COLLECTION } from './fixtures'

/**
 * "Recently viewed" on the overview.
 *
 * Entirely client-side (localStorage), which is exactly why it needs a browser test: the row is written
 * on one page and read on another, across a real navigation. A store that never persists, or a row that
 * renders an empty shell instead of nothing, both look correct in a unit test.
 */

let app: App | undefined
afterEach(async () => {
  await app?.close()
  app = undefined
})

describe('recently viewed', () => {
  it('renders nothing at all before anything has been viewed', async () => {
    app = await launchApp({ path: '/overview' })
    const { page } = app

    await waitForText(page, 'Featured Products')
    // Not an empty carousel with a heading — nothing.
    expect(await bodyText(page)).not.toMatch(/recently viewed/i)
  })

  it('lists an item on the overview after visiting its page', async () => {
    app = await launchApp({ path: `/item/${COLLECTION}/1` })
    const { page } = app

    await waitForText(page, 'Nebula Jacket')
    // Navigate in-app (client-side) the way a shopper would, not with a hard reload.
    expect(await clickByText(page, 'a', /overview/i)).toBe(true)
    await waitForText(page, 'Featured Products')

    await waitForText(page, 'Recently Viewed')
    const row = await page.$eval('body', b => {
      const heads = [...b.querySelectorAll('h2')]
      const h = heads.find(e => /recently viewed/i.test(e.textContent ?? ''))
      return (h?.closest('section') as HTMLElement | null)?.innerText ?? ''
    })
    expect(row).toMatch(/nebula jacket/i)
  })

  it('keeps the history across a full reload', async () => {
    app = await launchApp({ path: `/item/${COLLECTION}/1` })
    const { page } = app

    await waitForText(page, 'Nebula Jacket')
    await page.goto(page.url().replace(`/item/${COLLECTION}/1`, '/overview'), { waitUntil: 'networkidle2' })

    await waitForText(page, 'Recently Viewed')
    expect(await bodyText(page)).toMatch(/nebula jacket/i)
  })
})
