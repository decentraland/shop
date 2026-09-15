import styled from '@emotion/styled'
import { Icon } from '~/components/Icon'
import { theme } from '~/styles/theme'

// The item page's sale timer (Figma node 3326:226545): a pink chip carrying a clock, "Ends in", and the
// window itself in bold. Same fill and ink as the discount tag, so the two read as one family.

export const Root = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: 6px;
  background: ${theme.colors.saleTag};
  color: ${theme.colors.saleTagInk};
  font-family: ${theme.font.sans};
  white-space: nowrap;
`

export const Clock = styled(Icon)`
  width: 16px;
  height: 16px;
  flex: none;
`

/*
 * 16px line box, not the design's 12px.
 *
 * Figma's 12px leading describes a text box, and CSS centres that BOX — but a 14px glyph in a 12px line box
 * overflows it asymmetrically (the descender needs more room than the ascender), so the ink landed a pixel
 * above centre while every box measured dead centre. Matching the clock's 16px gives all three children the
 * same line box, keeps the chip at its designed 24px, and centres what is actually visible.
 */
export const Lead = styled.span`
  font-size: 12px;
  line-height: 16px;
  font-weight: 500;
`

/** The window itself — the part the eye lands on, so it carries the weight. */
export const Left = styled.b`
  font-size: 14px;
  line-height: 16px;
  font-weight: 700;
`
