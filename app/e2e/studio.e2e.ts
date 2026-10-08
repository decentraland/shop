import { describe, it, expect, afterEach } from 'vitest'
import { launchApp, type App, type StudioMock } from './helpers/app'
import { waitForText } from './helpers/dom'

let app: App | undefined
afterEach(async () => {
  await app?.close()
  app = undefined
})

const STUDIO_ID = '0b5f1b1e-6a59-4c4f-9a3e-2f5d3c1b7e01'
const PLAYER_A = '0x' + 'a1'.repeat(20)
const PLAYER_B = '0x' + 'b2'.repeat(20)
const PLAYER_C = '0x' + 'c3'.repeat(20)
const OPERATOR = '0x' + '0e'.repeat(20)

const studios = (overrides: Partial<StudioMock> = {}): StudioMock => ({
  studios: [
    { id: STUDIO_ID, name: 'Pixel Forge', status: 'active', balanceCents: 20000, grantedCents: 0, grantCount: 0 }
  ],
  maxGrantCents: 50000,
  operatorAccounts: [OPERATOR],
  ...overrides
})

const text = (app: App, testId: string) =>
  app.page.$eval(`[data-testid="${testId}"]`, el => (el as HTMLElement).innerText.trim())

const statuses = (app: App) =>
  app.page.$$eval('[data-testid="studio-gift-outcome"]', els => els.map(el => el.getAttribute('data-status')))

/** Opens the gift dialog, pastes the rows, reviews and confirms the total. */
async function giftList(app: App, lines: string[], total: number) {
  const { page } = app
  await page.click('[data-testid="studio-gift"]')
  await page.waitForSelector('[data-testid="studio-gift-modal"][data-step="edit"]')
  await page.type('[data-testid="studio-gift-shared-reason"]', 'Top player of the week')
  await page.click('[data-testid="studio-gift-paste-toggle"]')
  await page.type('[data-testid="studio-gift-paste"]', lines.join('\n'))
  await page.click('[data-testid="studio-gift-paste-add"]')
  await page.click('[data-testid="studio-gift-review"]')
  await page.waitForSelector('[data-testid="studio-gift-modal"][data-step="confirm"]')
  await page.type('[data-testid="studio-gift-confirm-total"]', String(total))
  await page.waitForSelector('[data-testid="studio-gift-send"]:not([disabled])')
  await page.click('[data-testid="studio-gift-send"]')
  await page.waitForSelector('[data-testid="studio-gift-modal"][data-step="run"]')
}

describe('when a studio opens its page', () => {
  it('should ask a signed-out visitor to sign in', async () => {
    app = await launchApp({ path: '/studio', signedOut: true })

    await app.page.waitForSelector('[data-testid="studio-signin"]', { timeout: 20000 })
  })

  it('should tell an account that manages no studio so', async () => {
    app = await launchApp({ path: '/studio' })

    await app.page.waitForSelector('[data-testid="studio-none"]', { timeout: 20000 })
  })

  it("should show the studio's budget and its paused state", async () => {
    app = await launchApp({
      path: '/studio',
      fixtures: { studios: studios({ studios: [{ ...studios().studios[0], status: 'paused' }] }) }
    })

    await app.page.waitForSelector('[data-testid="studio-paused"]', { timeout: 20000 })
    expect({
      name: await text(app, 'studio-name'),
      balance: await text(app, 'studio-balance'),
      giftDisabled: await app.page.$eval('[data-testid="studio-gift"]', el => (el as HTMLButtonElement).disabled)
    }).toEqual({ name: 'Pixel Forge', balance: '2,000 Credits', giftDisabled: true })
  })
})

describe('when a studio gifts Credits to its players', () => {
  it("should gift each player, refuse the studio's own account without stopping, and list the gifts", async () => {
    app = await launchApp({ path: '/studio', fixtures: { studios: studios() } })
    await app.page.waitForSelector('[data-testid="studio-gift"]', { timeout: 20000 })

    await giftList(app, [`${PLAYER_A}, 100`, `${OPERATOR}, 50`, `${PLAYER_B}, 25, Builder of the month`], 175)
    await app.page.waitForSelector('[data-testid="studio-gift-done"]', { timeout: 20000 })
    const outcome = await statuses(app)
    await app.page.click('[data-testid="studio-gift-close"]')
    await waitForText(app.page, '1,875 Credits')

    expect({
      outcome,
      balance: await text(app, 'studio-balance'),
      listed: await app.page.$$eval('[data-testid="studio-gift-entry"]', els => els.length)
    }).toEqual({ outcome: ['gifted', 'refused', 'gifted'], balance: '1,875 Credits', listed: 2 })
  })

  it('should stop at an answer that never came, and resume after a reload without gifting anyone twice', async () => {
    app = await launchApp({ path: '/studio', fixtures: { studios: studios({ lostAnswerAccounts: [PLAYER_B] }) } })
    await app.page.waitForSelector('[data-testid="studio-gift"]', { timeout: 20000 })

    await giftList(app, [`${PLAYER_A}, 10`, `${PLAYER_B}, 20`, `${PLAYER_C}, 30`], 60)
    await app.page.waitForSelector('[data-testid="studio-gift-stopped"]', { timeout: 20000 })
    const firstRun = await statuses(app)

    await app.page.reload({ waitUntil: 'domcontentloaded' })
    await app.page.waitForSelector('[data-testid="studio-unfinished"]', { timeout: 20000 })
    await app.page.click('[data-testid="studio-gift"]')
    await app.page.waitForSelector('[data-testid="studio-gift-continue"]')
    await app.page.click('[data-testid="studio-gift-continue"]')
    await app.page.waitForSelector('[data-testid="studio-gift-done"]', { timeout: 20000 })
    const secondRun = await statuses(app)
    await app.page.click('[data-testid="studio-gift-close"]')
    await waitForText(app.page, '1,940 Credits')

    expect({
      firstRun,
      secondRun,
      balance: await text(app, 'studio-balance'),
      listed: await app.page.$$eval('[data-testid="studio-gift-entry"]', els => els.length),
      unfinished: await app.page.$('[data-testid="studio-unfinished"]')
    }).toEqual({
      firstRun: ['gifted', 'unknown', 'notSent'],
      secondRun: ['gifted', 'alreadyGifted', 'gifted'],
      balance: '1,940 Credits',
      listed: 3,
      unfinished: null
    })
  })

  it('should keep the dialog inside a phone screen', async () => {
    app = await launchApp({ path: '/studio', fixtures: { studios: studios() } })
    await app.page.setViewport({ width: 375, height: 760 })
    await app.page.waitForSelector('[data-testid="studio-gift"]', { timeout: 20000 })
    await app.page.click('[data-testid="studio-gift"]')
    await app.page.waitForSelector('[data-testid="studio-gift-modal"]')

    const overflow = await app.page.evaluate(() => {
      const modal = document.querySelector('[data-testid="studio-gift-modal"]') as HTMLElement
      return {
        page: document.documentElement.scrollWidth > window.innerWidth,
        modal: modal.getBoundingClientRect().right > window.innerWidth
      }
    })

    expect(overflow).toEqual({ page: false, modal: false })
  })
})
