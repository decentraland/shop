import styled from '@emotion/styled'
import { theme } from '~/styles/theme'
import * as M from '~/components/BuyModal/modal.styles'

// The tile, plus the anchor its "Recommended" badge hangs off.
export const PackTile = styled(M.Pack)`
  position: relative;
`

/**
 * The pill that marks the pack which actually closes the gap. Same treatment as the Get Credits grid's
 * badge (gradients.flare on the card's top edge), at the size these smaller tiles take.
 */
export const PackBadge = styled.span`
  position: absolute;
  top: -12px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 2;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 12px 4px 8px;
  border-radius: ${theme.radius.pill};
  background: ${theme.gradients.flare};
  font-family: ${theme.font.sans};
  font-size: 12px;
  font-weight: 500;
  line-height: 18px;
  color: ${theme.colors.white};
  white-space: nowrap;

  .ico {
    width: 16px;
    height: 16px;
  }
`

/**
 * A two-by-two grid whenever a badge is on show, at every width.
 *
 * The shared row wraps to fit, which is right in the wide item modal. The NAME modal's card is 560px, so
 * the same row puts three tiles on top and strands the fourth alone on a full-width line — and the row gap
 * is also what the badge hangs into.
 */
export const GridPacks = styled(M.Packs)`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 28px 12px;

  ${theme.media.maxWidth('mobile')} {
    gap: 24px 12px;
  }
`
