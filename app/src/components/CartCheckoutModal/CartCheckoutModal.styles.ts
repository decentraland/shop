import styled from '@emotion/styled'
import { theme } from '~/styles/theme'
import { CurrencyIcon } from '~/components/CurrencyIcon'

const { colors, radius } = theme

// The multi-item additions to the shared `.buy-modal__*` shell (index.css): a step counter, a
// scrollable line list, and the multi-item "purchase complete" list. Cart-specific breakpoint.
const mobile = '@media (max-width: 600px)'

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
  gap: 8px;
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

// "Purchase complete" multi-item list: compact rows with a red check overlay + dividers.
export const Done = styled.div`
  display: flex;
  flex-direction: column;
  border: 1px solid ${colors.muted2};
  border-radius: 16px;
  padding: 24px;

  ${mobile} {
    padding: 16px;
  }
`

export const DoneScroll = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 320px;
  overflow-y: auto;
`

export const DoneRow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;

  & + & {
    border-top: 1px solid ${colors.line};
    padding-top: 12px;
  }
`

export const DoneThumb = styled.div`
  position: relative;
  flex-shrink: 0;
  width: 96px;
  height: 96px;
  background: ${colors.media};
  border: 0.13px solid ${colors.muted2};
  border-radius: ${radius.btn};
  display: grid;
  place-items: center;
  overflow: hidden;

  & img {
    width: 83%;
    height: 83%;
    object-fit: contain;
  }

  ${mobile} {
    width: 72px;
    height: 72px;
  }
`

export const DoneCheck = styled.span`
  position: absolute;
  top: 6px;
  left: 6px;
  width: 20px;
  height: 20px;
  border-radius: ${radius.chip};
  background: ${colors.dclRed};
  display: grid;
  place-items: center;
`

export const DoneInfo = styled.div`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px;
  overflow: hidden; /* keep long, unbreakable creator addresses from widening the modal */
`

export const DoneName = styled.div`
  font-size: 20px;
  font-weight: 600;
  line-height: 1.4;
  color: ${colors.text};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  ${mobile} {
    font-size: 16px;
  }
`

export const DoneCreator = styled.div`
  font-size: 10px;
  line-height: 1.43;
  color: ${colors.muted};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

export const DonePrice = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  padding-right: 4px;
  font-size: 24px;
  font-weight: 600;
  color: ${colors.text2};

  ${mobile} {
    font-size: 20px;
  }
`

export const DonePriceIco = styled(CurrencyIcon)`
  width: 24px;
  height: 24px;
  background: ${colors.accent};

  ${mobile} {
    width: 20px;
    height: 20px;
  }
`

// The multi-item success banner mirrors BuyModal's success with a wider list layout. It composes the
// still-global `.buy-modal__*` shell classes, so the tweaks target those as descendants.
export const DoneBody = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;

  /* Success banner: check to the LEFT of the text on desktop, stacked on mobile. */
  & .buy-modal__success {
    flex-direction: row;
    align-items: center;
    gap: 24px;
    padding: 16px 24px;
  }
  & .buy-modal__success-text {
    text-align: left;
    font-size: 18px;
  }
  /* Let the two CTAs shrink so their min-content can't widen the modal past the viewport. */
  & .buy-modal__btn {
    min-width: 0;
  }

  ${mobile} {
    & .buy-modal__success {
      flex-direction: column;
      gap: 12px;
      padding: 16px;
    }
    & .buy-modal__success-text {
      text-align: center;
    }
  }
`
