import { describe, it, expect } from 'vitest'
import { framingScore, tileFocus, toScreenRect } from '~/lib/reelFraming'

const CENTRED = { x: 0.35, y: 0.2, width: 0.3, height: 0.6 }

describe('when reading a rectangle from the service', () => {
  it('should keep a rectangle of the photo', () => {
    expect(toScreenRect({ x: 0.1, y: 0.2, width: 0.3, height: 0.4 })).toEqual({
      x: 0.1,
      y: 0.2,
      width: 0.3,
      height: 0.4
    })
  })

  it('and it is empty, missing or not numbers it should have no rectangle', () => {
    expect(toScreenRect({ x: 0, y: 0, width: 0, height: 0 })).toBeNull()
    expect(toScreenRect(undefined)).toBeNull()
    expect(toScreenRect({ x: '0.1', y: 0.2, width: 0.3, height: 0.4 })).toBeNull()
  })

  it('and it runs off the photo it should have no rectangle', () => {
    expect(toScreenRect({ x: 0.8, y: 0, width: 0.5, height: 0.5 })).toBeNull()
  })
})

describe('when scoring how a photo frames the wearer', () => {
  it('should score a large wearer above a small one', () => {
    const large = framingScore(CENTRED, [], 'upper_body')
    const small = framingScore({ ...CENTRED, y: 0.4, height: 0.3 }, [], 'upper_body')

    expect(large).toBeGreaterThan(small ?? Infinity)
  })

  it('should score a wearer in the middle above the same wearer at the side', () => {
    expect(framingScore(CENTRED, [], 'upper_body')).toBeGreaterThan(
      framingScore({ ...CENTRED, x: 0.02 }, [], 'upper_body') ?? Infinity
    )
  })

  it('and the wearer is too small to make the item out it should not show the photo', () => {
    expect(framingScore({ x: 0.45, y: 0.4, width: 0.05, height: 0.1 }, [], 'upper_body')).toBeNull()
  })

  it('and the wearer is cut off at the bottom it should not show shoes or trousers, but still a hat', () => {
    const cutAtBottom = { x: 0.4, y: 0.3, width: 0.2, height: 0.7 }

    expect(framingScore(cutAtBottom, [], 'feet')).toBeNull()
    expect(framingScore(cutAtBottom, [], 'lower_body')).toBeNull()
    expect(framingScore(cutAtBottom, [], 'hat')).not.toBeNull()
  })

  it('and the wearer is cut off at the top it should not show a hat, but still shoes', () => {
    const cutAtTop = { x: 0.4, y: 0, width: 0.2, height: 0.7 }

    expect(framingScore(cutAtTop, [], 'hat')).toBeNull()
    expect(framingScore(cutAtTop, [], 'feet')).not.toBeNull()
  })

  it('and other people cover most of the wearer it should not show the photo', () => {
    expect(framingScore(CENTRED, [{ ...CENTRED }], 'upper_body')).toBeNull()
  })

  it('should score a wearer partly covered below the same wearer in the clear', () => {
    const partly = { x: CENTRED.x, y: CENTRED.y, width: CENTRED.width * 0.3, height: CENTRED.height }

    expect(framingScore(CENTRED, [partly], 'upper_body')).toBeLessThan(
      framingScore(CENTRED, [], 'upper_body') ?? -Infinity
    )
  })
})

describe('when centring a tile on the wearer', () => {
  it('should keep the middle of the photo when the wearer was not placed', () => {
    expect(tileFocus(null)).toBe('50% 50%')
  })

  it('should move the window to the side the wearer stands on, and stop at the edge of the photo', () => {
    expect(tileFocus(CENTRED)).toBe('50.0% 50%')
    expect(tileFocus({ ...CENTRED, x: 0 })).toBe('0.0% 50%')
    expect(tileFocus({ ...CENTRED, x: 0.7 })).toBe('100.0% 50%')
  })
})
