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

  &[data-variant='rarity'] {
    background: ${colors.rarityBg};
    color: ${colors.rarity};
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
