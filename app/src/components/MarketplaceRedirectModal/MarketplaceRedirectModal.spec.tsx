import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MarketplaceRedirectModal, marketplaceItemUrl, marketplaceTokenUrl } from './MarketplaceRedirectModal'

const CONTRACT = '0x8adb4affb6c79d9dc018b792fa08c6d1cc7f5f09'
// A real one. These are 63-digit decimals, and anything that mangles one (a Number round-trip, a
// truncation) still produces a plausible-looking id — so the test uses the shape it will meet.
const TOKEN_ID = '421249166674228746791672110734681729275580381602196445017243910157'

function renderModal(onClose = vi.fn()) {
  render(<MarketplaceRedirectModal contractAddress={CONTRACT} tokenId={TOKEN_ID} onClose={onClose} />)
  return onClose
}

const continueCta = () => screen.getByTestId('marketplace-redirect-continue')

describe('when a seller is handed off to the legacy marketplace to resell', () => {
  it('should say where they are going and why', () => {
    renderModal()

    expect(screen.getByTestId('marketplace-redirect-modal')).toHaveTextContent(/continue in the legacy marketplace/i)
    expect(screen.getByTestId('marketplace-redirect-modal')).toHaveTextContent(/redirected to complete your listing/i)
  })

  /**
   * The destination carries the EXACT token, on THIS environment's marketplace.
   *
   * Both halves have a failure mode that looks fine: a `.org` link from the `.zone` Shop lands on a
   * marketplace where the token does not exist, and a token id that lost precision lands on someone
   * else's asset. Asserting the whole string is what catches either.
   */
  it('should link to that token on the marketplace for this environment', () => {
    renderModal()

    const href = continueCta().getAttribute('href')
    expect(href).toBe(`${marketplaceTokenUrl(CONTRACT, TOKEN_ID)}`)
    expect(href).toContain(`/contracts/${CONTRACT}/tokens/${TOKEN_ID}`)
    // The full id survived — not a rounded or truncated one.
    expect(href).toContain(TOKEN_ID)
  })

  // An anchor, not a button: the seller can middle-click or cmd-click to keep the Shop open, and the
  // destination shows in the status bar before they commit to leaving.
  it('should be a real link so the shop can be kept open', () => {
    renderModal()

    expect(continueCta().tagName).toBe('A')
    expect(continueCta().getAttribute('target')).toBe('_blank')
    expect(continueCta().getAttribute('rel')).toContain('noreferrer')
  })

  it('should close on cancel, on the x, and on escape', async () => {
    const onClose = renderModal()

    await userEvent.click(screen.getByTestId('marketplace-redirect-cancel'))
    expect(onClose).toHaveBeenCalledTimes(1)

    await userEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(onClose).toHaveBeenCalledTimes(2)

    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(3)
  })

  // The bag is decorative — the heading already says what this is. Announcing the filename would only
  // add noise for a screen reader.
  it('should keep the illustration out of the accessible name', () => {
    renderModal()

    const art = screen.getByTestId('marketplace-redirect-modal').querySelector('img')
    expect(art).not.toBeNull()
    expect(art!.getAttribute('alt')).toBe('')
    expect(art!.getAttribute('aria-hidden')).toBe('true')
  })
})

describe('when a buyer is handed off to the legacy marketplace to buy a resale', () => {
  const ITEM_ID = '4'

  function renderBuyModal(onClose = vi.fn()) {
    render(<MarketplaceRedirectModal variant="buy" contractAddress={CONTRACT} itemId={ITEM_ID} onClose={onClose} />)
    return onClose
  }

  it('should say they are completing a purchase, not a listing', () => {
    renderBuyModal()
    const modal = screen.getByTestId('marketplace-redirect-modal')

    expect(modal).toHaveTextContent(/redirected there to complete your purchase/i)
    expect(modal).not.toHaveTextContent(/complete your listing/i)
  })

  /**
   * The currency changes across the hand-off. A buyer who has been paying in credits all session arrives
   * at a MANA-priced listing, so the modal is the last place that can say so before they get there.
   */
  /**
   * The design words this as "made with MANA". The repo's web2-first copy rule bans that term in NEW
   * copy (src/intl/i18n.spec.ts, whose baseline may only shrink), so the warning is carried by what the
   * buyer actually loses instead: credits do not spend over there.
   */
  it('should warn that credits do not pay for it', () => {
    renderBuyModal()

    expect(screen.getByTestId('marketplace-redirect-modal')).toHaveTextContent(/not made with credits/i)
  })

  /**
   * The ITEM route, not the token route: the buyer has not picked a copy, and seeing the resales on offer
   * is the whole point of the trip. A token URL would land them on one arbitrary copy.
   */
  it('should link to the item page on the marketplace for this environment', () => {
    renderBuyModal()

    const href = continueCta().getAttribute('href')
    expect(href).toBe(marketplaceItemUrl(CONTRACT, ITEM_ID))
    expect(href).toContain(`/contracts/${CONTRACT}/items/${ITEM_ID}`)
    expect(href).not.toContain('/tokens/')
  })

  it('should keep the hand-off dismissable without leaving', async () => {
    const onClose = renderBuyModal()

    await userEvent.click(screen.getByTestId('marketplace-redirect-cancel'))

    expect(onClose).toHaveBeenCalled()
  })
})
