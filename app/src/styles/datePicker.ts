import { theme } from '~/styles/theme'

/**
 * The Shop's calendar, as a fragment to interpolate into whatever wraps a react-datepicker.
 *
 * The library ships its own CSS (imported once per consumer) drawn for a different product; this repaints
 * the popup white and on-brand. It lives here rather than in one modal's styles because two modals now
 * open a calendar, and a seller meeting one treatment in the sell flow and another in the discount flow
 * would be reading two different products.
 *
 * Only the POPUP. The field itself stays with its own component: a date field is sized by the row it sits
 * in, and those rows disagree — one is a full-width input, the other a chip in a wrapping row.
 */
export const calendarPopup = `
  /* ---- Calendar popup: white / on-brand (override react-datepicker defaults) ---- */
  .react-datepicker-popper {
    z-index: 40;
  }
  .react-datepicker {
    font-family: ${theme.font.sans};
    font-size: 13px;
    color: ${theme.colors.text};
    background: ${theme.colors.white};
    border: 1px solid rgba(22, 21, 24, 0.1);
    border-radius: 12px;
    box-shadow: 0 12px 32px rgba(22, 21, 24, 0.14);
    overflow: hidden;
  }
  .react-datepicker__triangle {
    display: none;
  }
  .react-datepicker__header {
    background: ${theme.colors.white};
    border-bottom: 1px solid rgba(22, 21, 24, 0.1);
    padding-top: 12px;
  }
  .react-datepicker__current-month {
    color: ${theme.colors.text};
    font-weight: 600;
    font-size: 14px;
  }
  .react-datepicker__day-name {
    color: ${theme.colors.muted2};
  }
  .react-datepicker__day {
    color: ${theme.colors.text};
    border-radius: 8px;
  }
  .react-datepicker__day:hover {
    background: rgba(105, 31, 169, 0.1);
  }
  .react-datepicker__day--selected,
  .react-datepicker__day--keyboard-selected {
    background: ${theme.colors.accent};
    color: ${theme.colors.white};
  }
  .react-datepicker__day--today {
    font-weight: 700;
  }
  .react-datepicker__day--disabled {
    color: ${theme.colors.muted2};
    opacity: 0.5;
  }
  .react-datepicker__navigation-icon::before {
    border-color: ${theme.colors.accent};
  }
  .react-datepicker__today-button {
    background: ${theme.colors.white};
    border-top: 1px solid rgba(22, 21, 24, 0.1);
    color: ${theme.colors.accent};
    font-weight: 600;
    padding: 10px;
  }
`
