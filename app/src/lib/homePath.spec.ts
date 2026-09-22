import { describe, it, expect } from 'vitest'
import { isHomePath } from '~/lib/homePath'

describe('isHomePath', () => {
  it.each([
    ['the root', '/'],
    ['the root with extra slashes', '//'],
    ['the overview route', '/overview'],
    ['the overview route with a trailing slash', '/overview/'],
    ['the deployed mount point', '/shop'],
    ['the deployed mount point with a trailing slash', '/shop/'],
    ['the deployed overview route', '/shop/overview'],
    ['the deployed overview route with a trailing slash', '/shop/overview/']
  ])('should recognise %s', (_case, pathname) => {
    expect(isHomePath(pathname)).toBe(true)
  })

  // Each of these used to preload a 55 KB hero it never renders, because one index.html serves them all.
  it.each([
    ['the browse grid', '/items'],
    ['an item detail page', '/item/0xc04528c14c8ffd84c7c1fb6719b4a89853035cdd/7'],
    ['the cart', '/cart'],
    ['the credits page', '/credits'],
    ['the deployed browse grid', '/shop/items'],
    ['a route that merely starts like the home one', '/overviewer'],
    ['a route nested under the home one', '/overview/extra']
  ])('should not recognise %s', (_case, pathname) => {
    expect(isHomePath(pathname)).toBe(false)
  })
})
