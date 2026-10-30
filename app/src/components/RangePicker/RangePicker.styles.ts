import styled from '@emotion/styled'
import { theme } from '~/styles/theme'
import { calendarPopup } from '~/styles/datePicker'
import { dark, darkCard, darkField } from '~/styles/darkSurface'

export const Root = styled.div`
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 1;
  display: flex;
  flex-direction: column;
  max-width: calc(100vw - 32px);
  ${darkCard}
  border-radius: 12px;
  overflow: hidden;

  ${calendarPopup}

  &[data-stretch] {
    left: 0;
    right: 0;
    /* A screen shorter than the calendar scrolls it rather than cutting its presets off. */
    max-height: calc(100vh - 16px);
    overflow-y: auto;

    /* One month in a panel wider than it: centred in the space beside the presets. */
    .react-datepicker {
      flex: 1;
    }
  }

  .react-datepicker {
    border: 0;
    box-shadow: none;
    background: transparent;
    border-radius: 0;
    display: flex;
    justify-content: center;
  }
  .react-datepicker__month-container + .react-datepicker__month-container {
    border-left: 1px solid ${dark.hairline};
  }
  .react-datepicker__day {
    width: 2rem;
    line-height: 2rem;
    margin: 0.1rem 0;
    border-radius: 0;
  }
  .react-datepicker__day--in-range,
  .react-datepicker__day--in-selecting-range {
    background: ${theme.colors.glassStrong};
    color: ${theme.colors.softWhite};
  }
  .react-datepicker__day--range-start,
  .react-datepicker__day--range-end,
  .react-datepicker__day--selecting-range-start,
  .react-datepicker__day--selected {
    background: ${theme.colors.softWhite};
    color: ${theme.colors.fieldBottomWashed};
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

  &[data-selects] {
    select {
      height: 28px;
      padding: 0 6px;
      ${darkField}
      border-radius: 8px;
      font-family: ${theme.font.sans};
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
    }
    /* The native option list is drawn by the OS on a light sheet, so its rows keep dark ink. */
    option {
      background: ${theme.colors.white};
      color: ${theme.colors.text};
    }
    select:focus-visible {
      outline: 2px solid ${theme.colors.softWhite};
      outline-offset: 1px;
    }
    .react-datepicker__navigation:focus-visible {
      outline: 2px solid ${theme.colors.softWhite};
      outline-offset: -2px;
    }

    /* One month on a phone, so nothing to keep level with, and a finger needs the taller target. */
    ${theme.media.maxWidth('sm')} {
      select {
        height: 40px;
      }
    }
  }
`

/** Holds the first month's selects, or a later month's title, at one height so the day grids stay level. */
export const HeaderRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 28px;
  margin: 0;

  ${theme.media.maxWidth('sm')} {
    height: 40px;
  }
`

export const Body = styled.div`
  display: flex;

  ${theme.media.maxWidth('sm')} {
    flex-direction: column;
  }
`

export const Presets = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: none;
  min-width: 132px;
  padding: 10px 8px;
  border-right: 1px solid ${dark.hairline};

  ${theme.media.maxWidth('sm')} {
    flex-direction: row;
    flex-wrap: wrap;
    gap: 6px;
    min-width: 0;
    border-right: 0;
    border-bottom: 1px solid ${dark.hairline};
  }
`

export const Preset = styled.button`
  min-height: 36px;
  padding: 0 12px;
  border: 0;
  border-radius: ${theme.radius.btn};
  background: transparent;
  color: ${theme.colors.softWhite};
  font-family: ${theme.font.sans};
  font-size: 13px;
  font-weight: 600;
  text-align: left;
  white-space: nowrap;
  cursor: pointer;

  &:hover {
    background: ${theme.colors.glassFaint};
  }
  &[aria-pressed='true'] {
    background: ${theme.colors.glassStrong};
  }
  &:focus-visible {
    outline: 2px solid ${theme.colors.softWhite};
    outline-offset: 2px;
  }

  ${theme.media.maxWidth('sm')} {
    min-height: 44px;
    border: 1px solid ${dark.hairline};
    border-radius: ${theme.radius.pill};
  }
`

export const Foot = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border-top: 0.5px solid ${dark.rule};
  font-family: ${theme.font.sans};
  font-size: 13px;
  color: ${theme.colors.glassText};

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
  border: 0.5px solid ${theme.colors.softWhite};
  background: transparent;
  color: ${theme.colors.softWhite};
  font-family: ${theme.font.sans};
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;

  &:not([data-variant='primary']):hover:not(:disabled) {
    background: ${theme.colors.glassFaint};
  }
  &[data-variant='primary'] {
    border-color: transparent;
    background: ${theme.gradients.buyBtn};
    color: ${theme.colors.white};
  }
  &:disabled {
    opacity: 0.45;
    cursor: default;
  }
  &:focus-visible {
    outline: 2px solid ${theme.colors.softWhite};
    outline-offset: 2px;
  }
`
