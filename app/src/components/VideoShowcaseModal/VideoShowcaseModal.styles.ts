import styled from '@emotion/styled'
import { dark, darkCard } from '~/styles/darkSurface'
import { theme } from '~/styles/theme'

// Showcase-video modal. Same shell as the other modals (scrim + dark rounded card + header/close), but
// the card is sized by the CLIP rather than by a form: a video that has to letterbox itself inside a
// form-width card is the one thing this dialog must not do.

export const Scrim = styled.div`
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(22, 21, 24, 0.55);
`

export const Card = styled.div`
  width: 760px;
  max-width: 100%;
  ${darkCard}
  border-radius: ${theme.radius.modal};
  padding: 12px 16px 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
`

export const Head = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding-bottom: 16px;
  border-bottom: 0.5px solid ${dark.rule};
`

export const Title = styled.h2`
  margin: 0;
  font-family: ${theme.font.sans};
  font-weight: 600;
  font-size: 20px;
  line-height: 1.6;
  color: ${theme.colors.softWhite};
`

export const Close = styled.button`
  flex: none;
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border: 0;
  background: none;
  cursor: pointer;
  color: ${theme.colors.softWhite};

  .ico {
    width: 18px;
    height: 18px;
  }
  &:focus-visible {
    outline: 2px solid ${dark.focusEdge};
    outline-offset: 2px;
  }
`

// Dark bed behind the clip: creators ship portrait and landscape captures, and the letterbox bars should
// read as part of the clip, not the card. `max-height` keeps a tall clip inside the viewport.
export const Video = styled.video`
  display: block;
  width: 100%;
  max-height: 70vh;
  border-radius: 12px;
  background: ${theme.colors.blackBtn};
`
