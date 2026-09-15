import { describe, expect, it } from 'vitest'

import en from '~/intl/en.json'
import es from '~/intl/es.json'
import { reasonInterpolatesItemName, reasonKey, reasonLinksToItem, triggerItemPath } from './suggestionReasons'
import type { SuggestionReasonKind } from '~/lib/api'

const KINDS: SuggestionReasonKind[] = [
  'co_owned',
  'creator_affinity',
  'favorite_similar',
  'equipped_similar',
  'seed_similar',
  'trending'
]

/** Walks `a.b.c` in the nested locale JSON the app flattens at load time. */
function lookup(source: Record<string, unknown>, key: string): unknown {
  return key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], source)
}

describe('reasonKey', () => {
  it.each(KINDS)('maps %s to a key that exists in English', kind => {
    expect(typeof lookup(en as Record<string, unknown>, reasonKey(kind) as string)).toBe('string')
  })

  it.each(KINDS)('maps %s to a key that exists in Spanish', kind => {
    expect(typeof lookup(es as Record<string, unknown>, reasonKey(kind) as string)).toBe('string')
  })

  it('gives every kind its own copy, so two reasons never read the same', () => {
    const keys = KINDS.map(reasonKey)
    expect(new Set(keys).size).toBe(KINDS.length)
  })
})

describe('reasonInterpolatesItemName', () => {
  it('is true only for the copy that actually has a name in it', () => {
    expect(KINDS.filter(reasonInterpolatesItemName)).toEqual(['co_owned'])
  })

  it('has an {item} placeholder in both locales for the kind that claims one', () => {
    const key = reasonKey('co_owned') as string
    expect(lookup(en as Record<string, unknown>, key)).toContain('{item}')
    expect(lookup(es as Record<string, unknown>, key)).toContain('{item}')
  })

  it.each(KINDS.filter(k => !reasonInterpolatesItemName(k)))('leaves %s free of placeholders', kind => {
    const key = reasonKey(kind) as string
    expect(lookup(en as Record<string, unknown>, key)).not.toContain('{')
    expect(lookup(es as Record<string, unknown>, key)).not.toContain('{')
  })
})

describe('reasonLinksToItem', () => {
  it('links every kind the server attaches an item to', () => {
    expect(KINDS.filter(reasonLinksToItem)).toEqual([
      'co_owned',
      'favorite_similar',
      'equipped_similar',
      'seed_similar'
    ])
  })

  it('does not link the kinds that are not about one item', () => {
    expect(KINDS.filter(k => !reasonLinksToItem(k))).toEqual(['creator_affinity', 'trending'])
  })
})

describe('triggerItemPath', () => {
  it('routes to the item detail page', () => {
    expect(triggerItemPath('0xabcdef0123456789abcdef0123456789abcdef01-7')).toBe(
      '/item/0xabcdef0123456789abcdef0123456789abcdef01/7'
    )
  })

  it('returns null for an id it cannot route, rather than a broken link', () => {
    expect(triggerItemPath('not-an-id')).toBeNull()
  })

  it('returns null when there is no item number', () => {
    expect(triggerItemPath('0xabcdef0123456789abcdef0123456789abcdef01-')).toBeNull()
  })
})
