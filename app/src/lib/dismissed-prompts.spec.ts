import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { dismissPrompt, isPromptDismissed, resetPrompt, MANA_PRICING_PROMPT } from './dismissed-prompts'

const ALICE = '0xAAA0000000000000000000000000000000000AAA'
const BOB = '0xbbb0000000000000000000000000000000000bbb'

beforeEach(() => localStorage.clear())
afterEach(() => vi.restoreAllMocks())

describe('when nothing has been dismissed', () => {
  it('should report the prompt as not dismissed', () => {
    expect(isPromptDismissed(MANA_PRICING_PROMPT, ALICE)).toBe(false)
  })
})

describe('when a prompt is dismissed for an account', () => {
  it('should report it dismissed for that account', () => {
    dismissPrompt(MANA_PRICING_PROMPT, ALICE)

    expect(isPromptDismissed(MANA_PRICING_PROMPT, ALICE)).toBe(true)
  })

  it('should survive a reload, since the choice is written to storage', () => {
    dismissPrompt(MANA_PRICING_PROMPT, ALICE)

    // Reading straight back out of storage is what a fresh page load does.
    expect(localStorage.getItem('shop:dismissed-prompts')).toContain(MANA_PRICING_PROMPT)
    expect(isPromptDismissed(MANA_PRICING_PROMPT, ALICE)).toBe(true)
  })

  it('should match the same account written in a different case', () => {
    dismissPrompt(MANA_PRICING_PROMPT, ALICE)

    expect(isPromptDismissed(MANA_PRICING_PROMPT, ALICE.toLowerCase())).toBe(true)
  })

  it('should NOT leak the dismissal to another account on the same browser', () => {
    dismissPrompt(MANA_PRICING_PROMPT, ALICE)

    expect(isPromptDismissed(MANA_PRICING_PROMPT, BOB)).toBe(false)
  })

  it('should keep other accounts’ dismissals when a second account dismisses', () => {
    dismissPrompt(MANA_PRICING_PROMPT, ALICE)
    dismissPrompt(MANA_PRICING_PROMPT, BOB)

    expect(isPromptDismissed(MANA_PRICING_PROMPT, ALICE)).toBe(true)
    expect(isPromptDismissed(MANA_PRICING_PROMPT, BOB)).toBe(true)
  })

  it('should not affect a different prompt id', () => {
    dismissPrompt(MANA_PRICING_PROMPT, ALICE)

    expect(isPromptDismissed('some-other-prompt', ALICE)).toBe(false)
  })

  it('should be idempotent', () => {
    dismissPrompt(MANA_PRICING_PROMPT, ALICE)
    dismissPrompt(MANA_PRICING_PROMPT, ALICE)

    const stored = JSON.parse(localStorage.getItem('shop:dismissed-prompts') as string)
    expect(stored[ALICE.toLowerCase()]).toEqual([MANA_PRICING_PROMPT])
  })
})

describe('when there is no account', () => {
  it('should never report a dismissal', () => {
    expect(isPromptDismissed(MANA_PRICING_PROMPT, null)).toBe(false)
    expect(isPromptDismissed(MANA_PRICING_PROMPT, undefined)).toBe(false)
    expect(isPromptDismissed(MANA_PRICING_PROMPT, '')).toBe(false)
  })

  it('should not write anything', () => {
    dismissPrompt(MANA_PRICING_PROMPT, null)

    expect(localStorage.getItem('shop:dismissed-prompts')).toBeNull()
  })
})

describe('when a dismissal is reset', () => {
  it('should report the prompt as showable again', () => {
    dismissPrompt(MANA_PRICING_PROMPT, ALICE)
    resetPrompt(MANA_PRICING_PROMPT, ALICE)

    expect(isPromptDismissed(MANA_PRICING_PROMPT, ALICE)).toBe(false)
  })

  it('should leave other accounts untouched', () => {
    dismissPrompt(MANA_PRICING_PROMPT, ALICE)
    dismissPrompt(MANA_PRICING_PROMPT, BOB)
    resetPrompt(MANA_PRICING_PROMPT, ALICE)

    expect(isPromptDismissed(MANA_PRICING_PROMPT, BOB)).toBe(true)
  })

  it('should be a no-op for a prompt that was never dismissed', () => {
    resetPrompt(MANA_PRICING_PROMPT, ALICE)

    expect(isPromptDismissed(MANA_PRICING_PROMPT, ALICE)).toBe(false)
  })

  it('should do nothing without an account', () => {
    dismissPrompt(MANA_PRICING_PROMPT, ALICE)
    resetPrompt(MANA_PRICING_PROMPT, null)

    expect(isPromptDismissed(MANA_PRICING_PROMPT, ALICE)).toBe(true)
  })
})

describe('when storage is unavailable or corrupt', () => {
  it('should treat a throwing getItem as "not dismissed"', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('private browsing')
    })

    expect(isPromptDismissed(MANA_PRICING_PROMPT, ALICE)).toBe(false)
  })

  it('should swallow a throwing setItem so the page keeps working', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded')
    })

    expect(() => dismissPrompt(MANA_PRICING_PROMPT, ALICE)).not.toThrow()
  })

  it('should ignore unparseable stored data', () => {
    localStorage.setItem('shop:dismissed-prompts', '{not json')

    expect(isPromptDismissed(MANA_PRICING_PROMPT, ALICE)).toBe(false)
  })

  it.each([['[1,2,3]'], ['"a string"'], ['null']])('should ignore a non-object payload (%s)', payload => {
    localStorage.setItem('shop:dismissed-prompts', payload)

    expect(isPromptDismissed(MANA_PRICING_PROMPT, ALICE)).toBe(false)
  })

  it('should ignore a bucket that is not an array and still be able to dismiss', () => {
    localStorage.setItem('shop:dismissed-prompts', JSON.stringify({ [ALICE.toLowerCase()]: 'nope' }))

    expect(isPromptDismissed(MANA_PRICING_PROMPT, ALICE)).toBe(false)
    dismissPrompt(MANA_PRICING_PROMPT, ALICE)
    expect(isPromptDismissed(MANA_PRICING_PROMPT, ALICE)).toBe(true)
  })

  it('should ignore a non-array bucket when resetting', () => {
    localStorage.setItem('shop:dismissed-prompts', JSON.stringify({ [ALICE.toLowerCase()]: 'nope' }))

    expect(() => resetPrompt(MANA_PRICING_PROMPT, ALICE)).not.toThrow()
  })
})
