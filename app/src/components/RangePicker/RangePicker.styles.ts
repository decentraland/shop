import styled from '@emotion/styled'
import { theme } from '~/styles/theme'
import { calendarPopup } from '~/styles/datePicker'

export const Root = styled.div`
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 40;
  display: flex;
  flex-direction: column;
  max-width: calc(100vw - 32px);
  background: ${theme.colors.white};
  border-radius: 12px;
  box-shadow: 0 12px 32px rgba(22, 21, 24, 0.24);
  overflow: hidden;

  ${calendarPopup}

  .react-datepicker {
    border: 0;
    box-shadow: none;
    border-radius: 0;
    display: flex;
    justify-content: center;
  }
  .react-datepicker__month-container + .react-datepicker__month-container {
    border-left: 1px solid rgba(22, 21, 24, 0.1);
  }
  .react-datepicker__day {
    width: 2rem;
    line-height: 2rem;
    margin: 0.1rem 0;
    border-radius: 0;
  }
  .react-datepicker__day--in-range,
  .react-datepicker__day--in-selecting-range {
    background: rgba(105, 31, 169, 0.12);
    color: ${theme.colors.text};
  }
  .react-datepicker__day--range-start,
  .react-datepicker__day--range-end,
  .react-datepicker__day--selecting-range-start,
  .react-datepicker__day--selected {
    background: ${theme.colors.accent};
    color: ${theme.colors.white};
  }
  .react-datepicker__day--range-start,
  .react-datepicker__day--selecting-range-start {
    border-radius: 8px 0 0 8px;
  }
  .react-datepicker__day--range-end {
    border-radius: 0 8px 8px 0;
  }
  .react-datepicker__day--range-start.react-datepicker__day--range-end {
    border-radius: 8px;
  }
  .react-datepicker__day--outside-month {
    visibility: hidden;
  }
`

export const Foot = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border-top: 1px solid rgba(22, 21, 24, 0.1);
  font-family: ${theme.font.sans};
  font-size: 13px;
  color: ${theme.colors.text};

  ${theme.media.maxWidth('mobile')} {
    font-size: 12px;
  }
`

export const Actions = styled.div`
  display: flex;
  gap: 8px;
`

export const Btn = styled.button`
  min-height: 36px;
  padding: 0 14px;
  border-radius: ${theme.radius.btn};
  border: 1px solid rgba(22, 21, 24, 0.16);
  background: ${theme.colors.white};
  color: ${theme.colors.text};
  font-family: ${theme.font.sans};
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;

  &[data-variant='primary'] {
    border-color: ${theme.colors.accent};
    background: ${theme.colors.accent};
    color: ${theme.colors.white};
  }
  &:disabled {
    opacity: 0.45;
    cursor: default;
  }
  &:focus-visible {
    outline: 2px solid ${theme.colors.accent};
    outline-offset: 2px;
  }
`
