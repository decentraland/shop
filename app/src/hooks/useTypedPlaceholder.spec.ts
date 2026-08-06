import { describe, it, expect } from 'vitest'
import { framesFor, framesForAll } from './useTypedPlaceholder'

describe('the typed-placeholder frames', () => {
  it('should type a word in one character at a time', () => {
    const typing = framesFor('kenji').map(f => f.text)
    expect(typing.slice(0, 5)).toEqual(['k', 'ke', 'ken', 'kenj', 'kenji'])
  })

  it('should hold the finished word longer than any other frame', () => {
    const frames = framesFor('kenji')
    const whole = frames.filter(f => f.text === 'kenji')
    expect(whole).toHaveLength(1)
    expect(whole[0].delay).toBeGreaterThan(Math.max(...frames.filter(f => f.text !== 'kenji').map(f => f.delay)))
  })

  it('should wipe back down but never to nothing', () => {
    const texts = framesFor('kenji').map(f => f.text)
    expect(texts.at(-1)).toBe('k')
    expect(texts).not.toContain('')
  })

  /**
   * The field sizes itself to this text so ".dcl.eth" stays glued to it. An empty frame would collapse
   * that width and snap the suffix across the field between every pair of names.
   */
  it('should never emit an empty frame, whatever it is given', () => {
    for (const word of ['a', 'ab', 'nayeli', 'a-very-long-example']) {
      expect(framesFor(word).every(f => f.text.length > 0)).toBe(true)
    }
  })

  it('should erase faster than it types, the way a backspace feels', () => {
    const frames = framesFor('kenji')
    const typing = frames[0].delay
    const erasing = frames.at(-1)!.delay
    expect(erasing).toBeLessThan(typing)
  })

  it('should run one word through in about a second', () => {
    const total = framesFor('nayeli').reduce((sum, f) => sum + f.delay, 0)
    expect(total).toBeGreaterThan(800)
    expect(total).toBeLessThan(1600)
  })

  it('should chain the examples end to end', () => {
    const chained = framesForAll(['ab', 'cd'])
    expect(chained.map(f => f.text)).toEqual(['a', 'ab', 'a', 'c', 'cd', 'c'])
  })

  it('should have nothing to show for no examples, or for a blank one', () => {
    expect(framesForAll([])).toEqual([])
    expect(framesFor('')).toEqual([])
    expect(framesForAll(['', ''])).toEqual([])
  })

  it('should survive a single-character example rather than looping on it', () => {
    expect(framesFor('x').map(f => f.text)).toEqual(['x'])
  })
})
