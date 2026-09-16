import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readCreationsHint, writeCreationsHint } from '~/lib/creations-hint'

const ADDRESS = '0xAbC0000000000000000000000000000000000001'

beforeEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('when no creations were ever loaded for an account', () => {
  it('should have no hint', () => {
    expect(readCreationsHint(ADDRESS)).toBeNull()
  })

  it('should have no hint without an account either', () => {
    expect(readCreationsHint(undefined)).toBeNull()
    expect(readCreationsHint(null)).toBeNull()
  })
})

describe('when a load with creations is remembered', () => {
  beforeEach(() => {
    writeCreationsHint(ADDRESS, 7)
  })

  it('should return the count', () => {
    expect(readCreationsHint(ADDRESS)).toEqual({ count: 7 })
  })

  it('should not care about the address casing', () => {
    expect(readCreationsHint(ADDRESS.toLowerCase())).toEqual({ count: 7 })
  })

  it('should keep hints for other accounts apart', () => {
    expect(readCreationsHint('0x0000000000000000000000000000000000000002')).toBeNull()
  })

  it('and a later load found none it should forget the hint', () => {
    writeCreationsHint(ADDRESS, 0)
    expect(readCreationsHint(ADDRESS)).toBeNull()
  })
})

describe('when storage misbehaves', () => {
  it('should read null over corrupt storage rather than throw', () => {
    localStorage.setItem('shop:creations-hint:v1', '{not json')
    expect(readCreationsHint(ADDRESS)).toBeNull()
  })

  it('should swallow a write failure', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    expect(() => writeCreationsHint(ADDRESS, 3)).not.toThrow()
  })
})
