/**
 * TEMPORARY A/B switcher for the card rarity background — delete with lib/rarityLab once the team picks.
 * Pins a variant to THIS TAB, so two windows can sit side by side on the two treatments.
 */
import { RARITY_LAB, labVariant } from '~/lib/rarityLab'

export function RarityLab() {
  const active = labVariant()
  const pick = (key: string) => {
    const url = new URL(window.location.href)
    url.searchParams.set('rg', key)
    window.location.href = url.toString()
  }
  return (
    <div
      style={{
        position: 'fixed',
        left: 12,
        bottom: 12,
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '8px 10px',
        borderRadius: 10,
        background: 'rgba(20, 16, 28, 0.92)',
        border: '1px solid rgba(255,255,255,0.18)',
        boxShadow: '0 6px 24px rgba(0,0,0,0.45)',
        font: '600 12px/1 Inter, system-ui, sans-serif',
        color: '#fff'
      }}
    >
      <span style={{ opacity: 0.55, letterSpacing: '0.06em', textTransform: 'uppercase' }}>rarity</span>
      {Object.keys(RARITY_LAB).map(key => (
        <button
          key={key}
          onClick={() => pick(key)}
          title={RARITY_LAB[key].label}
          style={{
            cursor: 'pointer',
            border: 0,
            borderRadius: 6,
            padding: '5px 8px',
            font: 'inherit',
            textTransform: 'uppercase',
            background: key === active ? '#ff2d55' : 'rgba(255,255,255,0.12)',
            color: '#fff'
          }}
        >
          {key}
        </button>
      ))}
      <span style={{ opacity: 0.7, marginLeft: 4 }}>{RARITY_LAB[active]?.label}</span>
    </div>
  )
}
