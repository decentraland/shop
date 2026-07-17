import { describe, it, expect } from 'vitest'
import { fnv1a32, getDisplayName, getAvatarBackgroundColor } from '~/lib/avatarColor'

describe('avatar color (ADR-292 parity)', () => {
  it('hashes with FNV-1a 32-bit matching the reference offset basis for the empty string', () => {
    // FNV-1a of "" is the offset basis itself.
    expect(fnv1a32('')).toBe(0x811c9dc5)
  })

  it('is deterministic — same name → same color', () => {
    expect(getAvatarBackgroundColor('GalaxyStudio')).toBe(getAvatarBackgroundColor('GalaxyStudio'))
  })

  it('returns a well-formed #rrggbb hex', () => {
    expect(getAvatarBackgroundColor('GalaxyStudio')).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('falls back to white for an empty display name', () => {
    expect(getAvatarBackgroundColor('')).toBe('#ffffff')
  })

  describe('getDisplayName', () => {
    it('returns a claimed name as-is', () => {
      expect(getDisplayName({ name: 'Alice', hasClaimedName: true, ethAddress: '0x1234abcd' })).toBe('Alice')
    })

    it('appends #<last4> for an unclaimed name', () => {
      expect(getDisplayName({ name: 'Alice', hasClaimedName: false, ethAddress: '0x1234abcd' })).toBe('Alice#abcd')
    })

    it('strips non-alphanumeric characters (emoji, punctuation) before hashing', () => {
      expect(getDisplayName({ name: 'A🚀l-i.c e', hasClaimedName: true, ethAddress: null })).toBe('Alice')
    })

    it('returns empty when the name has no alphanumeric characters', () => {
      expect(getDisplayName({ name: '🚀🚀', hasClaimedName: false, ethAddress: '0x1234abcd' })).toBe('')
    })

    it('claimed and unclaimed names hash to different colors', () => {
      const claimed = getAvatarBackgroundColor(
        getDisplayName({ name: 'Alice', hasClaimedName: true, ethAddress: '0x1234abcd' })
      )
      const unclaimed = getAvatarBackgroundColor(
        getDisplayName({ name: 'Alice', hasClaimedName: false, ethAddress: '0x1234abcd' })
      )
      expect(claimed).not.toBe(unclaimed)
    })
  })
})
