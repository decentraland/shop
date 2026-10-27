import styled from '@emotion/styled'
import { theme } from '~/styles/theme'

// The shared button primitive. Base = the solid dark CTA; colour variants ride on data-variant and the
// compact size on data-size (the same hooks tests assert on — no style-only prop reaches the DOM). Consumers
// add layout-only tweaks (width, margin, position) by wrapping with `styled(Button)`, NOT by re-declaring variants.
export const Root = styled.button`
  border: 0;
  border-radius: ${theme.radius.cta};
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

  /* Primary CTA: the "BUY Button" gradient, flattening to solid red on hover/press. The hover sets
     background-image rather than background, because a gradient cannot interpolate to a plain colour and
     swapping the whole background blanks the button mid-transition. */
  &[data-variant='primary'] {
    background: ${theme.gradients.buyBtn};
    color: ${theme.colors.white};
    text-transform: uppercase;
    letter-spacing: 0.46px;
    font-size: 13px;
    font-weight: 600;
  }
  @media (hover: hover) {
    &[data-variant='primary']:hover:not(:disabled) {
      background-image: linear-gradient(${theme.colors.dclRed}, ${theme.colors.dclRed});
    }
  }
  &[data-variant='primary']:active:not(:disabled) {
    background-image: linear-gradient(${theme.colors.dclRed}, ${theme.colors.dclRed});
  }
  &[data-variant='primary']:active:not(:disabled) {
    transform: translateY(1px);
  }
  &[data-variant='primary']:disabled {
    opacity: 0.5;
  }

  /* Outlined, for light surfaces (modals, drawers): a soft-black hairline that fills soft-black on
     hover/press and flips its label white. */
  &[data-variant='outline'] {
    background: transparent;
    border: 0.5px solid ${theme.colors.text};
    color: ${theme.colors.text};
    text-transform: uppercase;
    letter-spacing: 0.46px;
    font-size: 13px;
    font-weight: 600;
  }
  &[data-variant='outline']:hover:not(:disabled),
  &[data-variant='outline']:active:not(:disabled) {
    background: ${theme.colors.text};
    color: ${theme.colors.white};
  }
  &[data-variant='outline']:active:not(:disabled) {
    transform: translateY(1px);
  }
  &[data-variant='outline']:disabled {
    opacity: 0.5;
  }

  /* Secondary, for dark surfaces and artwork: a translucent white fill that turns soft-white with a dark
     label on hover/press. */
  &[data-variant='glass'] {
    background: ${theme.colors.glass};
    color: ${theme.colors.softWhite};
    text-transform: uppercase;
    letter-spacing: 0.46px;
    font-size: 13px;
    font-weight: 600;
  }
  @media (hover: hover) {
    &[data-variant='glass']:hover:not(:disabled) {
      background: ${theme.colors.softWhite};
      color: ${theme.colors.text2};
    }
  }
  &[data-variant='glass']:active:not(:disabled) {
    background: ${theme.colors.softWhite};
    color: ${theme.colors.text2};
  }
  &[data-variant='glass']:active:not(:disabled) {
    transform: translateY(1px);
  }
  &[data-variant='glass']:disabled {
    opacity: 0.5;
  }

  /* Primary red — the flat Primary fill, for a CTA that is already the one thing to do on the surface it
     sits on (the migration dock). The orange→red gradient treatment stays with GET / BUY CREDITS, which
     have to stand out from OTHER ctas around them. */
  &[data-variant='red'] {
    background: ${theme.colors.dclRed};
    color: ${theme.colors.white};
    text-transform: uppercase;
    letter-spacing: 0.046em;
    font-size: 13px;
  }
  &[data-variant='red']:hover:not(:disabled),
  &[data-variant='red']:active:not(:disabled) {
    filter: brightness(0.94);
  }
  &[data-variant='red']:active:not(:disabled) {
    transform: translateY(1px);
  }

  /* Over-media CTA (Figma outfit card): solid white with the dark label, for buttons sitting on artwork. */
  &[data-variant='white'] {
    background: ${theme.colors.white};
    color: ${theme.colors.text};
    text-transform: uppercase;
    letter-spacing: 0.046em;
    font-size: 13px;
  }
  &[data-variant='white']:hover:not(:disabled) {
    background: ${theme.colors.panel};
  }
  &[data-variant='white']:active:not(:disabled) {
    background: ${theme.colors.panel};
    transform: translateY(1px);
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
