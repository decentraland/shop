import styled from '@emotion/styled'
import { theme } from '~/styles/theme'

const { colors, radius } = theme

// Sidebar identity block (Figma left column): avatar half-overlapping the cover hero, username, a
// copyable account chip, and a "View profile" button. Sits above the CategoryFilter.
export const Root = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 12px;
  padding-bottom: 24px;
  /* Lift so the avatar half-overlaps the 24px-below cover hero (24px + half the 110px avatar). */
  margin-top: -79px;
  margin-bottom: 8px;
  border-bottom: 1px solid ${colors.line};
`

// Rendered as <img> (face snapshot) or <Ava as="span"> (placeholder); the per-user backdrop is inline.
export const Ava = styled.img`
  display: block;
  width: 110px;
  height: 110px;
  border-radius: 50%;
  object-fit: cover;
  border: 5px solid #fff;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.2);
  background: #ff4bed;
`

export const Name = styled.h2`
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  line-height: 1.3;
  color: ${colors.text};
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

// The short address with a copy icon; the whole chip is the copy button.
export const Account = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  border: 0;
  border-radius: ${radius.btn};
  background: none;
  color: ${colors.muted};
  font: inherit;
  font-size: 14px;
  cursor: pointer;
  transition:
    color 0.15s ease,
    background 0.15s ease;

  &:hover {
    color: ${colors.text};
    background: ${colors.media};
  }
`

// Full-width outlined pill CTA.
export const View = styled.a`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 44px;
  padding: 0 20px;
  border: 2px solid ${colors.accent};
  border-radius: ${radius.btn};
  background: transparent;
  color: ${colors.accent};
  font-weight: 600;
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.046em;
  text-decoration: none;
  transition:
    background 0.15s ease,
    color 0.15s ease;

  &:hover {
    background: ${colors.accent};
    color: #fff;
  }
`
