import { describe, it, expect } from 'vitest'
import { BodyShape } from '@dcl/schemas'
import type { CatalogItem } from '~/lib/api'
import { itemShapes, avatarShape, isCompatible, dominantShape, shapeLabel, BASE_MALE, BASE_FEMALE } from '~/lib/bodyShape'

const w = (gender: CatalogItem['gender']): Pick<CatalogItem, 'gender' | 'category'> => ({ gender, category: 'wearable' })
const emote: Pick<CatalogItem, 'gender' | 'category'> = { gender: null, category: 'emote' }

describe('bodyShape helpers', () => {
  it('itemShapes maps gender to supported shapes; emotes + unisex + unknown support both', () => {
    expect(itemShapes(w('male'))).toEqual([BASE_MALE])
    expect(itemShapes(w('female'))).toEqual([BASE_FEMALE])
    expect(itemShapes(w('unisex'))).toEqual([BASE_MALE, BASE_FEMALE])
    expect(itemShapes(w(null))).toEqual([BASE_MALE, BASE_FEMALE])
    expect(itemShapes(emote)).toEqual([BASE_MALE, BASE_FEMALE])
  })

  it('avatarShape reads the BaseMale/BaseFemale URN; null when absent', () => {
    expect(avatarShape({ avatar: { bodyShape: BodyShape.FEMALE } })).toBe(BASE_FEMALE)
    expect(avatarShape({ avatar: { bodyShape: BodyShape.MALE } })).toBe(BASE_MALE)
    expect(avatarShape({ avatar: {} })).toBeNull()
    expect(avatarShape(undefined)).toBeNull()
  })

  it('isCompatible: a gendered item only fits its shape; null shape is unconstrained', () => {
    expect(isCompatible(w('female'), BASE_MALE)).toBe(false)
    expect(isCompatible(w('female'), BASE_FEMALE)).toBe(true)
    expect(isCompatible(w('unisex'), BASE_MALE)).toBe(true)
    expect(isCompatible(w('female'), null)).toBe(true) // no avatar → treat as compatible
    expect(isCompatible(emote, BASE_MALE)).toBe(true)
  })

  it('dominantShape: majority of gendered items (ties → male); null when none are gendered', () => {
    expect(dominantShape([w('female'), w('female'), w('male')])).toBe(BASE_FEMALE)
    expect(dominantShape([w('male'), w('female')])).toBe(BASE_MALE) // tie
    expect(dominantShape([w('unisex'), emote])).toBeNull()
    expect(dominantShape([])).toBeNull()
  })

  it('shapeLabel', () => {
    expect(shapeLabel(BASE_MALE)).toBe('Male')
    expect(shapeLabel(BASE_FEMALE)).toBe('Female')
  })
})
