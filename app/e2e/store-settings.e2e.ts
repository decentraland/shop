import { readFileSync, writeFileSync, mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { hashV1 } from '@dcl/hashing'
import { describe, it, expect, afterEach } from 'vitest'
import { launchApp, type App } from './helpers/app'
import { waitForText } from './helpers/dom'
import { ElementHandle } from 'puppeteer'

let app: App | undefined
afterEach(async () => {
  await app?.close()
  app = undefined
})

// The content hash of the first cover template, computed exactly as the app does (same bytes, same
// hashV1). Used to build a "saved store" fixture whose cover IS that template, so we can assert the
// picker re-selects it on reload instead of showing it as a custom upload.
const templatePath = fileURLToPath(new URL('../src/assets/creator-covers/template-cover-1.jpeg', import.meta.url))
async function template1Hash(): Promise<string> {
  return hashV1(new Uint8Array(readFileSync(templatePath)))
}

// The signed-in test user (helpers/session) has no store entity, so the form loads empty. Editing a
// field, picking a template cover, and saving deploys a STORE entity to the content server (mocked)
// and redirects to the creator's own storefront. Everything is behind sign-in and fully mocked — no
// real wallet, signing, or network.
describe('store settings', () => {
  it('edits and saves the store, then redirects to the creator page', async () => {
    const deploys: string[] = []
    app = await launchApp({ path: '/store-settings' })
    const { page } = app
    page.on('request', r => {
      if (r.method() === 'POST' && new URL(r.url()).pathname === '/content/entities') deploys.push(r.url())
    })

    await waitForText(page, 'Store settings')

    // Pick the first cover template so the deploy uploads a cover file.
    await page.click('.cover-picker__tile')
    // Type a description (React-controlled input needs the native setter + input event).
    await page.evaluate(() => {
      const ta = document.querySelector('textarea') as HTMLTextAreaElement
      const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
      set.call(ta, 'Handcrafted gear.')
      ta.dispatchEvent(new Event('input', { bubbles: true }))
    })

    // Save is enabled once the form is dirty and valid.
    const btn = '.store-settings__actions .btn'
    await page.waitForFunction(
      (sel: string) => !(document.querySelector(sel) as HTMLButtonElement)?.disabled,
      { timeout: 5000 },
      btn
    )
    await page.click(btn)

    // Success toast + a deploy POST + redirect to the signed-in creator's storefront.
    await waitForText(page, 'Store saved')
    await page.waitForFunction(() => location.pathname.startsWith('/assets/creator/'), { timeout: 5000 })
    expect(deploys.length).toBe(1)
  })

  it('re-selects the saved template on reload instead of showing it as a custom upload', async () => {
    // A store whose cover file's hash IS template-cover-1. On load, the picker must mark that template
    // selected — NOT add a separate "custom" tile (the bug: a saved template showed up twice).
    const hash = await template1Hash()
    app = await launchApp({
      path: '/store-settings',
      fixtures: {
        userStore: {
          content: [{ file: 'cover/template-cover-1.jpeg', hash }],
          metadata: {
            description: 'From a template.',
            images: [{ name: 'cover', file: 'cover/template-cover-1.jpeg' }],
            links: []
          }
        }
      }
    })
    const { page } = app

    await waitForText(page, 'Store settings')

    // Wait for the async template-hash resolution to settle, then count selected tiles. Exactly one
    // tile is selected and there is no custom tile — proving the template matched by hash.
    await page.waitForFunction(() => document.querySelectorAll('.cover-picker__tile.is-selected').length === 1, {
      timeout: 5000
    })
    const counts = await page.evaluate(() => ({
      selected: document.querySelectorAll('.cover-picker__tile.is-selected').length,
      custom: document.querySelectorAll('.cover-picker__tile--custom').length
    }))
    expect(counts).toEqual({ selected: 1, custom: 0 })
  })

  it('keeps the uploaded cover as a re-selectable tile after picking a template', async () => {
    const tmp = join(mkdtempSync(join(tmpdir(), 'shop-e2e-')), 'upload.png')
    // A 1x1 PNG to upload as a custom cover.
    writeFileSync(
      tmp,
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
        'base64'
      )
    )

    app = await launchApp({ path: '/store-settings' })
    const { page } = app
    await waitForText(page, 'Store settings')

    // Upload → the custom tile appears and is selected.
    const input = (await page.$('.cover-picker__input'))! as ElementHandle<HTMLInputElement>
    await input.uploadFile(tmp)
    await page.waitForFunction(() => !!document.querySelector('.cover-picker__tile--custom.is-selected'), {
      timeout: 5000
    })

    // Pick a template → custom tile PERSISTS (the bug was it vanished) but is no longer selected.
    await page.click('.cover-picker__tile:not(.cover-picker__tile--custom):not(.cover-picker__upload)')
    const afterTemplate = await page.evaluate(() => ({
      customPresent: document.querySelectorAll('.cover-picker__tile--custom').length,
      customSelected: !!document.querySelector('.cover-picker__tile--custom.is-selected')
    }))
    expect(afterTemplate).toEqual({ customPresent: 1, customSelected: false })

    // Re-click the custom tile → it becomes selected again.
    await page.click('.cover-picker__tile--custom')
    await page.waitForFunction(() => !!document.querySelector('.cover-picker__tile--custom.is-selected'), {
      timeout: 5000
    })
  })

  it('shows a sign-in prompt when signed out', async () => {
    app = await launchApp({ path: '/store-settings', signedOut: true })
    await waitForText(app.page, 'Sign in to set up your store')
  })
})
