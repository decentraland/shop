import { describe, it, expect } from 'vitest'
import { CAMPAIGN_THEMES, parseCampaignTheme } from './campaignTheme'

describe('parseCampaignTheme', () => {
  it('accepts every theme this build can paint', () => {
    for (const theme of CAMPAIGN_THEMES) {
      expect(parseCampaignTheme(theme)).toBe(theme)
    }
  })

  it('forgives the casing and padding a dashboard field invites', () => {
    expect(parseCampaignTheme('Halloween')).toBe('halloween')
    expect(parseCampaignTheme('  HALLOWEEN  ')).toBe('halloween')
  })

  it('reads a theme it cannot paint as no theme rather than passing it on', () => {
    expect(parseCampaignTheme('prom')).toBeNull()
    expect(parseCampaignTheme('halloween-2026')).toBeNull()
  })

  it('treats an absent or empty value as no theme', () => {
    expect(parseCampaignTheme(undefined)).toBeNull()
    expect(parseCampaignTheme(null)).toBeNull()
    expect(parseCampaignTheme('')).toBeNull()
    expect(parseCampaignTheme('   ')).toBeNull()
  })
})
