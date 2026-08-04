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
  text-decoration: none; /* so an as=Link / as=a element renders without an underline; no-op on button */
  transition:
    background 0.15s ease,
    filter 0.15s ease,
    transform 0.12s ease;

  &:disabled {
    opacity: 0.55;
    cursor: default;
  }

  /* Primary CTA = Amethyst gradient (Figma "Add to cart" primary), solid purple on hover/press. The
     solid state is a ::before overlay faded in over the gradient — swapping the background itself from
     gradient to flat isn't animatable, so transitioning it flashed dark mid-hover. */
  &[data-variant='purple'] {
    position: relative;
    /* Own stacking context so the z-index:-1 overlay sits above THIS background but below the label. */
    isolation: isolate;
    background: ${theme.gradients.amethyst};
    color: ${theme.colors.softWhite};
    text-transform: uppercase;
    letter-spacing: 0.046em;
    font-size: 13px;
  }
  &[data-variant='purple']::before {
    content: '';
    position: absolute;
    inset: 0;
    z-index: -1;
    border-radius: inherit;
    background: ${theme.colors.accent};
    opacity: 0;
    transition: opacity 0.15s ease;
    pointer-events: none;
  }
  &[data-variant='purple']:hover:not(:disabled)::before,
  &[data-variant='purple']:active:not(:disabled)::before {
    opacity: 1;
  }
  &[data-variant='purple']:active:not(:disabled) {
    transform: translateY(1px);
  }
  /* Figma primary disabled: flat 20% purple fill (not a dimmed gradient). */
  &[data-variant='purple']:disabled {
    background: rgba(105, 31, 169, 0.2);
    opacity: 1;
  }

  /* Outlined primary (Figma outlined variant): magenta border + purple label; fills solid purple on
     hover/press. */
  &[data-variant='outline'] {
    background: ${theme.colors.white};
    border: 2px solid ${theme.colors.magenta};
    color: ${theme.colors.accent};
    text-transform: uppercase;
    letter-spacing: 0.046em;
    font-size: 13px;
    font-weight: 600;
  }
  &[data-variant='outline']:hover:not(:disabled),
  &[data-variant='outline']:active:not(:disabled) {
    background: ${theme.colors.accent};
    border-color: ${theme.colors.accent};
    color: ${theme.colors.softWhite};
  }
  &[data-variant='outline']:active:not(:disabled) {
    transform: translateY(1px);
  }
  /* Figma outlined disabled: the whole control at 30% opacity. */
  &[data-variant='outline']:disabled {
    opacity: 0.3;
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
