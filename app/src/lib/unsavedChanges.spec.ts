import { afterEach, describe, expect, it, vi } from 'vitest'
import { confirmDiscardUnsaved, hasUnsavedChanges, setUnsavedChanges } from './unsavedChanges'

afterEach(() => {
  setUnsavedChanges(null)
  vi.restoreAllMocks()
})

describe('unsavedChanges', () => {
  it('passes without asking when nothing is unsaved', () => {
    const confirm = vi.spyOn(window, 'confirm')
    expect(hasUnsavedChanges()).toBe(false)
    expect(confirmDiscardUnsaved()).toBe(true)
    expect(confirm).not.toHaveBeenCalled()
  })

  it('asks with the registered message and returns the answer', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    setUnsavedChanges('Discard?')
    expect(hasUnsavedChanges()).toBe(true)
    expect(confirmDiscardUnsaved()).toBe(false)
    expect(confirm).toHaveBeenCalledWith('Discard?')
    confirm.mockReturnValue(true)
    expect(confirmDiscardUnsaved()).toBe(true)
  })
})
