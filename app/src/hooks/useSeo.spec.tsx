import { describe, it, expect, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { buildSeoTags, useSeo } from './useSeo'

/**
 * WHAT A SHARED LINK CARRIES.
 *
 * index.html ships a static default card (the 1200x630 shop image) plus its dimensions and alt text. The
 * moment a page hands useSeo its OWN image — an item thumbnail — those inherited tags stop describing the
 * image that og:image now points at. The bug this file pins is the mismatch: declaring 1200x630 and
 * "wearables and emotes for your avatar" over a square item render, on a card type whose minimum width
 * the smaller thumbnails do not even meet.
 *
 * So the assertions are about COHERENCE of the emitted set, not about the presence of individual tags:
 * whichever image wins, the card type, the dimensions and the alt text must all agree with it.
 */

const CTX = { origin: 'https://decentraland.org', pathname: '/shop/item/0xabc/1', basePath: '/shop/' }

describe('buildSeoTags', () => {
  describe('when the page supplies no image of its own', () => {
    it('should describe the default 1200x630 card and keep the large-image card type', () => {
      const tags = buildSeoTags({}, CTX)

      expect(tags.properties['og:image']).toBe('https://decentraland.org/shop/og-image.png')
      expect(tags.names['twitter:card']).toBe('summary_large_image')
      expect(tags.properties['og:image:width']).toBe('1200')
      expect(tags.properties['og:image:height']).toBe('630')
      // Nothing to clear — the inherited dimensions are the correct ones for this image.
      expect(tags.removeProperties).toEqual([])
    })

    it('should title, describe and canonicalise the page from the site defaults', () => {
      const tags = buildSeoTags({}, CTX)

      expect(tags.title).toBe('Decentraland Shop | Wearables & Emotes for Your Avatar')
      expect(tags.canonical).toBe('https://decentraland.org/shop/item/0xabc/1')
      expect(tags.properties['og:url']).toBe('https://decentraland.org/shop/item/0xabc/1')
      expect(tags.names['robots']).toBe('index,follow')
    })
  })

  describe('when the page supplies its own image', () => {
    const IMAGE = 'https://peer.decentraland.org/lambdas/collections/contents/urn:x:0/thumbnail'

    it('should share that image and drop the card type that would reject or crop it', () => {
      const tags = buildSeoTags({ title: 'Cool Hat', image: IMAGE }, CTX)

      expect(tags.properties['og:image']).toBe(IMAGE)
      expect(tags.names['twitter:image']).toBe(IMAGE)
      // Item art is square with a per-item edge length; a large card needs >=300px wide and crops to
      // ~1.91:1, so the square-thumb card is the only one that renders every item faithfully.
      expect(tags.names['twitter:card']).toBe('summary')
    })

    it('should declare no dimensions and clear the inherited ones', () => {
      const tags = buildSeoTags({ title: 'Cool Hat', image: IMAGE }, CTX)

      // The true edge length is unknowable without fetching the bytes, so the crawler must measure it.
      expect(tags.properties).not.toHaveProperty('og:image:width')
      expect(tags.properties).not.toHaveProperty('og:image:height')
      expect(tags.removeProperties).toEqual(['og:image:width', 'og:image:height'])
    })

    it('should replace the site-default alt text with something that describes the item', () => {
      const tags = buildSeoTags({ title: 'Cool Hat', image: IMAGE }, CTX)

      expect(tags.properties['og:image:alt']).toBe('Cool Hat')
      expect(tags.names['twitter:image:alt']).toBe('Cool Hat')
    })

    it('should prefer an explicit imageAlt over the title', () => {
      const tags = buildSeoTags({ title: 'Cool Hat', image: IMAGE, imageAlt: 'A rare top hat' }, CTX)

      expect(tags.properties['og:image:alt']).toBe('A rare top hat')
    })
  })

  describe('and the page is marked noindex', () => {
    it('should tell crawlers not to index or follow it', () => {
      expect(buildSeoTags({ title: 'Cart', noindex: true }, CTX).names['robots']).toBe('noindex,nofollow')
    })
  })

  describe('and the page overrides its canonical path', () => {
    it('should canonicalise to the override rather than the current pathname', () => {
      const tags = buildSeoTags({ canonicalPath: '/shop/items' }, CTX)

      expect(tags.canonical).toBe('https://decentraland.org/shop/items')
      expect(tags.properties['og:url']).toBe('https://decentraland.org/shop/items')
    })
  })

  describe('and the origin is not production', () => {
    it('should build every URL from the given origin, never a hardcoded domain', () => {
      const tags = buildSeoTags(
        {},
        { origin: 'https://decentraland.zone', pathname: '/shop/items', basePath: '/shop/' }
      )

      expect(tags.canonical).toBe('https://decentraland.zone/shop/items')
      expect(tags.properties['og:image']).toBe('https://decentraland.zone/shop/og-image.png')
    })
  })
})

/**
 * The hook applied against a head that already carries index.html's static defaults — the only place the
 * REMOVAL half of the contract can be observed.
 */
describe('useSeo applied to the document head', () => {
  function Page(props: Parameters<typeof useSeo>[0]) {
    useSeo(props)
    return null
  }
  const prop = (key: string) => document.head.querySelector(`meta[property="${key}"]`)?.getAttribute('content')
  const name = (key: string) => document.head.querySelector(`meta[name="${key}"]`)?.getAttribute('content')

  beforeEach(() => {
    // Seed the head the way index.html ships it: a default card WITH dimensions and alt text.
    document.head.innerHTML = `
      <meta property="og:image" content="/shop/og-image.png" />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:image:alt" content="Decentraland Shop — wearables and emotes for your avatar" />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="robots" content="index,follow" />
    `
  })

  it('should point the card at the page image and remove the dimensions that no longer describe it', () => {
    render(<Page title="Cool Hat" image="https://img.test/hat.png" />)

    expect(prop('og:image')).toBe('https://img.test/hat.png')
    expect(prop('og:image:alt')).toBe('Cool Hat')
    expect(name('twitter:card')).toBe('summary')
    expect(document.head.querySelector('meta[property="og:image:width"]')).toBeNull()
    expect(document.head.querySelector('meta[property="og:image:height"]')).toBeNull()
  })

  it('should restore the default card and its dimensions for a page with no image of its own', () => {
    // A page WITH an image ran first, so the dimensions are gone — the next page must put them back
    // rather than inherit their absence.
    const { unmount } = render(<Page title="Cool Hat" image="https://img.test/hat.png" />)
    unmount()

    render(<Page title="Browse" />)

    expect(prop('og:image')).toContain('og-image.png')
    expect(prop('og:image:width')).toBe('1200')
    expect(prop('og:image:height')).toBe('630')
    expect(name('twitter:card')).toBe('summary_large_image')
  })

  it('should emit robots noindex for a page that must stay out of search results', () => {
    render(<Page title="Cart" noindex />)

    expect(name('robots')).toBe('noindex,nofollow')
  })

  it('should set the document title and the canonical link together', () => {
    render(<Page title="Cool Hat" />)

    expect(document.title).toBe('Cool Hat | Decentraland Shop')
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
      window.location.origin + window.location.pathname
    )
  })
})
