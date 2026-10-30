import { theme } from '~/styles/theme'

const { colors } = theme

// The dark dialog surface the discounts and studio-gift modals established: a washed-purple card on the page field,
// panels one step lighter than it, hairline edges. Every dialog, popover and panel that floats over the field draws
// from here so they stay one family.
export const dark = {
  /** A panel inside the card, one step lighter than it. */
  raised: 'rgba(255, 255, 255, 0.06)',
  hairline: 'rgba(255, 255, 255, 0.12)',
  /** The rule under a dialog's title and over its pinned actions. */
  rule: 'rgba(255, 255, 255, 0.3)',
  focusEdge: 'rgba(255, 255, 255, 0.4)',
  // dclRed reads at 4:1 on the card and lower on its panels; error words need 4.5:1, so they use this lighter red.
  errorText: '#ff8fa3'
}

/**
 * The card itself, plus the overrides its children need: the credits mark and the light-surface button variants are
 * drawn near-black for white cards, and would vanish on this one.
 */
export const darkCard = `
  background: ${colors.fieldBottomWashed};
  color: ${colors.softWhite};
  border: 1px solid ${dark.hairline};
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.45);

  .ccy-mark,
  .ccy {
    color: ${colors.softWhite};
  }

  /* The global text utilities (index.css) are tuned for white surfaces. */
  .muted {
    color: ${colors.glassText};
  }
  .link {
    color: ${colors.nameLink};
  }
  .error {
    color: ${dark.errorText};
  }
  .error-notice {
    border-color: rgba(255, 45, 85, 0.5);
    background: rgba(255, 45, 85, 0.16);
    color: ${dark.errorText};
  }
  .error-notice__msg {
    color: ${colors.softWhite};
  }

  && [data-variant='outline'],
  && [data-variant='white'] {
    background: transparent;
    border: 0.5px solid ${colors.softWhite};
    color: ${colors.softWhite};
  }
  && [data-variant='outline']:hover:not(:disabled),
  && [data-variant='outline']:active:not(:disabled),
  && [data-variant='white']:hover:not(:disabled),
  && [data-variant='white']:active:not(:disabled) {
    background: ${colors.glassFaint};
    border-color: ${colors.softWhite};
    color: ${colors.softWhite};
  }
  && [data-variant='ghost'] {
    background: transparent;
    border: 1px solid ${dark.hairline};
    color: ${colors.softWhite};
  }
  && [data-variant='ghost']:hover:not(:disabled),
  && [data-variant='ghost']:active:not(:disabled) {
    background: ${colors.glassFaint};
  }
`

/** A text field on the card. */
export const darkField = `
  background: ${dark.raised};
  border: 1px solid ${dark.hairline};
  color: ${colors.softWhite};

  &::placeholder {
    color: ${colors.gray4};
    opacity: 1;
  }
  &:focus,
  &:focus-within {
    border-color: ${dark.focusEdge};
  }
  &[aria-invalid='true'] {
    border-color: ${colors.dclRed};
  }
`
