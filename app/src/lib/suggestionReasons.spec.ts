import { describe, expect, it } from 'vitest'

import en from '~/intl/en.json'
import es from '~/intl/es.json'
import { explainedRows, reasonCategory, reasonCopyKey, type ReasonCategory } from './suggestionReasons'
import type { SuggestionReasonKind } from '~/lib/api'

const CATEGORIES: ReasonCategory[] = ['owned', 'favorites', 'creator', 'activity']

/** Walks `a.b.c` in the nested locale JSON the app flattens at load time. */
function lookup(source: Record<string, unknown>, key: string): unknown {
  return key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], source)
}

describe('reasonCategory', () => {
  it.each<[SuggestionReasonKind, ReasonCategory]>([
    ['co_owned', 'owned'],
    ['equipped_similar', 'owned'],
    ['favorite_similar', 'favorites'],
    ['creator_affinity', 'creator'],
    ['seed_similar', 'activity']
  ])('explains %s as %s', (kind, category) => {
    expect(reasonCategory(kind)).toBe(category)
  })

  it('gives trending no category, so it never reaches a personal rail', () => {
    expect(reasonCategory('trending')).toBeUndefined()
  })

  it('gives a kind the server adds later no category rather than a broken line', () => {
    expect(reasonCategory('worn_with' as SuggestionReasonKind)).toBeUndefined()
  })
})

describe('reasonCopyKey', () => {
  it.each(CATEGORIES)('has English copy for %s', category => {
    expect(typeof lookup(en as Record<string, unknown>, reasonCopyKey(category))).toBe('string')
  })

  it.each(CATEGORIES)('has Spanish copy for %s', category => {
    expect(typeof lookup(es as Record<string, unknown>, reasonCopyKey(category))).toBe('string')
  })

  it('gives every category its own copy', () => {
    const copy = CATEGORIES.map(category => lookup(en as Record<string, unknown>, reasonCopyKey(category)))
    expect(new Set(copy).size).toBe(CATEGORIES.length)
  })
})

describe('explainedRows', () => {
  const row = (kind: SuggestionReasonKind) => ({ reason: { kind } })

  it('keeps the rows the rail can explain, in order, and drops the trending ones', () => {
    const rows = [row('co_owned'), row('trending'), row('seed_similar'), row('trending'), row('creator_affinity')]
    expect(explainedRows(rows).map(r => r.reason.kind)).toEqual(['co_owned', 'seed_similar', 'creator_affinity'])
  })
})
