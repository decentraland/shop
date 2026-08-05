import { useEffect } from 'react'

// Runtime SEO / <head> manager for the client-rendered shop — no react-helmet dependency. Each routed
// page calls useSeo() to set its <title> + description / robots / canonical / Open Graph / Twitter tags.
//
// URLs are resolved from `window.location` at RUNTIME: the shop ships as ONE artifact served per-env by
// hostname (decentraland.org / .zone / .today) and mounts under /shop in deployed envs, so the prod
// domain is never hardcoded here — canonical + og:url reflect the actual origin+path, and the og image
// resolves against the app's base path (`import.meta.env.BASE_URL`).
//
// Every routed page SHOULD call useSeo() so no stale meta leaks from the previous route (each call fully
// rewrites the managed tags).
//
// IMPORTANT — how far these tags reach. The classic social crawlers (Twitterbot, facebookexternalhit,
// Discordbot, Slackbot, WhatsApp, LinkedInBot) do NOT execute JavaScript: they read the HTML exactly as
// the CDN serves it, which for every route is index.html. What those crawlers share is therefore always
// index.html's static default card, never the per-page tags written below. Per-page social previews
// (an item page sharing its own image) require a server/edge step that injects the tags before the HTML
// is sent, and no such layer exists for this app today. The tag COMPUTATION lives in the pure
// `buildSeoTags` below precisely so that layer can reuse it verbatim rather than reimplement (and drift
// from) these rules.
//
// What the tags below DO reach today: the browser tab/title, and JS-rendering indexers — Googlebot
// renders the page before indexing it, so title/description/canonical/robots are read from here.

const SITE_NAME = 'Decentraland Shop'
const DEFAULT_TITLE = `${SITE_NAME} | Wearables & Emotes for Your Avatar`
const DEFAULT_DESCRIPTION =
  'Discover wearables and emotes to make your Decentraland avatar your own. Explore thousands of unique looks and find your style in seconds.'
const DEFAULT_IMAGE_ALT = 'Decentraland Shop — wearables and emotes for your avatar'
// The shipped public/og-image.png, measured: 1200x630 — the ~1.91:1 shape a large card wants. Declared
// so a crawler can lay the card out without fetching the bytes first.
const DEFAULT_IMAGE_WIDTH = '1200'
const DEFAULT_IMAGE_HEIGHT = '630'

export type SeoInput = {
  /** Page title; the document title becomes `${title} | Decentraland Shop`. Omit for the home default. */
  title?: string
  description?: string
  /** Absolute og/twitter image URL (e.g. an item thumbnail). Defaults to the shop's og-image. */
  image?: string
  /** Alt text for `image`; defaults to the page title, then to the site default. */
  imageAlt?: string
  type?: 'website' | 'product'
  /** Keep the page out of search indexes (account / checkout / private pages). */
  noindex?: boolean
  /** Canonical + og:url path override; defaults to the current pathname. */
  canonicalPath?: string
}

/** Everything needed to render the managed head, with no DOM or `window` involved. */
export type SeoTags = {
  /** Full `<title>` / og:title / twitter:title text. */
  title: string
  canonical: string
  /** `<meta name=...>` pairs to set. */
  names: Record<string, string>
  /** `<meta property=...>` pairs to set. */
  properties: Record<string, string>
  /**
   * `<meta property=...>` keys that must be ABSENT for this page. Non-empty when the page supplies its
   * own image: index.html hardcodes the DEFAULT image's dimensions, so leaving them in place would
   * declare a 1200x630 image while og:image points at something else entirely.
   */
  removeProperties: string[]
}

/**
 * Pure head-tag computation — the single source of truth for this app's social/SEO tags. Free of DOM
 * access so it can be unit-tested directly and reused by a prerender/edge renderer (see the file note).
 *
 * `ctx.origin` / `ctx.basePath` come from the runtime location, never from a hardcoded domain.
 */
