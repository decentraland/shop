import styled from '@emotion/styled'
import { noForward } from '~/styles/emotion'
import { theme } from '~/styles/theme'

// Trigger wrapper. `block` makes it stretch (used by full-width triggers like the Make-an-offer button);
// otherwise it hugs the trigger so an inline icon keeps its size.
export const Wrap = styled('span', noForward('block'))<{ block?: boolean }>`
  position: relative;
  display: ${({ block }) => (block ? 'flex' : 'inline-flex')};
  ${({ block }) => (block ? 'width: 100%;' : '')}
`

// Dark bubble centered over/under the trigger. Shown by toggling data-open (driven by React state so we
// can also fire the onShow callback), not by :hover, so the analytics event fires reliably.
export const Bubble = styled('span', noForward('placement'))<{ placement: 'top' | 'bottom' }>`
  position: absolute;
  left: 50%;
  z-index: 30;
  ${({ placement }) => (placement === 'top' ? 'bottom: calc(100% + 8px);' : 'top: calc(100% + 8px);')}
  transform: translateX(-50%) translateY(${({ placement }) => (placement === 'top' ? '4px' : '-4px')});
  width: max-content;
  max-width: 240px;
  padding: 8px 10px;
  border-radius: 8px;
  background: ${theme.colors.text};
  color: #fff;
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
  transition:
    opacity 0.14s ease,
    transform 0.14s ease;

  &[data-open] {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }

  &::after {
    content: '';
    position: absolute;
    left: 50%;
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
