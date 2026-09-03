/**
 * TEMPORARY A/B switcher for the card rarity background and the artwork size — delete with lib/rarityLab
 * once the team picks. Both axes pin to THIS TAB, so windows can sit side by side on different combos.
 */
import { useLayoutEffect } from 'react'
import { RARITY_LAB, RARITY_LAB_SIZES, labSize, labVariant } from '~/lib/rarityLab'

const bar: React.CSSProperties = {
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
}

const legend: React.CSSProperties = {
  opacity: 0.55,
  letterSpacing: '0.06em',
  textTransform: 'uppercase'
}

function pill(on: boolean): React.CSSProperties {
  return {
    cursor: 'pointer',
    border: 0,
    borderRadius: 6,
    padding: '5px 8px',
    font: 'inherit',
    textTransform: 'uppercase',
    background: on ? '#ff2d55' : 'rgba(255,255,255,0.12)',
    color: '#fff'
  }
}

export function RarityLab() {
  const variant = labVariant()
  const size = labSize()

  // Layout effect, not a plain effect: the artwork would otherwise paint once at the fallback size and
  // resize a frame later, which is exactly the thing being compared.
  useLayoutEffect(() => {
    document.documentElement.style.setProperty('--card-art', `${size}%`)
  }, [size])

  const pick = (param: string, value: string) => {
    const url = new URL(window.location.href)
    url.searchParams.set(param, value)
    window.location.href = url.toString()
  }

  return (
    <div style={bar}>
      <span style={legend}>bg</span>
      {Object.keys(RARITY_LAB).map(key => (
        <button key={key} onClick={() => pick('rg', key)} title={RARITY_LAB[key].label} style={pill(key === variant)}>
          {key}
        </button>
      ))}
      <span style={{ ...legend, marginLeft: 6 }}>art</span>
      {RARITY_LAB_SIZES.map(value => (
        <button
          key={value}
          onClick={() => pick('sz', value)}
          title={`Artwork fills ${value}% of the media band`}
          style={pill(value === size)}
        >
          {value}
        </button>
      ))}
      <span style={{ opacity: 0.7, marginLeft: 4 }}>{RARITY_LAB[variant]?.label}</span>
    </div>
  )
}
