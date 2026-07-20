import styled from '@emotion/styled'
import { theme } from '~/styles/theme'

// The shared button primitive. Base = the solid dark CTA; colour variants ride on data-variant and the
// compact size on data-size (the same hooks tests assert on — no style-only prop reaches the DOM),
// mirroring `.btn` / `.btn--*` / `.btn--sm` from index.css one-for-one. Consumers add layout-only
// tweaks (width, margin, position) by wrapping with `styled(Button)`, NOT by re-declaring variants.
export const Root = styled.button`
  border: 0;
  border-radius: ${theme.radius.btn};
  padding: 12px 22px;
  font-weight: 700;
  font-size: 15px;
  background: ${theme.colors.blackBtn};
  color: ${theme.colors.white};
  transition:
    background 0.15s ease,
    filter 0.15s ease,
    transform 0.12s ease;

  &:disabled {
    opacity: 0.55;
    cursor: default;
  }

  /* Primary CTA = Amethyst gradient (Figma "Add to cart" primary), solid purple on hover/press. */
  &[data-variant='purple'] {
    background: ${theme.gradients.amethyst};
    color: ${theme.colors.softWhite};
    text-transform: uppercase;
    letter-spacing: 0.046em;
    font-size: 13px;
  }
  &[data-variant='purple']:hover:not(:disabled) {
    background: ${theme.colors.accent};
  }
  &[data-variant='purple']:active:not(:disabled) {
    background: ${theme.colors.accent};
    transform: translateY(1px);
  }

  /* Outlined primary (Figma outlined variant): magenta border, purple label. */
  &[data-variant='outline'] {
    background: ${theme.colors.white};
    border: 2px solid ${theme.colors.magenta};
    color: ${theme.colors.accent};
    text-transform: uppercase;
    letter-spacing: 0.046em;
    font-size: 13px;
    font-weight: 600;
  }
  &[data-variant='outline']:hover:not(:disabled) {
    background: rgba(198, 64, 205, 0.06);
  }

  &[data-variant='ghost'] {
    background: ${theme.colors.white};
    border: 1px solid ${theme.colors.lineStrong};
    color: ${theme.colors.text};
  }

  &[data-size='sm'] {
    padding: 8px 12px;
    font-size: 13px;
  }
`