export function buildSeoTags(input: SeoInput, ctx: { origin: string; pathname: string; basePath: string }): SeoTags {
  const {
    title,
    description = DEFAULT_DESCRIPTION,
    image,
    imageAlt,
    type = 'website',
    noindex = false,
    canonicalPath
  } = input

  const canonical = ctx.origin + (canonicalPath ?? ctx.pathname)
  const fullTitle = title ? `${title} | ${SITE_NAME}` : DEFAULT_TITLE

  // A page-supplied image is item/outfit art, which is SQUARE. Measured against the live content server:
  // item thumbnails come back square with a per-item edge length (200x200 and 1024x1024 both observed)
  // and the endpoint ignores any resize hint. Two consequences:
  //
  //  - twitter:card becomes `summary` (square thumb) rather than `summary_large_image`. A large card
  //    crops to ~1.91:1, slicing the top and bottom off an avatar render, and its documented minimum
  //    width is 300px — the 200x200 thumbnails do not qualify at all, so the image would be dropped
  //    rather than merely cropped. `summary`'s 144x144 minimum is cleared by both sizes. The default
  //    1200x630 card keeps `summary_large_image`.
  //  - dimensions are NOT declared, because the true edge length is per-item and unknowable without
  //    fetching the bytes; a crawler that is told nothing measures the image itself, which is correct,
  //    whereas a guess would be a lie. The inherited defaults are removed for that same reason.
  const hasOwnImage = !!image
  const ogImage = image ?? `${ctx.origin}${ctx.basePath}og-image.png`
  const resolvedImageAlt = imageAlt ?? (hasOwnImage ? (title ?? DEFAULT_IMAGE_ALT) : DEFAULT_IMAGE_ALT)

  const properties: Record<string, string> = {
    'og:site_name': SITE_NAME,
    'og:title': fullTitle,
    'og:description': description,
    'og:url': canonical,
    'og:image': ogImage,
    'og:image:alt': resolvedImageAlt,
    'og:type': type
  }
  const removeProperties: string[] = []
  if (hasOwnImage) {
    removeProperties.push('og:image:width', 'og:image:height')
  } else {
    properties['og:image:width'] = DEFAULT_IMAGE_WIDTH
    properties['og:image:height'] = DEFAULT_IMAGE_HEIGHT
  }

  return {
    title: fullTitle,
    canonical,
    names: {
      description,
      robots: noindex ? 'noindex,nofollow' : 'index,follow',
      'twitter:card': hasOwnImage ? 'summary' : 'summary_large_image',
      'twitter:title': fullTitle,
      'twitter:description': description,
      'twitter:image': ogImage,
      'twitter:image:alt': resolvedImageAlt
    },
    properties,
    removeProperties
  }
}

function upsertMeta(attr: 'name' | 'property', key: string, content: string): void {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

function removeMeta(attr: 'name' | 'property', key: string): void {
  document.head.querySelectorAll<HTMLMetaElement>(`meta[${attr}="${key}"]`).forEach(el => el.remove())
}

function upsertLink(rel: string, href: string): void {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`)
  if (!el) {
    el = document.createElement('link')
    el.setAttribute('rel', rel)
    document.head.appendChild(el)
  }
  el.setAttribute('href', href)
}

export function useSeo(input: SeoInput = {}): void {
  const { title, description, image, imageAlt, type, noindex, canonicalPath } = input
  useEffect(() => {
    if (typeof window === 'undefined') return
    const tags = buildSeoTags(
      { title, description, image, imageAlt, type, noindex, canonicalPath },
      { origin: window.location.origin, pathname: window.location.pathname, basePath: import.meta.env.BASE_URL }
    )

    document.title = tags.title
    upsertLink('canonical', tags.canonical)
    for (const [key, content] of Object.entries(tags.names)) upsertMeta('name', key, content)
    for (const [key, content] of Object.entries(tags.properties)) upsertMeta('property', key, content)
    for (const key of tags.removeProperties) removeMeta('property', key)
  }, [title, description, image, imageAlt, type, noindex, canonicalPath])
}

export default useSeo
