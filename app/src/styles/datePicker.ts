import { theme } from '~/styles/theme'
import { dark } from '~/styles/darkSurface'

const { colors } = theme

const ink = {
  text: colors.softWhite,
  bg: colors.fieldBottomWashed,
  edge: dark.hairline,
  shadow: '0 24px 60px rgba(0, 0, 0, 0.45)',
  quiet: colors.glassText,
  hover: colors.glassFaint,
  selected: colors.softWhite,
  selectedText: colors.fieldBottomWashed,
  link: colors.nameLink
}

/**
 * The Shop's calendar, as a fragment to interpolate into whatever wraps a react-datepicker: the library ships CSS
 * drawn for a different product, and every Shop calendar should read as the same one. Only the popup; the field
 * stays with its own component.
 */
export const calendarPopup = `
  .react-datepicker-popper {
    z-index: 40;
  }
  .react-datepicker {
    font-family: ${theme.font.sans};
    font-size: 13px;
    color: ${ink.text};
    background: ${ink.bg};
    border: 1px solid ${ink.edge};
    border-radius: 12px;
    box-shadow: ${ink.shadow};
    overflow: hidden;
  }
  .react-datepicker__triangle {
    display: none;
  }
  .react-datepicker__header {
    background: ${ink.bg};
    border-bottom: 1px solid ${ink.edge};
    padding-top: 12px;
  }
  .react-datepicker__current-month {
    color: ${ink.text};
    font-weight: 600;
    font-size: 14px;
  }
  .react-datepicker__day-name {
    color: ${ink.quiet};
  }
  .react-datepicker__day {
    color: ${ink.text};
    border-radius: 8px;
  }
  /* The filled days keep their own fill: hover would swap it for a faint one under the same dark ink. */
  .react-datepicker__day:hover:not(
      .react-datepicker__day--selected,
      .react-datepicker__day--keyboard-selected,
      .react-datepicker__day--range-start,
      .react-datepicker__day--range-end,
      .react-datepicker__day--selecting-range-start
    ) {
    background: ${ink.hover};
  }
  .react-datepicker__day--selected,
  .react-datepicker__day--keyboard-selected {
    background: ${ink.selected};
    color: ${ink.selectedText};
  }
  .react-datepicker__day--today {
    font-weight: 700;
  }
  .react-datepicker__day--disabled {
    color: ${ink.quiet};
    opacity: 0.5;
  }
  .react-datepicker__navigation-icon::before {
    border-color: ${ink.link};
  }
  .react-datepicker__today-button {
    background: ${ink.bg};
    border-top: 1px solid ${ink.edge};
    color: ${ink.link};
    font-weight: 600;
    padding: 10px;
  }
`
