import styled from '@emotion/styled'
import { theme } from './theme'

const { colors, radius } = theme

// Shared marketplace-style chip (rarity / category / gender tags). Base look here; consumers extend
// via `styled(Chip)` for context sizing and add their own variants. Variant selection is a plain
// `data-variant` attribute set at the call site, so it targets across the styled boundary.
export const Chip = styled.span`
  display: inline-flex;
  align-items: center;
  font-size: 11px;
  font-weight: 700;
  border-radius: ${radius.chip};
  padding: 3px 8px;
  background: ${colors.chip};
  color: #555;

  /* The rarity chip is a SOLID fill in the rarity's own colour with a white label (Figma) — the label
     never switches to dark ink, however light the fill. Call sites paint the fill inline from
     lib/rarity's rarityColor; the tint here is only what shows if one doesn't. */
  &[data-variant='rarity'] {
    background: ${colors.rarityBg};
    color: ${colors.white};
    text-transform: uppercase;
  }
  &[data-variant='icon'] {
    padding: 3px 6px;
    font-size: 13px;
  }
  &[data-variant='icon'] .ico {
    width: 14px;
    height: 14px;
    color: #444;
  }
`
