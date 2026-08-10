import styled from '@emotion/styled'
import { theme } from '~/styles/theme'

const { colors, radius } = theme

// The multi-item additions to the shared BuyModal shell (see ~/components/BuyModal/modal.styles): a
// step counter, a scrollable line list, and the per-line quantity tag.

export const ProgressRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
`

export const Step = styled.span`
  font-size: 16px;
  line-height: 22px;
  color: ${colors.text2};
  text-transform: capitalize;
  white-space: nowrap;
`

export const Scroll = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  /* The list is the modal's elastic region: inside a viewport-capped card it gives up height first, so
     the pack picker, total and Cancel/Buy below it stay on screen without scrolling. The floor is an
     explicit ~one row because a scroll container's automatic minimum size is zero — it would otherwise
     collapse to nothing on a short screen. */
  min-height: 120px;
  max-height: 360px;
  overflow-y: auto;
  width: 100%;
  scrollbar-width: thin;
  scrollbar-color: #a2a2a2 ${colors.media};

  &::-webkit-scrollbar {
    width: 8px;
  }
  &::-webkit-scrollbar-track {
    background: ${colors.media};
    border-radius: 10px;
  }
  &::-webkit-scrollbar-thumb {
    background: #a2a2a2;
    border-radius: ${radius.btn};
  }
`

// "× N" tag beside the item name when a primary line is being bought in multiples.
export const QtyTag = styled.span`
  margin-left: 8px;
  font-size: 13px;
  font-weight: 600;
  color: ${colors.muted};
`

// Payment-rail chooser: the basket total above the rail rows.
export const ChooseTotal = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 0 12px;
  font-size: 14px;
  color: ${colors.muted};

  & strong {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 20px;
    font-weight: 700;
    color: ${colors.text};
  }
`

/* Same amber notice as the PDP's payment step — one explanation, one look, wherever the buyer meets it. */
export const HeldNotice = styled.p`
  margin: 12px 0 0;
  background: rgba(255, 162, 90, 0.3);
  border-radius: ${theme.radius.btn};
  padding: 12px 16px;
  font-family: ${theme.font.sans};
  font-size: 14px;
  line-height: 1.334;
  color: ${theme.colors.text2};
`
