import styled from '@emotion/styled'
import { theme } from '~/styles/theme'

// "Make an offer" CTA (Figma 1182-203305): full-width, 2px magenta outline, purple label, uppercase.
// Presented but not yet functional (bids are a future contracts epic), so it reads as disabled. We use
// aria-disabled rather than the native `disabled` attribute so it stays hoverable/focusable and the
// "coming soon" tooltip (+ its analytics event) still fires.
export const Button = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  height: 40px;
  padding: 0 12px;
  border: 2px solid #c640cd;
  border-radius: 8px;
  background: transparent;
  color: ${theme.colors.accent};
  font-family: ${theme.font.sans};
  font-weight: 600;
  font-size: 15px;
  line-height: 24px;
  letter-spacing: 0.46px;
  text-transform: uppercase;
  cursor: not-allowed;
  opacity: 0.55;
  transition: opacity 0.15s ease;

  &:hover,
  &:focus-visible {
    opacity: 0.75;
  }
  &:focus-visible {
    outline: 2px solid ${theme.colors.accent};
    outline-offset: 2px;
  }
`
