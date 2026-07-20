import { useEffect } from 'react'

// Runtime SEO / <head> manager for the client-rendered shop — no react-helmet dependency. Each routed
// page calls useSeo() to set its <title> + description / robots / canonical / Open Graph / Twitter tags.
//
// URLs are resolved from `window.location` at RUNTIME: the shop ships as ONE artifact served per-env by
// hostname (decentraland.org / .zone / .today) and mounts under /shop in deployed envs, so the prod
// domain is never hardcoded here — canonical + og:url reflect the actual origin+path, and the og image
// resolves against the app's base path (`import.meta.env.BASE_URL`). JS-aware crawlers (Google) and the
// browser tab get per-page meta; non-JS crawlers still read index.html's static defaults.
//
// Every routed page SHOULD call useSeo() so no stale meta leaks from the previous route (each call fully
// rewrites the managed tags).

const SITE_NAME = 'Decentraland Shop'
const DEFAULT_TITLE = `${SITE_NAME} | Wearables & Emotes for Your Avatar`
const DEFAULT_DESCRIPTION =
  'Discover wearables and emotes to make your Decentraland avatar your own. Explore thousands of unique looks and find your style in seconds.'

export type SeoInput = {
  /** Page title; the document title becomes `${title} | Decentraland Shop`. Omit for the home default. */
  title?: string
  description?: string
  /** Absolute og/twitter image URL (e.g. an item thumbnail). Defaults to the shop's og-image. */
  image?: string
  type?: 'website' | 'product'
  /** Keep the page out of search indexes (account / checkout / private pages). */
  noindex?: boolean
  /** Canonical + og:url path override; defaults to the current pathname. */
  canonicalPath?: string
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
  const { title, description = DEFAULT_DESCRIPTION, image, type = 'website', noindex = false, canonicalPath } = input
  useEffect(() => {
    if (typeof window === 'undefined') return
    const origin = window.location.origin
    const url = origin + (canonicalPath ?? window.location.pathname)
    const ogImage = image ?? `${origin}${import.meta.env.BASE_URL}og-image.png`
    const fullTitle = title ? `${title} | ${SITE_NAME}` : DEFAULT_TITLE

    document.title = fullTitle
    upsertMeta('name', 'description', description)
    upsertMeta('name', 'robots', noindex ? 'noindex,nofollow' : 'index,follow')
    upsertLink('canonical', url)

    upsertMeta('property', 'og:title', fullTitle)
    upsertMeta('property', 'og:description', description)
    upsertMeta('property', 'og:url', url)
    upsertMeta('property', 'og:image', ogImage)
    upsertMeta('property', 'og:type', type)

    upsertMeta('name', 'twitter:title', fullTitle)
    upsertMeta('name', 'twitter:description', description)
    upsertMeta('name', 'twitter:image', ogImage)
  }, [title, description, image, type, noindex, canonicalPath])
}

export default useSeo
