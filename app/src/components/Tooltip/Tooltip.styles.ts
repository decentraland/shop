import styled from '@emotion/styled'
import { noForward } from '~/styles/emotion'
import { theme } from '~/styles/theme'

// Trigger wrapper. `block` makes it stretch (used by full-width triggers like the Make-an-offer button);
// otherwise it hugs the trigger so an inline icon keeps its size.
export const Wrap = styled('span', noForward('block'))<{ block?: boolean }>`
  display: ${({ block }) => (block ? 'flex' : 'inline-flex')};
  ${({ block }) => (block ? 'width: 100%;' : '')}
`

// Dark bubble centered over/under the trigger. Shown by toggling data-open (driven by React state so we
// can also fire the onShow callback), not by :hover, so the analytics event fires reliably.
// Portalled to <body> and placed in VIEWPORT coordinates (left/top come from the component): as an
// absolute child of the trigger, a scrolling ancestor clipped it. `top` is the edge nearest the trigger,
// so the top placement lifts itself by its own height. The arrow is offset by --tooltip-arrow so it
// still points at the trigger when the bubble is clamped away from a viewport edge.
export const Bubble = styled('span', noForward('placement'))<{ placement: 'top' | 'bottom' }>`
  position: fixed;
  z-index: ${theme.z.tooltip};
  width: max-content;
  max-width: min(240px, calc(100vw - 32px));
  padding: 8px 10px;
  border-radius: 8px;
  background: ${theme.colors.text};
  color: ${theme.colors.white};
  font-family: ${theme.font.sans};
  font-size: 12px;
  font-weight: 500;
  line-height: 1.4;
  text-align: center;
  text-transform: none;
  letter-spacing: 0;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.18);
  opacity: 0;
  pointer-events: none;
  transform: translate(-50%, ${({ placement }) => (placement === 'top' ? 'calc(-100% + 4px)' : '-4px')});
  transition:
    opacity 0.14s ease,
    transform 0.14s ease;

  &[data-open] {
    opacity: 1;
    transform: translate(-50%, ${({ placement }) => (placement === 'top' ? '-100%' : '0')});
  }

  &::after {
    content: '';
    position: absolute;
    left: calc(50% + var(--tooltip-arrow, 0px));
    transform: translateX(-50%);
    border: 5px solid transparent;
    ${({ placement }) =>
      placement === 'top'
        ? `top: 100%; border-top-color: ${theme.colors.text};`
        : `bottom: 100%; border-bottom-color: ${theme.colors.text};`}
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`
