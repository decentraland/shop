import styled from '@emotion/styled'
import { theme } from '~/styles/theme'

// How much of a limited offer is gone (Figma node 3326:226545, "LIMITED OFFER STOCK").

export const Root = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
  font-family: ${theme.font.sans};
`

export const Head = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  font-size: 12px;
`

export const Label = styled.span`
  font-weight: 600;
  line-height: 1.57;
  color: ${theme.colors.muted2};
  /* Drawn in caps, like the PRICE and STOCK labels beside it. Cased here rather than in the string so a
     translation is not forced to shout in a language where that reads badly. */
  text-transform: uppercase;
  white-space: nowrap;
`

export const Claimed = styled.span`
  /* Sized here, not inherited from the head row: the same element also sits UNDER the bar, outside it. */
  font-size: 12px;
  font-weight: 400;
  line-height: 22px;
  color: ${theme.colors.softWhite};
  text-transform: lowercase;
  white-space: nowrap;
`

export const Track = styled.div`
  position: relative;
  width: 100%;
  height: 10px;
  border-radius: 100px;
  background: rgba(255, 255, 255, 0.2);
  /* The fill is a child with its own radius; clipping here keeps a full bar's ends round. */
  overflow: hidden;
`

export const Fill = styled.div`
  position: absolute;
  left: 0;
  top: 0;
  height: 10px;
  border-radius: 100px;
  background: ${theme.colors.dclRed};
  transition: width 0.3s ease;

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`
